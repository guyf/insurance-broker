"""PDF extraction and chunking."""

import hashlib
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber
import tiktoken

logger = logging.getLogger(__name__)

CHUNK_TOKEN_LIMIT = 500
CHUNK_OVERLAP_TOKENS = 100
MIN_PAGE_CHARS = 20

# Regex patterns for best-effort metadata extraction
_RENEWAL_DATE_RE = re.compile(
    r"renewal\s+date[:\s]+(\d{1,2}[\s/\-]\w+[\s/\-]\d{2,4}|\d{1,2}/\d{1,2}/\d{2,4})",
    re.IGNORECASE,
)
_PREMIUM_RE = re.compile(
    r"(?:total\s+)?(?:annual\s+)?premium[:\s]+[£$]?([\d,]+(?:\.\d{2})?)",
    re.IGNORECASE,
)


@dataclass
class Chunk:
    content: str
    source_path: str   # relative to DOCS_ROOT
    filename: str
    page_num: int      # 1-based
    chunk_index: int   # 0-based within page
    metadata: dict = field(default_factory=dict)

    @property
    def chunk_hash(self) -> str:
        raw = f"{self.source_path}|{self.page_num}|{self.chunk_index}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def to_metadata(self) -> dict:
        return {
            **self.metadata,
            "source_path": self.source_path,
            "filename": self.filename,
            "page_num": self.page_num,
            "chunk_index": self.chunk_index,
        }


def _tokenise(text: str, enc: tiktoken.Encoding) -> list[int]:
    return enc.encode(text)


def _sliding_window(tokens: list[int], enc: tiktoken.Encoding) -> list[str]:
    """Split token list into overlapping windows, return decoded strings."""
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_TOKEN_LIMIT, len(tokens))
        chunks.append(enc.decode(tokens[start:end]))
        if end == len(tokens):
            break
        start += CHUNK_TOKEN_LIMIT - CHUNK_OVERLAP_TOKENS
    return chunks


def _extract_renewal_date(text: str) -> str | None:
    m = _RENEWAL_DATE_RE.search(text)
    return m.group(1).strip() if m else None


def _extract_premium(text: str) -> str | None:
    m = _PREMIUM_RE.search(text)
    return m.group(1).strip() if m else None


def chunk_pdf(pdf_path: Path, source_path: str, base_metadata: dict) -> list[Chunk]:
    """Extract text from PDF and return Chunk objects."""
    enc = tiktoken.get_encoding("cl100k_base")
    chunks: list[Chunk] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_index, page in enumerate(pdf.pages):
                page_num = page_index + 1
                text = page.extract_text() or ""

                if len(text.strip()) < MIN_PAGE_CHARS:
                    logger.warning(
                        "Page %d of %s has < %d chars — likely scanned/image page, skipping",
                        page_num, pdf_path.name, MIN_PAGE_CHARS,
                    )
                    continue

                # Best-effort metadata extraction
                page_meta: dict = {}
                renewal_date = _extract_renewal_date(text)
                if renewal_date:
                    page_meta["renewal_date"] = renewal_date
                premium = _extract_premium(text)
                if premium:
                    page_meta["premium"] = premium

                tokens = _tokenise(text, enc)
                if len(tokens) <= CHUNK_TOKEN_LIMIT:
                    page_texts = [text]
                else:
                    page_texts = _sliding_window(tokens, enc)

                for chunk_index, chunk_text in enumerate(page_texts):
                    merged_meta = {**base_metadata, **page_meta}
                    chunks.append(Chunk(
                        content=chunk_text,
                        source_path=source_path,
                        filename=pdf_path.name,
                        page_num=page_num,
                        chunk_index=chunk_index,
                        metadata=merged_meta,
                    ))
    except Exception as exc:
        logger.error("Failed to process %s: %s", pdf_path, exc)

    return chunks
