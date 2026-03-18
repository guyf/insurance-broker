"""Supabase upsert."""

import logging
from supabase import Client
from chunk import Chunk

logger = logging.getLogger(__name__)

UPSERT_BATCH_SIZE = 50


def get_existing_hashes(hashes: list[str], client: Client) -> set[str]:
    """Return the subset of hashes already present in the DB."""
    if not hashes:
        return set()
    response = (
        client.table("documents")
        .select("chunk_hash")
        .in_("chunk_hash", hashes)
        .execute()
    )
    return {row["chunk_hash"] for row in response.data}


def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    client: Client,
) -> int:
    """Upsert chunks with their embeddings. Returns count of rows upserted."""
    if not chunks:
        return 0

    rows = [
        {
            "content": chunk.content,
            "embedding": embedding,
            "metadata": chunk.to_metadata(),
            "chunk_hash": chunk.chunk_hash,
        }
        for chunk, embedding in zip(chunks, embeddings)
    ]

    inserted = 0
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
        batch = rows[i : i + UPSERT_BATCH_SIZE]
        client.table("documents").upsert(batch, on_conflict="chunk_hash").execute()
        inserted += len(batch)
        logger.debug("Upserted %d/%d rows", inserted, len(rows))

    return inserted
