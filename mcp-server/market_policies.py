"""
Curated registry of publicly available UK personal lines policy booklet PDFs.

Structure:
  MARKET_POLICIES[policy_type][provider_display_name] = [
      {"name": str, "url": str},
      ...
  ]

policy_type values match the schema: "car", "home", "pet"

source_path convention for ingested chunks:
  market/{policy_type}/{provider_slug}/{filename}
  e.g.  market/car/admiral/car-policy-booklet.pdf

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

MARKET_POLICIES: dict[str, dict[str, list[dict]]] = {
    "car": {
        "Admiral": [
            {
                "name": "Admiral Car Insurance Policy Booklet",
                "url": "https://www.admiral.com/policyDocs/AD-003-022-Your-Cover-with-Admiral.pdf",
            }
        ],
        "Direct Line": [
            {
                "name": "Direct Line Car Insurance Policy Booklet",
                "url": "https://assets.directline.com/motor-docs/policy-booklet-0622.pdf",
            }
        ],
        "Aviva": [
            {
                "name": "Aviva Motor Insurance Policy Wording",
                "url": "https://www.online.aviva.co.uk/StaticDocsAV/Insurance_policy_default_v14.pdf",
            }
        ],
        "Churchill": [
            {
                "name": "Churchill Car Insurance Policy Booklet",
                "url": "https://assets.churchill.com/motor-docs/policy-booklet-1225.pdf",
            }
        ],
        "LV=": [
            {
                "name": "LV= Motor Insurance Terms & Conditions",
                "url": "https://www.lv.com/rcn/-/insurance/media/partner-microsites/pdfs/car/2024/38905-2024-our-terms-and-conditions---motor--v2.pdf",
            }
        ],
        "Hastings Direct": [
            {
                "name": "Hastings Direct Car Insurance Policy Wording",
                "url": "https://www.hastingsdirect.com/documents/Policy_documents/Car/HD-PC-GW-11-20.pdf",
            }
        ],
    },
    "home": {
        "Admiral": [
            {
                "name": "Admiral Home Insurance Policy Booklet",
                "url": "https://www.admiral.com/policyDocs/HH-005-015-Standard-Policy-Book.pdf",
            }
        ],
        "Direct Line": [
            {
                "name": "Direct Line Home Insurance Policy Booklet",
                "url": "https://www.directline.com/assets/pdf/dl-home-insurance-policy-document-0925.pdf",
            }
        ],
        "Aviva": [
            {
                "name": "Aviva Home Insurance Policy Wording",
                "url": "https://www.online.aviva.co.uk/StaticDocsAV/Home_wording_default_v3.pdf",
            }
        ],
        "Churchill": [
            {
                "name": "Churchill Home Insurance Policy Booklet",
                "url": "https://www.churchill.com/assets/pdf/ch-home-insurance-policy-booklet-0925.pdf",
            }
        ],
        "LV=": [
            {
                "name": "LV= Home Insurance Terms & Conditions",
                "url": "https://assets-eu-01.kc-usercontent.com/8a09b82e-1cf1-011c-1115-9dc18d2d065f/da90c36d-5b6c-478b-93ee-3887d69b2b30/Download%20LV%20Insurance%20Terms%20and%20Conditions%20document%20(PDF).pdf",
            }
        ],
        "AXA": [
            {
                "name": "AXA Home Insurance Policy Wording",
                "url": "https://www.axa.co.uk/globalassets/pdfs/home/policy-docs/june-2025/axa-direct-home-policy-wording-acpd0400p-d.pdf",
            }
        ],
    },
    "pet": {
        "Petplan": [
            {
                "name": "Petplan Covered for Life Policy Terms & Conditions",
                "url": "https://www.petplan.co.uk/pdf/PP_CFL_TCs.pdf",
            }
        ],
        "Direct Line": [
            {
                "name": "Direct Line Pet Insurance Policy Booklet",
                "url": "https://www.directline.com/assets/pdf/pet-insurance-policy-document.pdf",
            }
        ],
        "More Than": [
            {
                "name": "More Than Pet Insurance Policy Wording",
                "url": "https://static.rsagroup.com/more-than/Pet/more-than-pet-insurance-policy-wording.pdf",
            }
        ],
        "Animal Friends": [
            {
                "name": "Animal Friends Lifetime Pet Insurance Policy Booklet",
                "url": "https://www.animalfriends.co.uk/siteassets/media/pdfs/policy-documents/policy-booklets/v5-2025/lifetime_super_superior_superior-plus.pdf",
            }
        ],
        "Aviva": [
            {
                "name": "Aviva Pet Insurance Policy",
                "url": "https://www.aviva.co.uk/static/library/pdfs/pet/pet-insurance-policy.pdf",
            }
        ],
        "ManyPets": [
            {
                "name": "ManyPets Pet Insurance Handbook",
                "url": "https://manypets.com/uk/resources/policy-wording/Pet-Insurance-Handbook-2024-08-01-IBS.pdf",
            }
        ],
    },
}
