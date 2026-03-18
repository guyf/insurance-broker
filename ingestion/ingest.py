#!/usr/bin/env python3
"""
Insurance document ingestion pipeline.

Usage:
  python ingest.py                          # full ingest
  python ingest.py --dry-run                # preview only, no API calls
  python ingest.py --path "Insurance/Car"   # single subfolder
  python ingest.py --force                  # re-embed everything
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

from chunk import Chunk, chunk_pdf
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
            # Property sub-folder
            if _matches("the barns", "barns"):
                meta["property"] = "the_barns"
            elif _matches("ashley cottages", "ashley"):
                meta["property"] = "ashley_cottages"
            elif _matches("wicks lane", "wicks"):
                meta["property"] = "wicks_lane_access"
        elif _matches("breakdown"):
            meta["policy_type"] = "breakdown"
        elif _matches("life"):
            meta["policy_type"] = "life"
        elif _matches("phone", "mobile", "gadget"):
            meta["policy_type"] = "phone"
        elif _matches("travel"):
            meta["policy_type"] = "travel"
        return meta
    elif _matches("cars"):
        return {"doc_type": "asset", "asset_category": "car"}
    elif _matches("bikes"):
        return {"doc_type": "asset", "asset_category": "bike"}
    elif _matches("appliances", "machines"):
        return {"doc_type": "asset", "asset_category": "appliance"}

    return {"doc_type": "unknown"}


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
    args = parser.parse_args()

    pdfs = collect_pdfs(DOCS_ROOT, args.path)
    logger.info("Found %d PDF(s) under %s", len(pdfs), DOCS_ROOT / (args.path or ""))

    # ------------------------------------------------------------------
    # Chunk all PDFs
    # ------------------------------------------------------------------
    all_chunks: list[Chunk] = []
    for pdf_path in pdfs:
        rel = pdf_path.relative_to(DOCS_ROOT)
        base_meta = infer_metadata(rel)
        base_meta["filename"] = pdf_path.name
        chunks = chunk_pdf(pdf_path, str(rel), base_meta)
        logger.info("  %s → %d chunk(s)", rel, len(chunks))
        all_chunks.extend(chunks)

    logger.info("Total chunks: %d", len(all_chunks))

    if args.dry_run:
        logger.info("Dry-run complete. No API calls made.")
        return

    # ------------------------------------------------------------------
    # Deduplication (unless --force)
    # ------------------------------------------------------------------
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(supabase_url, supabase_key)
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    if args.force:
        new_chunks = all_chunks
        logger.info("--force: re-embedding all %d chunks", len(new_chunks))
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
