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
# Three-insurer panel
# ---------------------------------------------------------------------------

INSURERS = [
    {
        "name": "Beacon Insurance",
        "medal": "🥇",
        "price_factor": 1.00,
        "home_excess": 250, "motor_excess": 500, "pet_excess": 99,
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
        },
    },
    {
        "name": "Keystone Protect",
        "medal": "🥈",
        "price_factor": 1.05,
        "home_excess": 200, "motor_excess": 400, "pet_excess": 75,
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
        },
    },
    {
        "name": "Meridian Premium",
        "medal": "🥉",
        "price_factor": 1.23,
        "home_excess": 100, "motor_excess": 250, "pet_excess": 50,
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
