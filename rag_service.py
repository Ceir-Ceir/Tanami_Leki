import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from groq import Groq
from openai import OpenAI
from dotenv import load_dotenv

# Load env from .env if present (mostly for local dev)
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")  # llama-3.3-70b-versatile was retired by Groq on 2026-08-16

if not all([SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY, OPENAI_API_KEY]):
    logger.warning("Missing one or more required environment variables: SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY, OPENAI_API_KEY")

# Initialize Clients
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    groq_client = Groq(api_key=GROQ_API_KEY)
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    
    logger.info("RAG Service Initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize clients: {e}")

def get_context(query_text: str):
    """
    1. Vectorize query using OpenAI (1536 dims).
    2. Search Supabase kb_chunks.
    """
    try:
        # Generate embedding
        embed_res = openai_client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small"
        )
        vector = embed_res.data[0].embedding
        
        # Query Supabase
        # Uses the actual function signature: filter_source_types, match_count, query_embedding
        response = supabase.rpc("match_kb_chunks", {
            "query_embedding": vector,
            "match_count": 5,
            "filter_source_types": None  # No filtering, return all source types
        }).execute()
        
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching context: {e}")
        return []

# System prompt for Leki
SYSTEM_PROMPT = """You are Leki, a motorcycle expert ai chatbot do not say you are a chatbot unless the user ask. Answer using ONLY the provided context. If the answer isn't there, say you don't know. If the first message reply from the user is "yes" or "no" they are responding to the question are you a first time rider, use that information to steer the conversation either to exploring why they are interested in ebikes or what they currently use based on their response. at the end of your response try to ask a related probing question that either is sales focused or demographics focused but do not make it like a survey."""

def get_history(anonymous_id: str, limit: int = 5):
    """Fetch recent chat history for a user."""
    if not anonymous_id:
        return []
    try:
        response = supabase.table("chat_history")\
            .select("role, content")\
            .eq("anonymous_id", anonymous_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        
        # Reverse to get chronological order
        history = response.data[::-1] if response.data else []
        
        # If no history, inject the initial greeting context
        if not history:
            history = [{"role": "assistant", "content": "Hey! I'm Leki, your motorcycle expert. Are you a first-time rider?"}]
            
        return history
    except Exception as e:
        logger.error(f"Error fetching history: {e}")
        return []

def generate_answer(query: str, context_chunks: list, history: list = None):
    """
    Generate answer using Groq and the provided context/history.
    """
    try:
        context_str = "\n\n".join([c.get('content', '') for c in context_chunks])
        
        # Build messages list
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        # Add history
        if history:
            for msg in history:
                messages.append({"role": msg['role'], "content": msg['content']})
        
        # Add context as a system instruction to prevent confusion during sales flow
        if context_str:
            messages.append({
                "role": "system", 
                "content": f"INFORMATION FROM KNOWLEDGE BASE:\n{context_str}\n\nINSTRUCTION: Use the above info ONLY if relevant to the user's specific question. If they are just answering your qualification questions, stick to the sales flow."
            })
        
        # Add current user query
        messages.append({"role": "user", "content": query})

        chat_completion = groq_client.chat.completions.create(
            messages=messages,
            model=GROQ_MODEL,
            temperature=0.5,
        )
        
        return chat_completion.choices[0].message.content
    except Exception as e:
        logger.error(f"Error generating answer: {e}")
        return "I'm having a bit of trouble thinking right now. Please try again."

def save_chat_message(anonymous_id: str, role: str, content: str):
    """Save a chat message to the chat_history table."""
    if not anonymous_id:
        return
    try:
        supabase.table("chat_history").insert({
            "anonymous_id": anonymous_id,
            "role": role,
            "content": content
        }).execute()
    except Exception as e:
        logger.error(f"Error saving chat message: {e}")

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    if not data or 'message' not in data:
        return jsonify({"error": "Message is required"}), 400

    query = data['message']
    anonymous_id = data.get('anonymous_id')  # Optional, sent from client
    
    # Save user message to chat_history
    if anonymous_id:
        save_chat_message(anonymous_id, "user", query)
    
    # 1. Get History & Context
    history = get_history(anonymous_id)
    context = get_context(query)
    
    # 2. Generate Answer
    answer = generate_answer(query, context, history)
    
    # Save bot response to chat_history
    if anonymous_id:
        save_chat_message(anonymous_id, "assistant", answer)
    
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
        # 1. Embed content via OpenAI
        embed_res = openai_client.embeddings.create(
            input=content,
            model="text-embedding-3-small"
        )
        embedding = embed_res.data[0].embedding
        
        # 2. Insert into kb_chunks
        # Find or create a default "Dashboard Uploads" document.
        doc_resp = supabase.table("kb_documents").select("id").eq("title", "Dashboard Uploads").execute()
        if doc_resp.data:
            doc_id = doc_resp.data[0]['id']
        else:
            # Create
            new_doc = supabase.table("kb_documents").insert({"title": "Dashboard Uploads", "source_type": "admin"}).execute()
            doc_id = new_doc.data[0]['id']
            
        chunk_data = {
            "document_id": doc_id,
            "content": content,
            "chunk_index": 0, # Simple index
            "embedding": embedding
        }
        
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
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
