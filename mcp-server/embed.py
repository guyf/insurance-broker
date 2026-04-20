"""OpenAI embeddings — batched."""

import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

MODEL = "text-embedding-3-small"
BATCH_SIZE = 100


def embed_texts(texts: list[str], client: OpenAI) -> list[list[float]]:
    """Return embeddings for a list of texts, batched to stay within API limits."""
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        logger.debug("Embedding batch %d–%d of %d", i + 1, i + len(batch), len(texts))
        response = client.embeddings.create(model=MODEL, input=batch)
        # Sort by index to ensure order is preserved
        sorted_data = sorted(response.data, key=lambda d: d.index)
        all_embeddings.extend(d.embedding for d in sorted_data)
    return all_embeddings
