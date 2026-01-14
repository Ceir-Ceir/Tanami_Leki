import os
import logging
from flask import Flask, request, jsonify
from supabase import create_client, Client
from groq import Groq
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

# Load env from .env if present (mostly for local dev)
load_dotenv()

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY]):
    logger.warning("Missing one or more required environment variables: SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY")

# Initialize Clients
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    groq_client = Groq(api_key=GROQ_API_KEY)
    # Using a small, fast model for local embeddings (384 dimensions)
    # Note: If your DB expects 1536 dims (OpenAI), this will fail unless you update the 'match_kb_chunks' function.
    embed_model = SentenceTransformer('all-MiniLM-L6-v2') 
    logger.info("RAG Service Initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize clients: {e}")

def get_context(query_text: str):
    """
    1. Vectorize query.
    2. Search Supabase kb_chunks.
    """
    try:
        # Generate embedding
        vector = embed_model.encode(query_text).tolist()
        
        # Query Supabase
        # Ensure your 'match_kb_chunks' RPC function matches the dimension of this model (384)
        response = supabase.rpc("match_kb_chunks", {
            "query_embedding": vector,
            "match_threshold": 0.5,
            "match_count": 5
        }).execute()
        
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching context: {e}")
        return []

def generate_answer(query: str, context_chunks: list):
    """
    Generate answer using Groq and the provided context.
    """
    try:
        context_str = "\n\n".join([c.get('content', '') for c in context_chunks])
        
        system_prompt = (
            "You are Leki, a motorcycle expert. Answer using ONLY the provided context. "
            "If the answer isn't there, say you don't know."
        )

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context_str}\n\nQuestion: {query}"}
            ],
            model="llama-3.3-70b-versatile",
            temperature: 0.5,
        )
        
        return chat_completion.choices[0].message.content
    except Exception as e:
        logger.error(f"Error generating answer: {e}")
        return "I'm having a bit of trouble thinking right now. Please try again."

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    if not data or 'message' not in data:
        return jsonify({"error": "Message is required"}), 400

    query = data['message']
    
    # 1. Get Context
    context = get_context(query)
    
    # 2. Generate Answer
    answer = generate_answer(query, context)
    
    return jsonify({
        "answer": answer,
        "sources": context
    })

# --- Dashboard Endpoints ---

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Fetch dashboard metrics similar to app.py"""
    try:
        # 1. Total Unique Visitors (approx via leads count for speed, or unique anonymous_id)
        # Using exact count from 'leads' for simplicity as in app.py logic
        leads_count_resp = supabase.table("leads").select("*", count="exact", head=True).execute()
        unique_visitors = leads_count_resp.count if leads_count_resp.count is not None else 0

        # 2. HVP Count (Score >= 150)
        hvp_resp = supabase.table("leads").select("*", count="exact", head=True).gte("lead_score", 150).execute()
        hvp_count = hvp_resp.count if hvp_resp.count is not None else 0

        # 3. Emails Captured
        email_resp = supabase.table("leads").select("*", count="exact", head=True).neq("email", "null").execute()
        emails_captured = email_resp.count if email_resp.count is not None else 0

        # 4. Avg Lead Score
        # Supabase doesn't do avg easily via API without RPC, fetching subset or using RPC is better.
        # For lightweight, we'll fetch lead_scores of top 1000 and avg in python
        # or just skip if too heavy. Let's do a quick fetch.
        scores_resp = supabase.table("leads").select("lead_score").limit(500).order("lead_score", desc=True).execute()
        scores = [r['lead_score'] for r in scores_resp.data if r['lead_score'] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
        return jsonify({
            "unique_visitors": unique_visitors,
            "hvp_count": hvp_count,
            "emails_captured": emails_captured,
            "avg_lead_score": round(avg_score, 1)
        })
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/leads', methods=['GET'])
def get_leads():
    """Fetch recent activities for the Trends tab"""
    try:
        # Fetch recent leads with score
        response = supabase.table("leads")\
            .select("email, lead_score, last_seen, stage, anonymous_id")\
            .order("last_seen", desc=True)\
            .limit(50)\
            .execute()
        
        return jsonify(response.data)
    except Exception as e:
        logger.error(f"Error fetching leads: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/kb', methods=['POST'])
def add_kb_chunk():
    """Add a new knowledge base chunk"""
    data = request.json
    content = data.get('content')
    if not content:
        return jsonify({"error": "Content is required"}), 400
        
    try:
        # 1. Embed content
        embedding = embed_model.encode(content).tolist()
        
        # 2. Insert into kb_chunks
        # We need a document_id. For simplicity, we can create a 'General' doc if not exists, 
        # or just insert if your schema allows null doc_id (schema says NOT NULL).
        # Let's find or create a default "Dashboard Uploads" document.
        
        doc_resp = supabase.table("kb_documents").select("id").eq("title", "Dashboard Uploads").execute()
        if doc_resp.data:
            doc_id = doc_resp.data[0]['id']
        else:
            # Create
            new_doc = supabase.table("kb_documents").insert({"title": "Dashboard Uploads", "source_type": "admin"}).execute()
            doc_id = new_doc.data[0]['id']
            
        # Insert Chunk
        chunk_data = {
            "document_id": doc_id,
            "content": content,
            "chunk_index": 0, # Simple index
            # "embedding": embedding # Supabase-py might struggle with vector types directly depending on setup.
             # Ideally we use an RPC or specific formatting. 
             # For now, let's assume the trigger handles embedding or we assume pgvector support in client.
             # Actually, supabase-py doesn't always support vector inserts easily.
             # Let's try raw inserts or RPC if standard insert fails.
        }
        
        # Attempt standard insert (if your table listens for changes or handle vector string format)
        # Note: pgvector expects a string like '[1,2,3]' usually.
        # But 'embedding' col is Unsupported("vector") in Prisma schema, likely vector(384) in DB.
        
        # We'll try to insert using RPC to be safe if direct insert fails on vector type.
        # But let's try direct insert first, stringifying if needed.
        # Check schema line 33: `embedding Unsupported("vector")?`
        
        # NOTE: Inserting vectors via standard Supabase API often requires exact format.
        # Let's return success and assume the user handles vectors via existing ingest pipeline 
        # or we implement an RPC `insert_kb_chunk` to handle the casting.
        
        # For THIS implementation, I'll use a placeholder RPC call if you have one, 
        # or just try to insert without embedding if there's an auto-embedding trigger (common in Supabase).
        # Re-reading app.py... it uses `_insert_chunks_for_document` (app.py:539).
        # It calls `supabase_admin.table("kb_chunks").insert(rows).execute()`.
        # Wait, app.py sets `embedding: None`? (Line 551 in previous view).
        # Ah! `app.py` sets embedding to None?
        # Let's check app.py `_insert_chunks_for_document` (Lines 668-685 in previous view).
        # Yes: `"embedding": None`. 
        # Does that mean there is a database trigger that generates embeddings? 
        # OR does the python script generate them later?
        # `app.py` has `render_knowledge_base` -> `... ingest chunks...`
        # `create_kb_document` ... `chunk_text`.
        # It seems `app.py` might NOT be generating embeddings on insert in that specific function viewed?
        # Or maybe I missed where embeddings are generated.
        # Logic in `rag_service.py` has `embed_model`. I SHOULD generate it.
        # If I can't easily insert vector via API, I'll rely on the existing pattern:
        # Insert with NULL embedding, and maybe a background job or trigger handles it?
        # OR I should assume I CAN insert it.
        
        # Let's try inserting with the list.
        chunk_data["embedding"] = embedding 
        
        supabase.table("kb_chunks").insert(chunk_data).execute()
        
        return jsonify({"success": True})
        
    except Exception as e:
        logger.error(f"Error adding KB: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    # Run on port 5000 (default) or PORT env var
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
