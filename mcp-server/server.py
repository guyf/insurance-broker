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
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import TextContent, Tool
from openai import OpenAI
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Mount, Route
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Clients (initialised lazily so import errors surface cleanly)
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


EMBED_MODEL = "text-embedding-3-small"
RENEWAL_WARN_DAYS = 60


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def _embed_query(query: str) -> list[float]:
    resp = _openai_client().embeddings.create(model=EMBED_MODEL, input=[query])
    return resp.data[0].embedding


def search_insurance_docs(query: str, policy_type: str | None, limit: int) -> str:
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


def list_policies() -> str:
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


def get_renewal_calendar() -> str:
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

        # Flag renewals within 60 days
        warning = ""
        try:
            for fmt in ("%d/%m/%Y", "%d/%m/%y", "%d %B %Y", "%d %b %Y"):
                try:
                    renewal_date = datetime.strptime(renewal_raw, fmt).date()
                    days_left = (renewal_date - today).days
                    if 0 <= days_left <= RENEWAL_WARN_DAYS:
                        warning = f"  ⚠️  RENEWS IN {days_left} DAYS"
                    break
                except ValueError:
                    continue
        except Exception:
            pass

        lines.append(
            f"  {policy_type}{prop_part} — {renewal_raw}{premium_part} — {filename}{warning}"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------

server = Server("insurance-broker-mcp")

TOOLS = [
    Tool(
        name="search_insurance_docs",
        description=(
            "Semantic search across all insurance policy and asset documents. "
            "Use for any question about coverage, terms, exclusions, or limits."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
                "policy_type": {
                    "type": "string",
                    "description": (
                        "Optional filter. Values: car, home, breakdown, life, phone, travel, asset"
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of results to return (default 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    ),
    Tool(
        name="list_policies",
        description=(
            "List all documents in the knowledge base. "
            "Use first to check what's available before searching."
        ),
        inputSchema={"type": "object", "properties": {}},
    ),
    Tool(
        name="get_renewal_calendar",
        description=(
            "All policies with recorded renewal dates, sorted chronologically. "
            "Flags renewals within 60 days. Use for renewal overview requests."
        ),
        inputSchema={"type": "object", "properties": {}},
    ),
]


@server.list_tools()
async def handle_list_tools():
    return TOOLS


@server.call_tool()
async def handle_call_tool(name: str, arguments: dict):
    try:
        if name == "search_insurance_docs":
            result = search_insurance_docs(
                query=arguments["query"],
                policy_type=arguments.get("policy_type"),
                limit=int(arguments.get("limit", 5)),
            )
        elif name == "list_policies":
            result = list_policies()
        elif name == "get_renewal_calendar":
            result = get_renewal_calendar()
        else:
            result = f"Unknown tool: {name}"
    except Exception as exc:
        logger.exception("Tool %s failed", name)
        result = f"Error: {exc}"

    return [TextContent(type="text", text=result)]


sse = SseServerTransport("/messages/")


async def handle_sse(request: Request):
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())


app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
    ]
)
