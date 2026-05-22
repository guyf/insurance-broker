#!/usr/bin/env python3
"""
Insurance Broker MCP Server

Exposes four tools to Claude:
  - search_insurance_docs
  - list_policies
  - get_renewal_calendar
  - ingest_market_policies

Also exposes plain HTTP endpoints:
  POST   /upload
  PATCH  /update-policy
  DELETE /delete-policy
"""

import logging
import os
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

import requests

from dotenv import load_dotenv
from market_policies import MARKET_POLICIES, slug, filename_from_url, source_path as market_source_path
from mcp.server.fastmcp import FastMCP
from openai import OpenAI
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

_port = int(os.environ.get("PORT", 8000))
mcp = FastMCP("insurance-broker-mcp", host="0.0.0.0", port=_port, stateless_http=True)

EMBED_MODEL = "text-embedding-3-small"
RENEWAL_WARN_DAYS = 60

# ---------------------------------------------------------------------------
# Clients (lazy)
# ---------------------------------------------------------------------------

_sb = None
_sb_service = None
_openai = None


def _supabase():
    global _sb
    if _sb is None:
        _sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    return _sb


def _supabase_service():
    global _sb_service
    if _sb_service is None:
        _sb_service = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _sb_service


def _openai_client():
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _openai


def _embed_query(query: str) -> list[float]:
    resp = _openai_client().embeddings.create(model=EMBED_MODEL, input=[query])
    return resp.data[0].embedding


# ---------------------------------------------------------------------------
# MCP Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def search_insurance_docs(query: str, policy_type: str = None, limit: int = 5, tenant_id: str = None) -> str:
    """Semantic search across all insurance policy and asset documents.
    Use for any question about coverage, terms, exclusions, or limits.
    policy_type values: car, home, breakdown, life, phone, travel, asset, public_liability, employers_liability, professional_indemnity, cyber.
    tenant_id: pass the Xero organisation tenant ID to scope results to a specific company."""
    embedding = _embed_query(query)
    # Build metadata filter — combine policy_type and tenant_id if provided
    filter_meta: dict | None = None
    if policy_type or tenant_id:
        filter_meta = {}
        if policy_type:
            filter_meta["policy_type"] = policy_type
        if tenant_id:
            filter_meta["tenant_id"] = tenant_id

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
def list_policies(tenant_id: str = None) -> str:
    """List all documents in the knowledge base.
    Use first to check what's available before searching.
    tenant_id: pass the Xero organisation tenant ID to scope results to a specific company."""
    rpc_args = {"p_tenant_id": tenant_id} if tenant_id else {}
    resp = _supabase().rpc("list_policies", rpc_args).execute()
    if not resp.data:
        return "No policies found in the knowledge base."

    lines = ["Policy / Asset inventory:\n"]
    for row in resp.data:
        doc_type = row.get("doc_type") or "policy"
        policy_type = row.get("policy_type") or "asset"
        prop = row.get("insured_entity") or ""
        filename = row.get("filename") or ""
        src = row.get("source_path") or ""
        provider = row.get("provider") or ""
        underwriter = row.get("underwriter") or ""
        asset_name = row.get("asset_name") or ""
        asset_value = row.get("asset_value") or ""
        premium = row.get("premium") or ""
        renewal_date = row.get("renewal_date") or ""
        prop_part = f" [{prop}]" if prop else ""
        doc_type_part = f"  [doc_type: {doc_type}]"
        provider_part = f"  [provider: {provider}]" if provider else ""
        underwriter_part = f"  [underwriter: {underwriter}]" if underwriter else ""
        asset_name_part = f"  [asset_name: {asset_name}]" if asset_name else ""
        asset_value_part = f"  [asset_value: {asset_value}]" if asset_value else ""
        premium_part = f"  [premium: {premium}]" if premium else ""
        renewal_part = f"  [renewal_date: {renewal_date}]" if renewal_date else ""
        lines.append(
            f"  {policy_type}{prop_part} — {filename}  ({src})"
            f"{doc_type_part}{provider_part}{underwriter_part}"
            f"{asset_name_part}{asset_value_part}{premium_part}{renewal_part}"
        )

    return "\n".join(lines)


@mcp.tool()
def get_renewal_calendar(tenant_id: str = None) -> str:
    """All policies with recorded renewal dates, sorted chronologically.
    Flags renewals within 60 days. Use for renewal overview requests.
    tenant_id: pass the Xero organisation tenant ID to scope results to a specific company."""
    rpc_args = {"p_tenant_id": tenant_id} if tenant_id else {}
    resp = _supabase().rpc("get_renewal_calendar", rpc_args).execute()
    if not resp.data:
        return "No renewal dates found in the knowledge base."

    today = date.today()
    lines = ["Renewal calendar:\n"]
    for row in resp.data:
        policy_type = row.get("policy_type") or "asset"
        prop = row.get("insured_entity") or ""
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
# Market policy ingestion tool
# ---------------------------------------------------------------------------

# Add ingestion modules to path (shared with upload endpoint below)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../ingestion"))

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,*/*",
}


@mcp.tool()
def ingest_market_policies(policy_type: str, provider: str = None) -> str:
    """Download and ingest publicly available policy booklets from major UK insurers
    into the knowledge base, enabling market-wide coverage comparison.

    policy_type: car, home, or pet
    provider: optional — ingest only this named provider (e.g. "Admiral").
              If omitted, ingests all providers for the given type.

    Call this before comparing the user's current policy against the broader market.
    Re-ingesting the same document is free — duplicates are skipped automatically."""

    if policy_type not in MARKET_POLICIES:
        return f"Unknown policy_type '{policy_type}'. Valid values: {', '.join(MARKET_POLICIES)}"

    providers = MARKET_POLICIES[policy_type]
    if provider:
        # Case-insensitive match
        matched = {k: v for k, v in providers.items() if k.lower() == provider.lower()}
        if not matched:
            available = ", ".join(providers.keys())
            return f"Provider '{provider}' not found for {policy_type}. Available: {available}"
        providers = matched

    # Import ingestion modules lazily
    from pdf_chunk import chunk_pdf  # noqa: PLC0415
    from embed import embed_texts  # noqa: PLC0415
    from store import get_existing_hashes, upsert_chunks  # noqa: PLC0415

    sb = _supabase_service()
    oai = _openai_client()

    results = []
    for provider_name, docs in providers.items():
        for doc in docs:
            url = doc["url"]
            sp = market_source_path(policy_type, provider_name, url)
            fname = filename_from_url(url)

            # Download PDF
            try:
                resp = requests.get(url, headers=_BROWSER_HEADERS, timeout=60)
                resp.raise_for_status()
            except Exception as exc:
                results.append(f"  ✗ {provider_name} — {doc['name']}: download failed ({exc})")
                continue

            # Write to temp file and ingest
            try:
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(resp.content)
                    tmp_path = tmp.name

                base_metadata = {
                    "doc_type": "policy",
                    "policy_type": policy_type,
                    "provider": provider_name,
                    "filename": fname,
                    "source_path": sp,
                }

                chunks = chunk_pdf(Path(tmp_path), source_path=sp, base_metadata=base_metadata)
                os.unlink(tmp_path)

                if not chunks:
                    results.append(f"  ✗ {provider_name} — {doc['name']}: no text extracted")
                    continue

                texts = [c.content for c in chunks]
                embeddings = embed_texts(texts, oai)
                existing = get_existing_hashes([c.chunk_hash for c in chunks], sb)
                new_chunks = [c for c in chunks if c.chunk_hash not in existing]
                new_embeddings = [
                    e for c, e in zip(chunks, embeddings) if c.chunk_hash not in existing
                ]

                stored = upsert_chunks(new_chunks, new_embeddings, sb)
                skipped = len(chunks) - len(new_chunks)
                msg = f"  ✓ {provider_name} — {doc['name']}: {stored} chunks stored"
                if skipped:
                    msg += f" ({skipped} already existed)"
                results.append(msg)

            except Exception as exc:
                logger.exception("Ingest failed for %s", url)
                results.append(f"  ✗ {provider_name} — {doc['name']}: ingest failed ({exc})")

    summary = f"Market policy ingestion complete for {policy_type}:\n" + "\n".join(results)
    return summary


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------


async def delete_policy(request: Request) -> JSONResponse:
    """Delete all document chunks for the given source paths."""
    try:
        body = await request.json()
        source_paths = body.get("source_paths", [])

        if not source_paths:
            return JSONResponse({"error": "source_paths is required"}, status_code=400)

        total = 0
        sb = _supabase_service()
        for sp in source_paths:
            resp = sb.rpc(
                "delete_documents_by_source_path", {"p_source_path": sp}
            ).execute()
            total += resp.data or 0

        return JSONResponse({"status": "ok", "deleted": total})

    except Exception as exc:
        logger.exception("Delete failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def update_policy(request: Request) -> JSONResponse:
    """Update metadata fields for all document chunks matching the given source paths."""
    try:
        body = await request.json()
        source_paths = body.get("source_paths", [])
        updates = body.get("updates", {})

        if not source_paths or not updates:
            return JSONResponse(
                {"error": "source_paths and updates are required"}, status_code=400
            )

        _supabase_service().rpc(
            "update_policy_metadata",
            {"p_source_paths": source_paths, "p_updates": updates},
        ).execute()

        return JSONResponse({"status": "ok"})

    except Exception as exc:
        logger.exception("Update failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def list_policies_http(request: Request) -> JSONResponse:
    """Return all policy documents for a tenant as structured JSON."""
    tenant_id = request.query_params.get("tenant_id") or None
    rpc_args = {"p_tenant_id": tenant_id} if tenant_id else {}
    resp = _supabase().rpc("list_policies", rpc_args).execute()
    return JSONResponse(resp.data or [])


async def get_coverage_analysis(request: Request) -> JSONResponse:
    """Return stored coverage analysis JSON for a tenant, or {} if none exists."""
    tenant_id = request.query_params.get("tenant_id") or None
    if not tenant_id:
        return JSONResponse({})
    resp = _supabase_service().table("coverage_analysis").select("analysis").eq("tenant_id", tenant_id).execute()
    if resp.data:
        return JSONResponse(resp.data[0]["analysis"])
    return JSONResponse({})


async def store_coverage_analysis(request: Request) -> JSONResponse:
    """Upsert coverage analysis JSON for a tenant."""
    try:
        tenant_id = request.query_params.get("tenant_id") or None
        if not tenant_id:
            return JSONResponse({"error": "tenant_id is required"}, status_code=400)
        body = await request.json()
        analysis = body.get("analysis", {})
        _supabase_service().table("coverage_analysis").upsert(
            {"tenant_id": tenant_id, "analysis": analysis, "updated_at": datetime.now(datetime.UTC).isoformat()},
            on_conflict="tenant_id",
        ).execute()
        return JSONResponse({"status": "ok"})
    except Exception as exc:
        logger.exception("Store coverage analysis failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


async def upload_document(request: Request) -> JSONResponse:
    """Receive a PDF, chunk/embed it, and store in Supabase."""
    try:
        form = await request.form()
        file = form.get("file")
        if file is None:
            return JSONResponse({"error": "No file field in form"}, status_code=400)

        contents = await file.read()
        filename = file.filename or "upload.pdf"
        source_folder = form.get("source_folder")
        tenant_id = form.get("tenant_id") or None

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        try:
            # Import ingestion modules (lazy — only needed when upload is called)
            from pdf_chunk import chunk_pdf, extract_metadata_llm  # noqa: PLC0415
            from embed import embed_texts  # noqa: PLC0415
            from store import get_existing_hashes, upsert_chunks  # noqa: PLC0415

            # Extract metadata (policy_type, provider, renewal_date, etc.) via LLM
            llm_meta = extract_metadata_llm(Path(tmp_path), _openai_client())
            # Web uploads are always insurance documents — don't let LLM override doc_type
            llm_meta.pop("doc_type", None)
            base_metadata: dict = {"doc_type": "policy", "filename": filename, **llm_meta}
            if tenant_id:
                base_metadata["tenant_id"] = tenant_id

            # Build source_path. Per-card uploads supply source_folder explicitly.
            # Global uploads get a structured path so that two PDFs with the same
            # filename but different content (e.g. two "Policy Schedule" PDFs for
            # different vehicles) don't collide on the same chunk hashes.
            if source_folder and isinstance(source_folder, str):
                source_path = f"{str(source_folder).rstrip('/')}/{filename}"
            else:
                policy_type = llm_meta.get("policy_type", "")
                insured_entity = llm_meta.get("insured_entity", "")
                if policy_type and insured_entity:
                    source_path = f"Insurance/{policy_type.capitalize()}/{insured_entity}/{filename}"
                elif policy_type:
                    # No entity extracted — use a content fingerprint to keep same-named
                    # files distinct while still deduplicating identical re-uploads.
                    import hashlib as _hashlib
                    fingerprint = _hashlib.sha256(contents).hexdigest()[:12]
                    source_path = f"Insurance/{policy_type.capitalize()}/{fingerprint}/{filename}"
                else:
                    source_path = filename

            chunks = chunk_pdf(
                Path(tmp_path),
                source_path=source_path,
                base_metadata=base_metadata,
            )

            if not chunks:
                return JSONResponse(
                    {"status": "ok", "chunks": 0, "filename": filename,
                     "message": "No extractable text found in PDF."}
                )

            texts = [c.content for c in chunks]
            embeddings = embed_texts(texts, _openai_client())

            sb = _supabase_service()
            existing = get_existing_hashes([c.chunk_hash for c in chunks], sb)
            new_chunks = [c for c in chunks if c.chunk_hash not in existing]
            new_embeddings = [
                e for c, e in zip(chunks, embeddings) if c.chunk_hash not in existing
            ]

            stored = upsert_chunks(new_chunks, new_embeddings, sb)
            return JSONResponse({"status": "ok", "chunks": stored, "filename": filename})

        finally:
            os.unlink(tmp_path)

    except Exception as exc:
        logger.exception("Upload failed")
        return JSONResponse({"error": str(exc)}, status_code=500)


# ---------------------------------------------------------------------------
# Combined ASGI app (FastMCP + /upload)
#
# We inject /upload directly into FastMCP's own Starlette router rather than
# wrapping it in an outer app. This preserves FastMCP's lifespan context,
# which initialises the StreamableHTTP session manager task group.
# ---------------------------------------------------------------------------

def build_app() -> Starlette:
    broker_app = mcp.streamable_http_app()
    # Prepend /upload so it matches before FastMCP's catch-all routes
    broker_app.router.routes.insert(
        0, Route("/delete-policy", delete_policy, methods=["DELETE"])
    )
    broker_app.router.routes.insert(
        0, Route("/update-policy", update_policy, methods=["PATCH"])
    )
    broker_app.router.routes.insert(
        0, Route("/upload", upload_document, methods=["POST"])
    )
    broker_app.router.routes.insert(
        0, Route("/list-policies", list_policies_http, methods=["GET"])
    )
    broker_app.router.routes.insert(
        0, Route("/coverage-analysis", get_coverage_analysis, methods=["GET"])
    )
    broker_app.router.routes.insert(
        0, Route("/coverage-analysis", store_coverage_analysis, methods=["POST"])
    )
    return broker_app


app = build_app()

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=_port)
