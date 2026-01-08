import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import Client, create_client

from core.ingest.chunker import chunk_text
from core.supabase.client import get_supabase_admin
from core.supabase.kb import create_kb_document, list_kb_documents

# Page setup
st.set_page_config(
    page_title="Leki Command Center",
    page_icon="🟢",
    layout="wide",
)

PRIMARY_COLOR = "#355E3B"
WHITE = "#FFFFFF"

CUSTOM_CSS = f"""
<style>
    :root {{
        --hunter-green: {PRIMARY_COLOR};
        --light-hunter: #4b7b55;
        --white: {WHITE};
    }}
    .block-container {{
        padding-top: 1.2rem;
        padding-bottom: 2rem;
    }}
    h1, h2, h3, h4, h5, h6 {{
        color: var(--hunter-green);
        letter-spacing: 0.2px;
    }}
    [data-testid="stSidebar"], [data-testid="stSidebar"] * {{
        background-color: var(--hunter-green) !important;
        color: var(--white) !important;
    }}
    .metric-card {{
        background: var(--hunter-green);
        color: var(--white);
        border-radius: 14px;
        padding: 18px 18px 12px 18px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
        border: 1px solid #2c4d33;
    }}
    .metric-title {{
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #d8e6db;
    }}
    .metric-value {{
        font-size: 2rem;
        font-weight: 800;
        margin-top: 4px;
        line-height: 1.1;
    }}
    .table-emphasis {{
        background: #eaf4ec !important;
    }}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

LEAD_SEGMENTS = [
    {
        "label": "High Value (HVP, score >=150)",
        "stage": None,
        "min_score": 150,
        "max_score": None,
    },
    {
        "label": "Sales Qualified (SQL, score 100-149)",
        "stage": "SQL",
        "min_score": 100,
        "max_score": 149,
    },
    {
        "label": "Marketing Qualified / Low Value (MQL, score 0-99)",
        "stage": "MQL",
        "min_score": 0,
        "max_score": 99,
    },
]


def check_password() -> None:
    """Simple password gate backed by Streamlit secrets."""
    expected = (
        st.secrets.get("APP_PASSWORD")
        or st.secrets.get("app_password")
        or st.secrets.get("password")
    )
    if expected is None:
        st.error("APP_PASSWORD missing from st.secrets")
        st.stop()

    if st.session_state.get("authenticated"):
        return

    with st.form("auth_form", clear_on_submit=False):
        password = st.text_input("Enter access password", type="password")
        submitted = st.form_submit_button("Unlock")

    if submitted:
        if password == expected:
            st.session_state.authenticated = True
            st.success("Access granted")
        else:
            st.error("Incorrect password")
            st.stop()

    if not st.session_state.get("authenticated"):
        st.stop()


@st.cache_resource(show_spinner=False)
def get_supabase_client() -> Client:
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)



def fetch_all_rows(
    client: Client, table: str, select: str = "*", order_col: str = None
) -> List[Dict]:
    """Fetch all rows from a table using pagination to avoid API limits."""
    all_data = []
    chunk_size = 250
    offset = 0

    while True:
        query = client.table(table).select(select)
        if order_col:
            query = query.order(order_col, desc=True)

        resp = query.range(offset, offset + chunk_size - 1).execute()
        chunk = resp.data or []
        all_data.extend(chunk)

        if len(chunk) < chunk_size:
            break
        offset += chunk_size

    return all_data


@st.cache_data(ttl=300, show_spinner=True)
def fetch_data() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Fetch lead rollups, leads, and events from Supabase into DataFrames."""
    client = get_supabase_client()

    # 1. Fetch Rollup Data (The Top Leads)
    # We select specific columns to make it faster and prevent timeouts
    rollup_resp = (
        client.table("v_lead_rollup")
        .select("email, lead_score, last_seen, stage, anonymous_id") 
        .order("lead_score", desc=True)
        .limit(200) 
        .execute()
    )

    # 2. Fetch Base Leads (Wait - do you actually need this? 
    # v_lead_rollup usually contains the leads. Let's fetch the base table just in case)
    leads_resp = (
        client.table("leads")
        .select("*")
        .order("first_seen", desc=True)
        .execute()
    )

    # 2b. Fetch Converted Leads (Explicitly fetch leads with emails to ensure funnel works)
    # We want to make sure we don't miss anyone who has actually signed up, even if they aren't in the top 200.
    converted_resp = (
        client.table("leads")
        .select("*")
        .neq("email", "null")
        .limit(1000)
        .execute()
    )

    # 3. Fetch Recent Events
    events_resp = (
        client.table("events")
        .select("anonymous_id,email,event_type,points,metadata,created_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )

    rollup_df = pd.DataFrame(rollup_resp.data or [])
    
    # Merge "Recent" and "Converted" leads
    leads_data = (leads_resp.data or []) + (converted_resp.data or [])
    leads_df = pd.DataFrame(leads_data)
    if not leads_df.empty and "anonymous_id" in leads_df.columns:
        leads_df = leads_df.drop_duplicates(subset="anonymous_id")
    events_df = pd.DataFrame(events_resp.data or [])

    # Formatting dates
    for frame in (rollup_df, leads_df):
        if not frame.empty:
            for col in ["last_seen", "first_seen", "created_at"]:
                if col in frame.columns:
                    frame[col] = pd.to_datetime(frame[col], errors="coerce")
                    
    if not events_df.empty and "created_at" in events_df:
        events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce")

    return rollup_df, leads_df, events_df


def fetch_email_count_live() -> int:
    """Fetch exact count of leads with a non-empty email directly from Supabase."""
    client = None

    # Prefer service role from secrets; fallback to the existing Supabase key.
    url = st.secrets.get("SUPABASE_URL") if st.secrets else None
    service_key = None
    if st.secrets:
        service_key = st.secrets.get("SUPABASE_SERVICE_ROLE_KEY") or st.secrets.get(
            "SUPABASE_KEY"
        )

    if url and service_key:
        try:
            client = create_client(url, service_key)
        except Exception as exc:
            print(f"Failed to init Supabase service client from secrets: {exc}")
            client = None

    if client is None:
        try:
            client = get_supabase_admin()
        except Exception as exc:
            print(f"Failed to init Supabase admin client: {exc}")
            client = None

    if client is None:
        return 0

    try:
        resp = client.table("v_lead_profiles").select("email", count="exact").execute()
        if resp.count is not None:
            return int(resp.count)
        data = resp.data or []
        return int(len(data))
    except Exception as exc:
        print(f"Failed to fetch lead email count from v_lead_profiles: {exc}")
        return 0


def fetch_unique_visitors_live() -> int:
    """Fetch unique anonymous_id count from the leads table."""
    client = None

    url = st.secrets.get("SUPABASE_URL") if st.secrets else None
    service_key = None
    if st.secrets:
        service_key = st.secrets.get("SUPABASE_SERVICE_ROLE_KEY") or st.secrets.get(
            "SUPABASE_KEY"
        )

    if url and service_key:
        try:
            client = create_client(url, service_key)
        except Exception as exc:
            print(f"Failed to init Supabase service client from secrets: {exc}")
            client = None

    if client is None:
        try:
            client = get_supabase_admin()
        except Exception as exc:
            print(f"Failed to init Supabase admin client: {exc}")
            client = None

    if client is None:
        return 0

    try:
        unique_ids = set()
        page_size = 1000
        offset = 0

        while True:
            resp = (
                client.table("leads")
                .select("anonymous_id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            data = resp.data or []
            if not data:
                break

            for row in data:
                anon_id = str(row.get("anonymous_id", "")).strip()
                if anon_id:
                    unique_ids.add(anon_id)

            if len(data) < page_size:
                break

            offset += page_size

        return len(unique_ids)
    except Exception as exc:
        print(f"Failed to fetch unique visitor count from leads: {exc}")
        return 0


def fetch_hvp_count_live(min_score: int = 150) -> int:
    """Fetch count of leads with HVP-level scores."""
    client = None

    url = st.secrets.get("SUPABASE_URL") if st.secrets else None
    service_key = None
    if st.secrets:
        service_key = st.secrets.get("SUPABASE_SERVICE_ROLE_KEY") or st.secrets.get(
            "SUPABASE_KEY"
        )

    if url and service_key:
        try:
            client = create_client(url, service_key)
        except Exception as exc:
            print(f"Failed to init Supabase service client from secrets: {exc}")
            client = None

    if client is None:
        try:
            client = get_supabase_admin()
        except Exception as exc:
            print(f"Failed to init Supabase admin client: {exc}")
            client = None

    if client is None:
        return 0

    try:
        resp = (
            client.table("leads")
            .select("lead_score", count="exact")
            .gte("lead_score", min_score)
            .execute()
        )
        if resp.count is not None:
            return int(resp.count)
        data = resp.data or []
        return sum(
            1 for row in data if row.get("lead_score") is not None and row["lead_score"] >= min_score
        )
    except Exception as exc:
        print(f"Failed to fetch HVP count: {exc}")

    try:
        total = 0
        page_size = 1000
        offset = 0

        while True:
            resp = (
                client.table("leads")
                .select("lead_score")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            data = resp.data or []
            if not data:
                break

            for row in data:
                score = row.get("lead_score")
                if score is not None and score >= min_score:
                    total += 1

            if len(data) < page_size:
                break

            offset += page_size

        return total
    except Exception as exc:
        print(f"Failed to fetch fallback HVP count: {exc}")
        return 0


@st.cache_data(ttl=120, show_spinner=False)
def fetch_converted_events_live(leads_df: pd.DataFrame) -> pd.DataFrame:
    """Fetch events tied to converted leads (by anonymous_id/email)."""
    converted_leads = _get_converted_leads(leads_df)
    if converted_leads.empty:
        return pd.DataFrame()

    client = get_supabase_client()
    anon_ids = (
        converted_leads.get("anonymous_id", pd.Series(dtype=str))
        .fillna("")
        .astype(str)
        .str.strip()
        .loc[lambda s: s.ne("")]
        .unique()
        .tolist()
    )
    emails = (
        converted_leads.get("email", pd.Series(dtype=str))
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
        .loc[lambda s: s.ne("")]
        .unique()
        .tolist()
    )

    results: List[Dict] = []
    chunk_size = 200

    for values, field in ((anon_ids, "anonymous_id"), (emails, "email")):
        if not values:
            continue
        for idx in range(0, len(values), chunk_size):
            chunk = values[idx : idx + chunk_size]
            resp = (
                client.table("events")
                .select("anonymous_id,email,event_type,points,metadata,created_at")
                .in_(field, chunk)
                .execute()
            )
            results.extend(resp.data or [])

    if not results:
        return pd.DataFrame()

    events_df = pd.DataFrame(results)
    if "metadata" in events_df.columns:
        subset = [col for col in events_df.columns if col != "metadata"]
        if subset:
            events_df = events_df.drop_duplicates(subset=subset)
    else:
        events_df = events_df.drop_duplicates()
    if "created_at" in events_df:
        events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce")
    return events_df


@st.cache_data(ttl=120, show_spinner=False)
def fetch_kb_documents(include_disabled: bool = True) -> pd.DataFrame:
    """Fetch knowledge base documents as a DataFrame."""
    docs = list_kb_documents(limit=200, include_disabled=include_disabled)
    return pd.DataFrame(docs or [])


def _extract_metadata_value(metadata, key: str):
    if isinstance(metadata, dict):
        return metadata.get(key)
    if isinstance(metadata, str):
        try:
            parsed = json.loads(metadata)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed.get(key)
    return None


def _get_converted_leads(leads_df: pd.DataFrame) -> pd.DataFrame:
    if "email" not in leads_df:
        return leads_df.head(0)
    email_series = leads_df["email"].fillna("").astype(str).str.strip()
    return leads_df[email_series.ne("")].copy()


def _filter_leads_by_segment(leads_df: pd.DataFrame, segment_label: str) -> pd.DataFrame:
    """Filter leads by the configured stage + score window for the selected segment."""
    segment = next((s for s in LEAD_SEGMENTS if s["label"] == segment_label), None)
    if segment is None or leads_df.empty:
        return leads_df.head(0)

    df = leads_df.copy()
    stage_mask = pd.Series(True, index=df.index)
    stage_value = segment.get("stage")
    if stage_value and "stage" in df:
        stages = df["stage"].fillna("").astype(str).str.upper()
        stage_mask = stages.eq(stage_value)

    score_mask = pd.Series(True, index=df.index)
    if "lead_score" in df:
        scores = pd.to_numeric(df["lead_score"], errors="coerce").fillna(0)
        min_score = segment.get("min_score")
        max_score = segment.get("max_score")
        if min_score is not None:
            score_mask &= scores.ge(min_score)
        if max_score is not None:
            score_mask &= scores.le(max_score)

    return df[stage_mask & score_mask].copy()


def _format_timestamp(value) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d %H:%M")
    return str(value)


def _format_duration_ms(value) -> str:
    if pd.isna(value):
        return ""
    try:
        total_seconds = int(round(float(value) / 1000))
    except (TypeError, ValueError):
        return ""
    minutes, seconds = divmod(total_seconds, 60)
    if minutes:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def _get_first_value(lead_row: pd.Series, keys: Tuple[str, ...]):
    for key in keys:
        value = lead_row.get(key)
        if pd.isna(value):
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        return value
    return None


def _filter_out_identity_events(events_df: pd.DataFrame) -> pd.DataFrame:
    if events_df.empty or "event_type" not in events_df:
        return events_df
    event_types = events_df["event_type"].fillna("").astype(str).str.lower()
    return events_df[~event_types.isin({"identify", "identity"})].copy()


def _extract_event_page(event_row: pd.Series) -> str:
    metadata = event_row.get("metadata")
    for key in ("page_path", "page_url", "path", "url", "href", "location", "page", "title"):
        value = _extract_metadata_value(metadata, key)
        if value:
            return str(value)
    return ""


def _events_for_lead(events_df: pd.DataFrame, lead_row: pd.Series) -> pd.DataFrame:
    if events_df.empty:
        return events_df.head(0)

    masks = []
    lead_anonymous = str(lead_row.get("anonymous_id", "")).strip()
    if lead_anonymous and "anonymous_id" in events_df.columns:
        event_anonymous = events_df["anonymous_id"].fillna("").astype(str).str.strip()
        masks.append(event_anonymous.eq(lead_anonymous))

    lead_email = str(lead_row.get("email", "")).strip().lower()
    if lead_email and "email" in events_df.columns:
        event_emails = events_df["email"].fillna("").astype(str).str.strip().str.lower()
        masks.append(event_emails.eq(lead_email))

    if not masks:
        return events_df.head(0)

    mask = masks[0]
    for next_mask in masks[1:]:
        mask = mask | next_mask

    return events_df[mask].copy()


def _filter_events_for_converted_leads(
    leads_df: pd.DataFrame,
    events_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, str]:
    if leads_df.empty or events_df.empty:
        return events_df.head(0), "No data available"

    converted_leads = _get_converted_leads(leads_df)
    if converted_leads.empty:
        return events_df.head(0), "No converted leads found"

    # Avoid "id" because leads.id and events.id are unrelated UUIDs.
    id_keys = ["anonymous_id", "lead_id", "visitor_id", "user_id", "client_id"]
    for key in id_keys:
        if key not in converted_leads:
            continue
        lead_ids = (
            converted_leads[key]
            .dropna()
            .astype(str)
            .str.strip()
            .loc[lambda s: s.ne("")]
            .unique()
        )
        if lead_ids.size == 0:
            continue

        if key in events_df.columns:
            event_ids = events_df[key].fillna("").astype(str).str.strip()
            mask = event_ids.isin(lead_ids)
            filtered = events_df[mask].copy()
            filtered["_lead_key"] = event_ids[mask]
            return filtered, f"{key} column"

        if "metadata" in events_df.columns:
            meta_series = events_df["metadata"].apply(
                lambda meta: _extract_metadata_value(meta, key)
            )
            event_ids = meta_series.fillna("").astype(str).str.strip()
            mask = event_ids.isin(lead_ids)
            filtered = events_df[mask].copy()
            filtered["_lead_key"] = event_ids[mask]
            return filtered, f"{key} metadata"

    if "email" in converted_leads:
        lead_emails = (
            converted_leads["email"]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.lower()
            .loc[lambda s: s.ne("")]
            .unique()
        )
        if lead_emails.size == 0:
            return events_df.head(0), "No converted emails found"

        if "email" in events_df.columns:
            event_emails = (
                events_df["email"].fillna("").astype(str).str.strip().str.lower()
            )
            mask = event_emails.isin(lead_emails)
            filtered = events_df[mask].copy()
            filtered["_lead_key"] = event_emails[mask]
            return filtered, "email column"

        if "metadata" in events_df.columns:
            meta_emails = events_df["metadata"].apply(
                lambda meta: _extract_metadata_value(meta, "email")
            )
            event_emails = (
                meta_emails.fillna("").astype(str).str.strip().str.lower()
            )
            mask = event_emails.isin(lead_emails)
            filtered = events_df[mask].copy()
            filtered["_lead_key"] = event_emails[mask]
            return filtered, "email metadata"

    return events_df.head(0), "No matching key between leads and events"


def _insert_chunks_for_document(document_id: str, chunks: List[str]) -> int:
    """Insert chunk rows for a document and return count inserted."""
    if not chunks:
        return 0

    supabase_admin = get_supabase_admin()
    rows = [
        {
            "document_id": document_id,
            "chunk_index": idx,
            "content": chunk,
            "metadata": {},
            "embedding": None,
        }
        for idx, chunk in enumerate(chunks)
    ]
    supabase_admin.table("kb_chunks").insert(rows).execute()
    return len(rows)


def render_metrics(leads_df: pd.DataFrame, events_df: pd.DataFrame) -> None:
    unique_visitors = fetch_unique_visitors_live()

    hvp_count = fetch_hvp_count_live(150)

    emails_captured = fetch_email_count_live()

    avg_lead_score_val = leads_df["lead_score"].mean() if not leads_df.empty else 0
    avg_lead_score = round(avg_lead_score_val, 1) if pd.notna(avg_lead_score_val) else 0

    cols = st.columns(4)
    metric_data = [
        ("Total Tracked Visitors", f"{unique_visitors:,}"),
        ("HVP Count (>=150)", f"{hvp_count:,}"),
        ("Emails Captured", f"{emails_captured:,}"),
        ("Avg Lead Score", f"{avg_lead_score:,}"),
    ]

    for col, (title, value) in zip(cols, metric_data):
        col.markdown(
            f"""
            <div class="metric-card">
                <div class="metric-title">{title}</div>
                <div class="metric-value">{value}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_lead_list(
    leads_df: pd.DataFrame,
    events_df: pd.DataFrame,
) -> None:
    leads_df = _get_converted_leads(leads_df)
    if leads_df.empty:
        st.info("No converted leads found.")
        return

    segment_options = [segment["label"] for segment in LEAD_SEGMENTS]
    selected_segment = st.selectbox(
        "Lead segment",
        segment_options,
        index=0,
        key="lead_segment_select",
    )
    st.caption(
        "High Value: score >=150 (any stage). "
        "Sales Qualified: stage SQL with scores 100-149. "
        "Marketing Qualified / Low Value: stage MQL with scores 0-99."
    )

    leads_df = _filter_leads_by_segment(leads_df, selected_segment)
    if leads_df.empty:
        st.info("No leads match the selected segment.")
        return

    display_df = leads_df.copy()
    display_df = display_df.sort_values(by="lead_score", ascending=False)

    for _, lead in display_df.iterrows():
        email = str(lead.get("email", "")).strip()
        anonymous_id = str(lead.get("anonymous_id", "")).strip()
        lead_label = email or anonymous_id or "Converted lead"
        lead_score = lead.get("lead_score", 0)
        session_id = str(lead.get("session_id", "")).strip()
        session_referrer = _get_first_value(lead, ("referrer", "session_referrer"))
        duration_value = _get_first_value(lead, ("duration_ms", "session_duration_ms"))
        session_duration = _format_duration_ms(duration_value)

        with st.expander(f"{lead_label} | score {lead_score}"):
            col_a, col_b, col_c = st.columns([1, 1, 1])
            with col_a:
                st.metric("Lead Score", int(lead_score) if pd.notna(lead_score) else 0)
                st.write(f"Stage: {lead.get('stage', 'UNKNOWN')}")
            with col_b:
                st.write(f"First Seen: {_format_timestamp(lead.get('first_seen'))}")
                st.write(f"Last Seen: {_format_timestamp(lead.get('last_seen'))}")
            with col_c:
                st.write(f"Session ID: {session_id or 'N/A'}")
                st.write(f"Anonymous ID: {anonymous_id or 'N/A'}")

            st.markdown("Session details")
            st.write(f"Referrer: {session_referrer or 'N/A'}")
            st.write(f"Duration: {session_duration or 'N/A'}")

            lead_events = _events_for_lead(events_df, lead)
            if lead_events.empty:
                st.info("No events found for this lead.")
                continue

            if "created_at" in lead_events.columns:
                lead_events = lead_events.sort_values("created_at")

            path_items = []
            for _, event in lead_events.iterrows():
                page_label = _extract_event_page(event)
                if not page_label:
                    continue
                event_type = str(event.get("event_type", "")).strip() or "event"
                timestamp = _format_timestamp(event.get("created_at"))
                path_items.append(f"{timestamp} | {event_type} | {page_label}")

            st.markdown("Path and activity")
            if path_items:
                st.markdown("\n".join(f"- {item}" for item in path_items[-20:]))
            else:
                st.caption("No page path data available in event metadata.")


def render_stage_distribution(leads_df: pd.DataFrame) -> None:
    if leads_df.empty or "stage" not in leads_df:
        st.info("No lead stage data available.")
        return

    stage_counts = leads_df["stage"].fillna("UNKNOWN").value_counts().reset_index()
    stage_counts.columns = ["stage", "count"]
    fig = px.bar(
        stage_counts,
        x="stage",
        y="count",
        text="count",
        color_discrete_sequence=[PRIMARY_COLOR],
        title="Lead Stage Distribution",
    )
    fig.update_traces(textposition="outside")
    fig.update_layout(yaxis_title="Leads", xaxis_title="Stage", margin=dict(l=20, r=20, t=50, b=20))
    st.plotly_chart(fig, use_container_width=True)


def render_top_actions(client: Client):
    st.subheader("Top Actions by Converted Leads")

    try:
        # Fetch just the JSON column to keep it light
        resp = client.table("v_lead_profiles").select("top_events").execute()
    except Exception as e:
        # Graceful fallback if view/column doesn't exist
        st.warning(f"Could not load top actions: {e}")
        return

    data = resp.data or []
    if not data:
        st.info("No profile data available to chart.")
        return

    # Aggregate counts manually from the JSONB {"action": count} dicts
    event_counts = {}
    for row in data:
        events = row.get("top_events")
        if not events or not isinstance(events, dict):
            continue
        for event_name, count in events.items():
            # Ensure we're adding integers
            add_val = int(count) if count is not None else 0
            event_counts[event_name] = event_counts.get(event_name, 0) + add_val

    if not event_counts:
        st.caption("No aggregated event data found.")
        return

    # Create DataFrame for Plotly
    df = pd.DataFrame(list(event_counts.items()), columns=["Action", "Count"])
    
    # Sort and take top 20
    df = df.sort_values("Count", ascending=True).tail(20)

    fig = px.bar(
        df,
        x="Count",
        y="Action",
        orientation="h",
        text="Count",
        title="Most Frequent Actions (Converted Users)",
        color_discrete_sequence=[PRIMARY_COLOR],
    )
    fig.update_traces(textposition="outside")
    fig.update_layout(height=600, margin=dict(l=20, r=20, t=50, b=20))
    st.plotly_chart(fig, use_container_width=True)


def render_event_trends(events_df: pd.DataFrame) -> None:
    if events_df.empty:
        st.info("No event activity available.")
        return
    if "created_at" not in events_df:
        st.info("No event timestamps available.")
        return

    events_df = events_df.copy()
    events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce")
    events_df = events_df.dropna(subset=["created_at"])
    if events_df.empty:
        st.info("No event timestamps available.")
        return

    events_df["event_date"] = events_df["created_at"].dt.date
    trend = (
        events_df.groupby("event_date")
        .size()
        .reset_index(name="events")
        .sort_values("event_date")
    )
    if trend.empty:
        st.info("No dated events to plot.")
        return

    fig = px.line(
        trend,
        x="event_date",
        y="events",
        markers=True,
        color_discrete_sequence=[PRIMARY_COLOR],
        title="Traffic / Events Over Time",
    )
    fig.update_layout(yaxis_title="Events", xaxis_title="Date", margin=dict(l=20, r=20, t=50, b=20))
    st.plotly_chart(fig, use_container_width=True)


def render_converted_lead_funnel(events_df: pd.DataFrame) -> None:
    events_df = _filter_out_identity_events(events_df)
    if events_df.empty:
        st.info("No converted-lead events available for a funnel.")
        return
    if "event_type" not in events_df:
        st.info("No event_type column available for funnel analysis.")
        return

    counts = events_df.dropna(subset=["event_type"]).copy()
    counts["event_type"] = counts["event_type"].astype(str).str.strip()
    counts = counts[counts["event_type"].ne("")]
    if counts.empty:
        st.info("No event types available for funnel analysis.")
        return

    has_lead_key = "_lead_key" in counts.columns
    grouped = counts.groupby("event_type").size().reset_index(name="event_count")
    if has_lead_key:
        lead_counts = counts.groupby("event_type")["_lead_key"].nunique().reset_index(name="lead_count")
        grouped = grouped.merge(lead_counts, on="event_type", how="left")

    grouped = grouped.sort_values("event_count", ascending=False).head(10)

    fig = px.funnel(
        grouped,
        x="event_count",
        y="event_type",
        title="Converted Lead Funnel (Event Volume)",
        color_discrete_sequence=[PRIMARY_COLOR],
    )
    fig.update_traces(text=grouped["event_count"])
    fig.update_layout(
        xaxis_title="Total Events from Converted Leads",
        yaxis_title="Event Type",
    )
    st.plotly_chart(fig, use_container_width=True)
    if has_lead_key:
        st.caption("Event volume counted across converted leads; lead_count (not plotted) is the unique converted leads per event type.")


def render_converted_event_trends(events_df: pd.DataFrame) -> None:
    events_df = _filter_out_identity_events(events_df)
    if events_df.empty:
        st.info("No converted-lead event activity available.")
        return
    if "created_at" not in events_df:
        st.info("No timestamp available for converted-lead trends.")
        return

    events_df = events_df.copy()
    events_df["created_at"] = pd.to_datetime(events_df["created_at"], errors="coerce")
    events_df = events_df.dropna(subset=["created_at"])
    if events_df.empty:
        st.info("No timestamp available for converted-lead trends.")
        return

    events_df["event_date"] = events_df["created_at"].dt.date
    trend = (
        events_df.groupby("event_date")
        .size()
        .reset_index(name="events")
        .sort_values("event_date")
    )
    if trend.empty:
        st.info("No dated converted-lead events to plot.")
        return

    fig = px.line(
        trend,
        x="event_date",
        y="events",
        markers=True,
        color_discrete_sequence=[PRIMARY_COLOR],
        title="Converted Lead Events Over Time",
    )
    fig.update_layout(yaxis_title="Events", xaxis_title="Date", margin=dict(l=20, r=20, t=50, b=20))
    st.plotly_chart(fig, use_container_width=True)


def render_recent_actions(events_df: pd.DataFrame, limit: int = 25) -> None:
    if events_df.empty:
        st.info("No recent events to display.")
        return

    feed_df = events_df.sort_values("created_at", ascending=False).head(limit).copy()
    feed_df["created_at"] = feed_df["created_at"].dt.strftime("%Y-%m-%d %H:%M")
    feed_df["metadata"] = feed_df["metadata"].apply(
        lambda m: json.dumps(m, indent=2) if isinstance(m, (dict, list)) else str(m)
    )
    st.dataframe(
        feed_df[["created_at", "event_type", "points", "metadata"]],
        use_container_width=True,
        height=480,
    )


def render_knowledge_base() -> None:
    st.subheader("Knowledge Base")
    st.caption("Manage knowledge documents for RAG. Embeddings will be added later.")

    try:
        docs_df = fetch_kb_documents()
    except Exception as exc:
        st.error(f"Failed to load knowledge base documents: {exc}")
        docs_df = pd.DataFrame()

    if docs_df.empty:
        st.info("No knowledge base documents yet.")
    else:
        display_cols = [col for col in ["title", "source_type", "enabled", "created_at"] if col in docs_df.columns]
        display_df = docs_df[display_cols].copy()
        if "created_at" in display_df:
            display_df["created_at"] = pd.to_datetime(display_df["created_at"], errors="coerce")
        st.dataframe(display_df, use_container_width=True, height=320)

    st.markdown("---")
    st.subheader("Add Document from Pasted Text")

    with st.form("kb_ingest_form"):
        title = st.text_input("Title*", "")
        source_type = st.selectbox(
            "Source type",
            options=["other", "web", "pdf", "faq", "support", "product"],
            index=0,
        )
        source_url = st.text_input("Source URL (optional)", "")
        enabled = st.checkbox("Enabled", value=True)
        text_content = st.text_area(
            "Knowledge text",
            height=240,
            placeholder="Paste the knowledge text here. Embeddings will be added later.",
        )
        submitted = st.form_submit_button("Ingest Pasted Text")

    if not submitted:
        return

    title_value = title.strip()
    if not title_value:
        st.warning("Title is required to create a document.")
        return

    text_to_ingest = text_content.strip()
    if not text_to_ingest:
        st.warning("Please paste some knowledge text to ingest.")
        return

    with st.spinner("Creating document and storing chunks..."):
        try:
            document = create_kb_document(
                title=title_value,
                source_url=source_url.strip() or None,
                source_type=source_type,
                enabled=enabled,
            )
            chunks = chunk_text(text_to_ingest, chunk_size=1200, overlap=150)
            if not chunks:
                st.warning("No content to ingest after processing.")
                return

            inserted_count = _insert_chunks_for_document(document["id"], chunks)
            st.success(f"Ingested {inserted_count} chunks for '{title_value}'.")
            fetch_kb_documents.clear()
        except Exception as exc:
            st.error(f"Ingestion failed: {exc}")


def main() -> None:
    check_password()
    st.title("Leki Command Center")
    st.caption("Lead Scoring Dashboard • Chatbot Knowledge Base")

    rollup_df, leads_df, events_df = fetch_data()

    render_metrics(leads_df, events_df)

    tab_leads, tab_trends, tab_kb = st.tabs(["Lead List", "Trends & Activity", "Knowledge Base"])

    with tab_leads:
        st.subheader("Lead List")
        render_lead_list(rollup_df, events_df)

    with tab_trends:
        st.subheader("Lead Stage Distribution")
        render_stage_distribution(leads_df)

        # Top Actions Chart (replacing funnel)
        render_top_actions(get_supabase_client())

        st.subheader("Most Recent Live Actions")
        render_recent_actions(events_df)

    with tab_kb:
        render_knowledge_base()


if __name__ == "__main__":
    main()
