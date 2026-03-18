#!/usr/bin/env python3
"""
Insurance Broker MCP Server

Exposes three tools to Claude:
  - search_insurance_docs
  - list_policies
  - get_renewal_calendar
"""

import logging
import os
from datetime import date, datetime

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from openai import OpenAI
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

_port = int(os.environ.get("PORT", 8000))
mcp = FastMCP("insurance-broker-mcp", host="0.0.0.0", port=_port)

EMBED_MODEL = "text-embedding-3-small"
RENEWAL_WARN_DAYS = 60

# ---------------------------------------------------------------------------
# Clients (lazy)
# ---------------------------------------------------------------------------

_sb = None
_openai = None


def _supabase():
    global _sb
    if _sb is None:
        _sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    return _sb


def _openai_client():
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _openai


def _embed_query(query: str) -> list[float]:
    resp = _openai_client().embeddings.create(model=EMBED_MODEL, input=[query])
    return resp.data[0].embedding


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def search_insurance_docs(query: str, policy_type: str = None, limit: int = 5) -> str:
    """Semantic search across all insurance policy and asset documents.
    Use for any question about coverage, terms, exclusions, or limits.
    policy_type values: car, home, breakdown, life, phone, travel, asset"""
    embedding = _embed_query(query)
    filter_meta = {"policy_type": policy_type} if policy_type else None

    resp = _supabase().rpc(
        "search_documents",
        {
            "query_embedding": embedding,
            "match_count": limit,
            "filter_metadata": filter_meta,
        },
    ).execute()

    if not resp.data:
        return "No matching documents found."

    results = []
    for row in resp.data:
        meta = row.get("metadata", {})
        sim = row.get("similarity", 0)
        header = (
            f"[similarity={sim:.3f}] "
            f"{meta.get('filename', 'unknown')} "
            f"p{meta.get('page_num', '?')} "
            f"(policy_type={meta.get('policy_type', 'n/a')}, "
            f"property={meta.get('property', '')})"
        )
        results.append(f"--- {header}\n{row['content']}")

    return "\n\n".join(results)


@mcp.tool()
def list_policies() -> str:
    """List all documents in the knowledge base.
    Use first to check what's available before searching."""
    resp = _supabase().rpc("list_policies").execute()
    if not resp.data:
        return "No policies found in the knowledge base."

    lines = ["Policy / Asset inventory:\n"]
    for row in resp.data:
        policy_type = row.get("policy_type") or "n/a"
        prop = row.get("property") or ""
        filename = row.get("filename") or ""
        src = row.get("source_path") or ""
        prop_part = f" [{prop}]" if prop else ""
        lines.append(f"  {policy_type}{prop_part} — {filename}  ({src})")

    return "\n".join(lines)


@mcp.tool()
def get_renewal_calendar() -> str:
    """All policies with recorded renewal dates, sorted chronologically.
    Flags renewals within 60 days. Use for renewal overview requests."""
    resp = _supabase().rpc("get_renewal_calendar").execute()
    if not resp.data:
        return "No renewal dates found in the knowledge base."

    today = date.today()
    lines = ["Renewal calendar:\n"]
    for row in resp.data:
        policy_type = row.get("policy_type") or "n/a"
        prop = row.get("property") or ""
        filename = row.get("filename") or ""
        renewal_raw = row.get("renewal_date") or ""
        premium = row.get("premium") or ""

        prop_part = f" [{prop}]" if prop else ""
        premium_part = f"  £{premium}/yr" if premium else ""

        warning = ""
        for fmt in ("%d/%m/%Y", "%d/%m/%y", "%d %B %Y", "%d %b %Y"):
            try:
                renewal_date = datetime.strptime(renewal_raw, fmt).date()
                days_left = (renewal_date - today).days
                if 0 <= days_left <= RENEWAL_WARN_DAYS:
                    warning = f"  ⚠️  RENEWS IN {days_left} DAYS"
                break
            except ValueError:
                continue

        lines.append(
            f"  {policy_type}{prop_part} — {renewal_raw}{premium_part} — {filename}{warning}"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
