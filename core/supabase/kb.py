# core/supabase/
# |-- client.py
# |-- kb.py

from typing import Dict, List, Optional

from core.supabase.client import get_supabase_admin


def create_kb_document(
    title: str,
    source_url: Optional[str] = None,
    source_type: str = "other",
    enabled: bool = True,
) -> Dict:
    """Insert a knowledge base document and return the inserted row."""
    supabase = get_supabase_admin()
    payload = {
        "title": title,
        "source_type": source_type,
        "enabled": enabled,
    }

    if source_url is not None:
        payload["source_url"] = source_url

    try:
        response = supabase.table("kb_documents").insert(payload).execute()
        data = response.data or []
        if not data:
            raise RuntimeError("Insert into kb_documents returned no rows.")
        print(f"Inserted kb_document with id={data[0].get('id')}.")
        return data[0]
    except Exception as exc:
        print(f"Error creating kb_document: {exc}")
        raise


def list_kb_documents(limit: int = 50, include_disabled: bool = False) -> List[Dict]:
    """List knowledge base documents ordered by most recent creation."""
    supabase = get_supabase_admin()
    query = supabase.table("kb_documents").select("*").order("created_at", desc=True)

    if not include_disabled:
        query = query.eq("enabled", True)

    try:
        response = query.limit(limit).execute()
        data = response.data or []
        print(f"Fetched {len(data)} kb_documents (include_disabled={include_disabled}).")
        return data
    except Exception as exc:
        print(f"Error listing kb_documents: {exc}")
        raise


def delete_kb_document(document_id: str) -> None:
    """Delete a knowledge base document by id (chunks cascade)."""
    supabase = get_supabase_admin()
    try:
        supabase.table("kb_documents").delete().eq("id", document_id).execute()
        print(f"Deleted kb_document id={document_id}.")
    except Exception as exc:
        print(f"Error deleting kb_document id={document_id}: {exc}")
        raise
