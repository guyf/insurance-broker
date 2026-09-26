"""
Curated registry of publicly available UK insurer policy wording PDFs, for
market comparison. Currently empty — see MARKET_POLICIES below.

Structure:
  MARKET_POLICIES[policy_type][provider_display_name] = [
      {"name": str, "url": str},
      ...
  ]

policy_type values match the upload extractor's (pdf_chunk._KNOWN_POLICY_TYPES)

source_path convention for ingested chunks:
  market/{policy_type}/{provider_slug}/{filename}
  e.g.  market/cyber/hiscox/cyber-policy-wording.pdf

provider_slug = display name lowercased, spaces and special chars → hyphens,
                computed by slug() below.
"""

import re


def slug(name: str) -> str:
    """Convert a provider display name to a URL/path-safe slug."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def filename_from_url(url: str) -> str:
    """Extract a clean filename from a URL."""
    part = url.rstrip("/").split("/")[-1].split("?")[0]
    return part if part.endswith(".pdf") else part + ".pdf"


def source_path(policy_type: str, provider: str, url: str) -> str:
    return f"market/{policy_type}/{slug(provider)}/{filename_from_url(url)}"


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

# Emptied 2026-09-26 when the product became SME-only: the previous entries
# were personal-lines (car / home / pet) booklets. SME commercial policy
# wordings may be added here later, keyed by the same policy_type values the
# upload extractor uses (e.g. "public_liability", "cyber").
MARKET_POLICIES: dict[str, dict[str, list[dict]]] = {}
