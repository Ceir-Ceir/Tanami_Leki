# Core

Backend and RAG logic lives here while keeping `app.py` at the project root for Streamlit.

- `api/`: HTTP endpoints (e.g., `/chat`, `/ingest`) via FastAPI or Express.
- `ingest/`: Parsers, chunking, and embeddings prep.
- `rag/`: Retrieval and prompt assembly.
- `supabase/`: Client setup and database queries.

Keep this folder decoupled from the Streamlit UI; new services should be wired without moving `app.py`.
