#!/usr/bin/env python3
"""
Insurance document ingestion pipeline.

Usage:
  python ingest.py                          # full ingest
  python ingest.py --dry-run                # preview only, no API calls
  python ingest.py --path "Insurance/Car"   # single subfolder
  python ingest.py --force                  # re-embed everything
  python ingest.py --clean                  # truncate DB then re-ingest
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

from chunk import Chunk, chunk_pdf, extract_insurer_info_from_pdf, extract_metadata_llm
from embed import embed_texts
from store import get_existing_hashes, upsert_chunks

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DOCS_ROOT = Path(os.environ["DOCS_ROOT"])

# ---------------------------------------------------------------------------
# Provider extraction from filename
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Metadata inference from folder path (relative to DOCS_ROOT)
# ---------------------------------------------------------------------------

def infer_metadata(rel_path: Path) -> dict:
    """Return metadata dict based on the file's relative path."""
    parts = [p.lower() for p in rel_path.parts[:-1]]  # directories only

    def _matches(*keywords: str) -> bool:
        return any(k in p for k in keywords for p in parts)

    if _matches("insurance"):
        meta: dict = {"doc_type": "policy"}
        if _matches("car"):
            meta["policy_type"] = "car"
        elif _matches("home", "buildings", "house"):
            meta["policy_type"] = "home"
            if _matches("the barns", "barns"):
                meta["insured_entity"] = "the_barns"
            elif _matches("ashley cottages", "ashley"):
                meta["insured_entity"] = "ashley_cottages"
            elif _matches("wicks lane", "wicks"):
                meta["insured_entity"] = "wicks_lane_access"
        elif _matches("breakdown"):
            meta["policy_type"] = "breakdown"
        elif _matches("life"):
            meta["policy_type"] = "life"
        elif _matches("phone", "mobile", "gadget"):
            meta["policy_type"] = "phone"
        elif _matches("travel"):
            meta["policy_type"] = "travel"
    elif _matches("cars"):
        meta = {"doc_type": "asset", "asset_category": "car"}
    elif _matches("bikes"):
        meta = {"doc_type": "asset", "asset_category": "bike"}
    elif _matches("appliances", "machines"):
        meta = {"doc_type": "asset", "asset_category": "appliance"}
    else:
        meta = {"doc_type": "unknown"}

    return meta


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def collect_pdfs(root: Path, sub_path: str | None) -> list[Path]:
    search_root = root / sub_path if sub_path else root
    if not search_root.exists():
        logger.error("Path does not exist: %s", search_root)
        sys.exit(1)
    return sorted(search_root.rglob("*.pdf"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest insurance PDFs into Supabase vector store")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no API calls")
    parser.add_argument("--path", metavar="SUBPATH", help="Process only this subfolder of DOCS_ROOT")
    parser.add_argument("--force", action="store_true", help="Re-embed everything, ignore dedup")
    parser.add_argument("--clean", action="store_true", help="Truncate all documents from DB before ingesting")
    parser.add_argument("--enrich", action="store_true", help="Backfill LLM-extracted metadata for existing DB records (no re-embedding)")
    args = parser.parse_args()

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    # ------------------------------------------------------------------
    # --enrich: backfill LLM metadata for existing DB records
    # ------------------------------------------------------------------
    if args.enrich:
        sb = create_client(supabase_url, supabase_key)
        rows = sb.rpc("list_policies").execute().data or []
        logger.info("Enriching %d distinct document(s) with LLM metadata…", len(rows))
        for row in rows:
            source_path = row.get("source_path")
            if not source_path:
                continue
            pdf_path = DOCS_ROOT / source_path
            if not pdf_path.exists():
                logger.warning("  PDF not found, skipping: %s", source_path)
                continue
            extracted = extract_metadata_llm(pdf_path, openai_client)
            if not extracted:
                logger.info("  %s → nothing extracted", source_path)
                continue
            logger.info("  %s → %s", source_path, extracted)
            if not args.dry_run:
                sb.rpc("update_policy_metadata", {
                    "p_source_paths": [source_path],
                    "p_updates": extracted,
                }).execute()
        logger.info("Enrich complete%s.", " (dry-run)" if args.dry_run else "")
        return

    pdfs = collect_pdfs(DOCS_ROOT, args.path)
    logger.info("Found %d PDF(s) under %s", len(pdfs), DOCS_ROOT / (args.path or ""))

    # ------------------------------------------------------------------
    # Chunk all PDFs (LLM metadata extraction per document)
    # ------------------------------------------------------------------
    all_chunks: list[Chunk] = []
    for pdf_path in pdfs:
        rel = pdf_path.relative_to(DOCS_ROOT)
        base_meta = infer_metadata(rel)
        base_meta["filename"] = pdf_path.name
        base_meta.update(extract_metadata_llm(pdf_path, openai_client))
        chunks = chunk_pdf(pdf_path, str(rel), base_meta)
        logger.info("  %s → %d chunk(s)", rel, len(chunks))
        all_chunks.extend(chunks)

    logger.info("Total chunks: %d", len(all_chunks))

    if args.dry_run:
        logger.info("Dry-run complete.")
        return

    # ------------------------------------------------------------------
    # Deduplication (unless --force)
    # ------------------------------------------------------------------
    sb = create_client(supabase_url, supabase_key)

    if args.clean:
        logger.info("--clean: truncating all existing records from Supabase…")
        sb.table("documents").delete().neq("id", 0).execute()
        logger.info("Table cleared.")

    if args.force or args.clean:
        new_chunks = all_chunks
        logger.info("Re-embedding all %d chunks", len(new_chunks))
    else:
        all_hashes = [c.chunk_hash for c in all_chunks]
        existing = get_existing_hashes(all_hashes, sb)
        new_chunks = [c for c in all_chunks if c.chunk_hash not in existing]
        logger.info(
            "%d chunk(s) already in DB, %d new to embed",
            len(existing), len(new_chunks),
        )

    if not new_chunks:
        logger.info("0 new embeddings — nothing to do.")
        return

    # ------------------------------------------------------------------
    # Embed + upsert
    # ------------------------------------------------------------------
    texts = [c.content for c in new_chunks]
    logger.info("Embedding %d chunk(s)…", len(texts))
    embeddings = embed_texts(texts, openai_client)

    logger.info("Upserting %d chunk(s) into Supabase…", len(new_chunks))
    count = upsert_chunks(new_chunks, embeddings, sb)
    logger.info("Done. %d row(s) upserted.", count)


if __name__ == "__main__":
    main()
