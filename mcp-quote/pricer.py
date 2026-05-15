"""
Deterministic pricing models for home, motor, and pet insurance.

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
# Home
# ---------------------------------------------------------------------------

HOME_BASE = {"buildings": 180.0, "contents": 120.0, "both": 280.0}

PROPERTY_TYPE_FACTOR = {
    "house": 1.00,
    "flat": 0.85,
    "bungalow": 1.10,
    "cottage": 1.25,
}


def price_home(
    property_type: str,
    bedrooms: int,
    rebuild_value: float,
    postcode: str,
    year_built: int = 1970,
    claims_last_5_years: int = 0,
    cover_type: str = "both",
) -> dict:
    base = HOME_BASE.get(cover_type.lower(), 280.0)

    # Property type
    pt_factor = PROPERTY_TYPE_FACTOR.get(property_type.lower(), 1.0)
    base *= pt_factor

    # Rebuild value: +£0.80 per £1,000
    base += (rebuild_value / 1_000.0) * 0.80

    # Bedrooms: +8% per bedroom above 2
    if bedrooms > 2:
        base *= 1.0 + 0.08 * (bedrooms - 2)

    # Property age: +0.25% per year
    age = max(0, date.today().year - year_built)
    base *= 1.0 + 0.0025 * age

    # Claims loading: +30% per claim
    base *= 1.0 + 0.30 * claims_last_5_years

    # Postcode variation: ±15%
    base *= _hash_variation(postcode.upper().replace(" ", ""), 0.15)

    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "home",
            "property_type": property_type,
            "bedrooms": bedrooms,
            "rebuild_value": rebuild_value,
            "postcode": postcode,
            "year_built": year_built,
            "claims": claims_last_5_years,
            "cover_type": cover_type,
        }),
    }


# ---------------------------------------------------------------------------
# Motor
# ---------------------------------------------------------------------------

MOTOR_BASE = {
    "third_party": 300.0,
    "tpft": 450.0,
    "comprehensive": 550.0,
}


def price_motor(
    make: str,
    model: str,
    year: int,
    value: float,
    driver_age: int,
    annual_mileage: int,
    no_claims_years: int = 0,
    postcode: str = "",
    cover_level: str = "comprehensive",
) -> dict:
    base = MOTOR_BASE.get(cover_level.lower(), 550.0)

    # Driver age
    if driver_age < 25:
        base *= 1.0 + 0.08 * (25 - driver_age)
    elif driver_age > 70:
        base *= 1.0 + 0.05 * (driver_age - 70)

    # NCB: -10% per year, max -60%
    ncb_discount = min(0.60, 0.10 * no_claims_years)
    base *= 1.0 - ncb_discount

    # Annual mileage: scale 0.8× → 1.2× over 0–20,000 miles
    mileage_factor = 0.8 + (min(annual_mileage, 20_000) / 20_000.0) * 0.4
    base *= mileage_factor

    # Vehicle value: +0.3% per £1,000
    base += (value / 1_000.0) * 0.30 * base / base  # keeps proportional
    base += (value / 1_000.0) * 3.0

    # Vehicle age: -2% per year, min 0.7×
    vehicle_age = max(0, date.today().year - year)
    age_factor = max(0.7, 1.0 - 0.02 * vehicle_age)
    base *= age_factor

    # Postcode variation: ±20%
    if postcode:
        base *= _hash_variation(postcode.upper().replace(" ", ""), 0.20)

    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "motor",
            "make": make.lower(),
            "model": model.lower(),
            "year": year,
            "value": value,
            "driver_age": driver_age,
            "mileage": annual_mileage,
            "ncb": no_claims_years,
            "postcode": postcode,
            "cover_level": cover_level,
        }),
    }


# ---------------------------------------------------------------------------
# Pet
# ---------------------------------------------------------------------------

PET_BASE = {
    "dog": 200.0,
    "cat": 120.0,
    "rabbit": 80.0,
    "other": 100.0,
}

# Dog breed risk tiers  (lower-case keys)
DOG_BREED_TIER = {
    # low risk — no uplift
    "labrador": 0.0, "labrador retriever": 0.0, "golden retriever": 0.0,
    "spaniel": 0.0, "cocker spaniel": 0.0, "springer spaniel": 0.0,
    "border collie": 0.0, "beagle": 0.0, "whippet": 0.0,
    # mid risk — +40%
    "german shepherd": 0.40, "gsd": 0.40, "boxer": 0.40,
    "rottweiler": 0.40, "dobermann": 0.40, "husky": 0.40,
    "siberian husky": 0.40, "weimaraner": 0.40,
    # high risk (brachycephalic / prone to health issues) — +90%
    "french bulldog": 0.90, "frenchie": 0.90,
    "english bulldog": 0.90, "bulldog": 0.90,
    "pug": 0.90, "dachshund": 0.90, "sausage dog": 0.90,
    "cavalier king charles": 0.90, "cavalier": 0.90,
    "shih tzu": 0.90, "boston terrier": 0.90,
}


def price_pet(
    species: str,
    breed: str,
    age_years: float,
    vet_limit: int = 5_000,
    neutered: bool = True,
) -> dict:
    base = PET_BASE.get(species.lower(), 100.0)

    # Breed tier (dogs only)
    if species.lower() == "dog":
        tier_uplift = DOG_BREED_TIER.get(breed.lower(), 0.0)
        base *= 1.0 + tier_uplift

    # Vet limit: scale 0.7× → 1.3× from £1k to £10k
    limit_factor = 0.7 + (min(max(vet_limit, 1_000), 10_000) - 1_000) / 9_000.0 * 0.6
    base *= limit_factor

    # Age
    if age_years < 1:
        base *= 1.30
    elif age_years <= 7:
        pass  # 1.0×
    else:
        base *= 1.0 + 0.12 * (age_years - 7)

    # Neutered discount
    if neutered:
        base *= 0.90

    return {
        "base": round(base, 2),
        "ref": _quote_ref({
            "type": "pet",
            "species": species.lower(),
            "breed": breed.lower(),
            "age_years": age_years,
            "vet_limit": vet_limit,
            "neutered": neutered,
        }),
    }


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
        "home_excess": 250, "motor_excess": 500, "pet_excess": 99,
        "public_liability_excess": 500,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 1_000,
        "cyber_excess": 1_000,
        "features": {
            "home": [
                ("✓", "Accidental damage included"),
                ("✓", "New-for-old replacement"),
                ("✓", "Unlimited buildings cover"),
                ("✗", "No legal expenses"),
            ],
            "motor": [
                ("✓", "Courtesy car included"),
                ("✓", "European cover 90 days"),
                ("✓", "Windscreen repair"),
                ("✗", "No breakdown cover"),
            ],
            "pet": [
                ("✓", "Dental illness cover"),
                ("✓", "Behavioural treatment"),
                ("✗", "No complementary therapy"),
                ("✗", "No death from illness benefit"),
            ],
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
        "home_excess": 200, "motor_excess": 400, "pet_excess": 75,
        "public_liability_excess": 250,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 500,
        "cyber_excess": 500,
        "features": {
            "home": [
                ("✓", "Accidental damage included"),
                ("✓", "Legal expenses £100k"),
                ("✓", "Home emergency cover"),
                ("✗", "Indemnity basis only"),
            ],
            "motor": [
                ("✓", "Courtesy car included"),
                ("✓", "Legal expenses £100k"),
                ("✓", "European cover 120 days"),
                ("✗", "No breakdown cover"),
            ],
            "pet": [
                ("✓", "Dental illness cover"),
                ("✓", "Complementary therapy"),
                ("✓", "Death from illness benefit"),
                ("✗", "No behavioural treatment"),
            ],
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
        "home_excess": 100, "motor_excess": 250, "pet_excess": 50,
        "public_liability_excess": 100,
        "employers_liability_excess": 0,
        "professional_indemnity_excess": 250,
        "cyber_excess": 250,
        "features": {
            "home": [
                ("✓", "Comprehensive accidental damage"),
                ("✓", "New-for-old"),
                ("✓", "Legal expenses £100k"),
                ("✓", "Home emergency cover"),
            ],
            "motor": [
                ("✓", "Courtesy car included"),
                ("✓", "Legal expenses £100k"),
                ("✓", "Breakdown cover included"),
                ("✓", "European cover unlimited"),
            ],
            "pet": [
                ("✓", "Dental illness cover"),
                ("✓", "Complementary therapy"),
                ("✓", "Death from illness benefit"),
                ("✓", "Behavioural treatment"),
            ],
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
        excess = insurer.get(excess_key, insurer["home_excess"])

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
