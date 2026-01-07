import os
from typing import Optional

from supabase import Client, create_client


_admin_client: Optional[Client] = None


def _require_env(var_name: str) -> str:
    value = os.getenv(var_name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {var_name}")
    return value


def get_supabase_admin() -> Client:
    """Return a cached Supabase admin client using service role credentials."""
    global _admin_client
    if _admin_client is not None:
        return _admin_client

    url = _require_env("SUPABASE_URL")
    service_role_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")

    try:
        _admin_client = create_client(url, service_role_key)
        print("Supabase admin client initialized.")
    except Exception as exc:
        print(f"Failed to initialize Supabase admin client: {exc}")
        raise

    return _admin_client
