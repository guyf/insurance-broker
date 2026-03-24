"""PDF extraction and chunking."""

import hashlib
import json
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
# Matches explicit insurer labels (who you have the policy with)
_INSURER_RE = re.compile(
    r"(?:insurer|insured\s+(?:with|by)|provided\s+by|your\s+insurer\s+is)"
    r"[:\s]+([A-Z][A-Za-z0-9 &()'\-]{2,60}?)(?:\s+(?:plc|ltd|limited|group|llp))?(?:\s*[\n,.]|$)",
    re.IGNORECASE,
)
# Matches explicit underwriter labels (who backs the risk)
_UNDERWRITER_RE = re.compile(
    r"(?:underwritten\s+by|underwriter)"
    r"[:\s]+([A-Z][A-Za-z0-9 &()'\-]{2,60}?)(?:\s+(?:plc|ltd|limited|group|llp|syndicate\s*\d*))?(?:\s*[\n,.]|$)",
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


def extract_insurer_info_from_pdf(pdf_path: Path) -> dict:
    """Regex fallback: read first page and extract provider/underwriter."""
    info: dict = {}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not pdf.pages:
                return info
            text = pdf.pages[0].extract_text() or ""
            m = _INSURER_RE.search(text)
            if m:
                info["provider"] = m.group(1).strip()
            m = _UNDERWRITER_RE.search(text)
            if m:
                info["underwriter"] = m.group(1).strip()
    except Exception:
        pass
    return info


def extract_metadata_llm(pdf_path: Path, openai_client) -> dict:
    """Use GPT-4o-mini to extract structured metadata from the first pages of a PDF.

    Returns a dict with any of: provider, underwriter, renewal_date, premium, insured_entity.
    Falls back to regex on failure.
    """
    text_parts: list[str] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:3]:
                t = page.extract_text() or ""
                if t.strip():
                    text_parts.append(t)
    except Exception:
        return extract_insurer_info_from_pdf(pdf_path)

    if not text_parts:
        return extract_insurer_info_from_pdf(pdf_path)

    text = "\n\n".join(text_parts)[:4000]

    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract structured fields from an insurance policy document. "
                        "Return only valid JSON. Omit keys where the value cannot be found."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Extract these fields:\n"
                        "- provider: the insurance company name (e.g. 'NFU Mutual')\n"
                        "- underwriter: underwriting company if explicitly different from provider\n"
                        "- renewal_date: policy renewal date as DD/MM/YYYY\n"
                        "- premium: annual premium as digits only, no £ or commas (e.g. '1234')\n"
                        "- insured_entity: what is insured — property address, "
                        "vehicle make/model/reg, or person name\n\n"
                        f"Document:\n{text}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=200,
        )
        result = json.loads(resp.choices[0].message.content)
        allowed = {"provider", "underwriter", "renewal_date", "premium", "insured_entity"}
        return {k: str(v) for k, v in result.items() if k in allowed and v}
    except Exception as exc:
        logger.warning("LLM metadata extraction failed for %s: %s", pdf_path.name, exc)
        return extract_insurer_info_from_pdf(pdf_path)


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
                    merged_meta = {**page_meta, **base_metadata}  # base_metadata (LLM) wins
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
