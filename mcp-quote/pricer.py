"""
Deterministic illustrative pricing models for the four SME commercial lines:
public liability, employers' liability, professional indemnity and cyber.

Same inputs always produce the same quote (hash-seeded variation).
"""

import hashlib
from datetime import date


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_variation(seed: str, spread: float) -> float:
    """Return a deterministic multiplier in [1-spread, 1+spread]."""
    digest = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    # normalise to [0, 1]
    norm = (digest % 10_000) / 10_000.0
    # map to [1-spread, 1+spread]
    return 1.0 - spread + norm * 2 * spread


def _quote_ref(inputs: dict) -> str:
    year = date.today().year
    key = "|".join(f"{k}={v}" for k, v in sorted(inputs.items()))
    digest = hashlib.md5(key.encode()).hexdigest()[:6].upper()
    return f"QT-{year}-{digest}"


def _monthly(annual: float) -> float:
    return round(annual / 12, 2)


# ---------------------------------------------------------------------------
# Commercial — Public Liability
# ---------------------------------------------------------------------------

INDUSTRY_RISK = {
    "office": 1.00,
    "technology": 1.05,
    "retail": 1.10,
    "hospitality": 1.20,
    "healthcare": 1.30,
    "manufacturing": 1.40,
    "engineering": 1.50,
    "construction": 1.80,
    "other": 1.10,
}

COVER_LIMIT_FACTOR_PL = {
    1_000_000: 1.00,
    2_000_000: 1.30,
    5_000_000: 1.65,
    10_000_000: 2.10,
}


def price_public_liability(
    revenue: float,
    employees: int,
    industry: str,
    postcode: str = "",
    cover_limit: float = 2_000_000,
) -> dict:
    base = 250.0
    # Revenue loading: +£20 per £100k above first £100k
    base += max(0, (revenue - 100_000) / 100_000) * 20.0
    # Employee loading: +£30 per employee above 2
    base += max(0, employees - 2) * 30.0
    # Industry risk
    base *= INDUSTRY_RISK.get(industry.lower(), 1.10)
    # Cover limit
    closest = min(COVER_LIMIT_FACTOR_PL, key=lambda x: abs(x - cover_limit))
    base *= COVER_LIMIT_FACTOR_PL[closest]
    # Postcode variation: ±10%
    if postcode:
        base *= _hash_variation(postcode.upper().replace(" ", ""), 0.10)
    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "public_liability",
            "revenue": revenue,
            "employees": employees,
            "industry": industry.lower(),
            "cover_limit": cover_limit,
        }),
    }


# ---------------------------------------------------------------------------
# Commercial — Employers' Liability
# ---------------------------------------------------------------------------

def price_employers_liability(
    employees: int,
    annual_payroll: float,
    industry: str,
) -> dict:
    # Statutory minimum £5m — we quote £10m (market standard)
    base = 180.0
    # Employee loading: +£45 per employee
    base += employees * 45.0
    # Payroll loading: +£30 per £50k payroll above £100k
    base += max(0, (annual_payroll - 100_000) / 50_000) * 30.0
    # Industry risk
    base *= INDUSTRY_RISK.get(industry.lower(), 1.10)
    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "employers_liability",
            "employees": employees,
            "annual_payroll": annual_payroll,
            "industry": industry.lower(),
        }),
    }


# ---------------------------------------------------------------------------
# Commercial — Professional Indemnity
# ---------------------------------------------------------------------------

PROFESSION_BASE = {
    "technology": 600.0,
    "consulting": 700.0,
    "marketing": 500.0,
    "architecture": 950.0,
    "engineering": 950.0,
    "legal": 1_200.0,
    "financial": 900.0,
    "general": 600.0,
}

COVER_LIMIT_FACTOR_PI = {
    250_000: 0.80,
    500_000: 1.00,
    1_000_000: 1.40,
    2_000_000: 1.85,
}


def price_professional_indemnity(
    revenue: float,
    profession: str,
    cover_limit: float = 500_000,
) -> dict:
    base = PROFESSION_BASE.get(profession.lower(), 600.0)
    # Revenue loading: +0.08% of revenue above £100k
    base += max(0, revenue - 100_000) * 0.0008
    # Cover limit factor
    closest = min(COVER_LIMIT_FACTOR_PI, key=lambda x: abs(x - cover_limit))
    base *= COVER_LIMIT_FACTOR_PI[closest]
    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "professional_indemnity",
            "revenue": revenue,
            "profession": profession.lower(),
            "cover_limit": cover_limit,
        }),
    }


# ---------------------------------------------------------------------------
# Commercial — Cyber Liability
# ---------------------------------------------------------------------------

CYBER_INDUSTRY_FACTOR = {
    "finance": 1.80,
    "healthcare": 1.60,
    "technology": 1.50,
    "retail": 1.20,
    "other": 1.00,
    "office": 1.00,
    "construction": 0.90,
    "manufacturing": 0.95,
}


def price_cyber(
    revenue: float,
    employees: int,
    industry: str,
    data_records_held: int = 0,
) -> dict:
    base = 800.0
    # Revenue loading: +0.15% of revenue
    base += revenue * 0.0015
    # Employee loading: +£25 per employee above 5
    base += max(0, employees - 5) * 25.0
    # Data records loading: +£100 per 10k records above 1k
    base += max(0, (data_records_held - 1_000) / 10_000) * 100.0
    # Industry factor
    base *= CYBER_INDUSTRY_FACTOR.get(industry.lower(), 1.00)
    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "cyber",
            "revenue": revenue,
            "employees": employees,
            "industry": industry.lower(),
            "data_records": data_records_held,
        }),
    }


# ---------------------------------------------------------------------------
# Three-insurer panel
# ---------------------------------------------------------------------------

INSURERS = [
    {
        "name": "Beacon Insurance",
        "medal": "🥇",
        "price_factor": 1.00,
        "public_liability_excess": 500,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 1_000,
        "cyber_excess": 1_000,
        "features": {
            "public_liability": [
                ("✓", "UK & EU cover included"),
                ("✓", "Products liability included"),
                ("✓", "Legal defence costs"),
                ("✗", "No worldwide cover"),
            ],
            "employers_liability": [
                ("✓", "£10m statutory cover"),
                ("✓", "Legal defence costs"),
                ("✓", "HSE investigation cover"),
                ("✗", "No management liability"),
            ],
            "professional_indemnity": [
                ("✓", "Claims-made basis"),
                ("✓", "Libel & slander cover"),
                ("✓", "Court attendance costs"),
                ("✗", "No cyber endorsement"),
            ],
            "cyber": [
                ("✓", "Data breach response"),
                ("✓", "Ransomware payments"),
                ("✓", "Business interruption"),
                ("✗", "No social engineering cover"),
            ],
        },
    },
    {
        "name": "Keystone Protect",
        "medal": "🥈",
        "price_factor": 1.05,
        "public_liability_excess": 250,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 500,
        "cyber_excess": 500,
        "features": {
            "public_liability": [
                ("✓", "Worldwide cover included"),
                ("✓", "Products liability included"),
                ("✓", "Legal defence costs"),
                ("✓", "Contractors extension"),
            ],
            "employers_liability": [
                ("✓", "£10m statutory cover"),
                ("✓", "Legal defence costs"),
                ("✓", "HSE investigation cover"),
                ("✓", "Employee theft extension"),
            ],
            "professional_indemnity": [
                ("✓", "Claims-made basis"),
                ("✓", "Libel & slander cover"),
                ("✓", "Court attendance costs"),
                ("✓", "Cyber liability endorsement"),
            ],
            "cyber": [
                ("✓", "Data breach response"),
                ("✓", "Ransomware payments"),
                ("✓", "Business interruption"),
                ("✓", "Social engineering cover"),
            ],
        },
    },
    {
        "name": "Meridian Premium",
        "medal": "🥉",
        "price_factor": 1.23,
        "public_liability_excess": 100,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 250,
        "cyber_excess": 250,
        "features": {
            "public_liability": [
                ("✓", "Worldwide cover included"),
                ("✓", "Products liability included"),
                ("✓", "Legal defence costs"),
                ("✓", "Contractors & tools extension"),
            ],
            "employers_liability": [
                ("✓", "£10m statutory cover"),
                ("✓", "Legal defence costs"),
                ("✓", "HSE investigation cover"),
                ("✓", "Management liability extension"),
            ],
            "professional_indemnity": [
                ("✓", "Claims-made basis"),
                ("✓", "Libel, slander & IP cover"),
                ("✓", "Court attendance costs"),
                ("✓", "Full cyber liability endorsement"),
            ],
            "cyber": [
                ("✓", "Data breach response"),
                ("✓", "Ransomware & extortion"),
                ("✓", "Business interruption"),
                ("✓", "Reputational harm PR costs"),
            ],
        },
    },
]


def build_panel(base_price: float, quote_ref: str, insurance_type: str) -> str:
    """Render the three-insurer comparison panel as a formatted string."""
    today = date.today().strftime("%-d %b %Y")
    lines = [
        f"Quote Reference: {quote_ref}",
        f"Generated: {today} | Valid 30 days",
        "─" * 41,
    ]

    for insurer in INSURERS:
        annual = round(base_price * insurer["price_factor"], 0)
        monthly = round(annual / 12, 2)

        excess_key = f"{insurance_type}_excess"
        excess = insurer[excess_key]

        lines.append(
            f"{insurer['medal']} {insurer['name']:<22} "
            f"£{annual:,.0f}/yr  (£{monthly:.0f}/mo)  Excess: £{excess}"
        )

        for mark, text in insurer["features"].get(insurance_type, []):
            lines.append(f"   {mark} {text}")

        lines.append("")

    # remove trailing blank line before footer
    if lines and lines[-1] == "":
        lines.pop()

    lines.append("─" * 41)
    lines.append("⚠️  Illustrative quotes only — not a real insurance offer.")
    lines.append("    Speak to an FCA-authorised broker for actual cover.")

    return "\n".join(lines)
