#!/usr/bin/env python3
"""
Insurance Quote MCP Server

Exposes four tools to Claude:
  - get_home_quote
  - get_motor_quote
  - get_pet_quote
  - analyze_photo
"""


import json
import logging
import os

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from photo_analyzer import analyze_photo as _analyze_photo
from pricer import (
    build_panel,
    price_home, price_motor, price_pet,
    price_public_liability, price_employers_liability,
    price_professional_indemnity, price_cyber,
)

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

_port = int(os.environ.get("PORT", 8001))
mcp = FastMCP("insurance-quote-mcp", host="0.0.0.0", port=_port, stateless_http=True)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def get_home_quote(
    property_type: str,
    bedrooms: int,
    rebuild_value: float,
    postcode: str,
    year_built: int = 1970,
    claims_last_5_years: int = 0,
    cover_type: str = "both",
) -> str:
    """Generate illustrative home insurance quotes from three fictional insurers.

    property_type: house / flat / bungalow / cottage
    bedrooms: number of bedrooms
    rebuild_value: rebuild (not market) value in £
    postcode: UK postcode
    year_built: year the property was built (default 1970)
    claims_last_5_years: number of claims in the last 5 years (default 0)
    cover_type: buildings / contents / both (default both)
    """
    result = price_home(
        property_type=property_type,
        bedrooms=bedrooms,
        rebuild_value=rebuild_value,
        postcode=postcode,
        year_built=year_built,
        claims_last_5_years=claims_last_5_years,
        cover_type=cover_type,
    )
    return build_panel(result["base"], result["ref"], "home")


@mcp.tool()
def get_motor_quote(
    make: str,
    model: str,
    year: int,
    value: float,
    driver_age: int,
    annual_mileage: int,
    no_claims_years: int = 0,
    postcode: str = "",
    cover_level: str = "comprehensive",
) -> str:
    """Generate illustrative motor insurance quotes from three fictional insurers.

    make: vehicle manufacturer (e.g. Ford, BMW)
    model: vehicle model (e.g. Focus, 3 Series)
    year: year of manufacture
    value: current market value in £
    driver_age: age of main driver
    annual_mileage: estimated annual mileage
    no_claims_years: years of no-claims bonus (default 0)
    postcode: UK postcode
    cover_level: third_party / tpft / comprehensive (default comprehensive)
    """
    result = price_motor(
        make=make,
        model=model,
        year=year,
        value=value,
        driver_age=driver_age,
        annual_mileage=annual_mileage,
        no_claims_years=no_claims_years,
        postcode=postcode,
        cover_level=cover_level,
    )
    return build_panel(result["base"], result["ref"], "motor")


@mcp.tool()
def get_pet_quote(
    species: str,
    breed: str,
    age_years: float,
    vet_limit: int = 5000,
    neutered: bool = True,
) -> str:
    """Generate illustrative pet insurance quotes from three fictional insurers.

    species: dog / cat / rabbit / other
    breed: breed name (e.g. Labrador, French Bulldog, Tabby)
    age_years: age of the pet in years (can be fractional, e.g. 0.5 for 6 months)
    vet_limit: annual vet fee limit in £ (default 5000)
    neutered: whether the pet is neutered (default True)
    """
    result = price_pet(
        species=species,
        breed=breed,
        age_years=age_years,
        vet_limit=vet_limit,
        neutered=neutered,
    )
    return build_panel(result["base"], result["ref"], "pet")


@mcp.tool()
def analyze_photo(image_url: str, asset_type: str) -> str:
    """Analyse a photo using GPT-4o-mini vision to extract asset details.

    image_url: publicly accessible URL of the image
    asset_type: home / motor / pet

    Returns a JSON string of inferred details. Use the returned fields to
    pre-fill the appropriate quote tool (get_home_quote, get_motor_quote,
    or get_pet_quote). Confirm the extracted details with the user before quoting.
    """
    try:
        details = _analyze_photo(image_url=image_url, asset_type=asset_type)
        return json.dumps(details, indent=2)
    except Exception as exc:
        return f"Photo analysis failed: {exc}"


# ---------------------------------------------------------------------------
# Commercial tools
# ---------------------------------------------------------------------------


@mcp.tool()
def get_public_liability_quote(
    revenue: float,
    employees: int,
    industry: str,
    postcode: str = "",
    cover_limit: float = 2_000_000,
) -> str:
    """Generate illustrative Public Liability insurance quotes from three fictional UK insurers.

    Covers third-party injury or property damage claims against the business.

    revenue: annual revenue in £
    employees: number of employees
    industry: office / retail / hospitality / manufacturing / construction / engineering / technology / healthcare / other
    postcode: UK postcode (optional)
    cover_limit: £1,000,000 / £2,000,000 / £5,000,000 / £10,000,000 (default £2,000,000)
    """
    result = price_public_liability(
        revenue=revenue,
        employees=employees,
        industry=industry,
        postcode=postcode,
        cover_limit=cover_limit,
    )
    return build_panel(result["base"], result["ref"], "public_liability")


@mcp.tool()
def get_employers_liability_quote(
    employees: int,
    annual_payroll: float,
    industry: str,
) -> str:
    """Generate illustrative Employers' Liability insurance quotes from three fictional UK insurers.

    LEGALLY REQUIRED in the UK for any business with employees (Employers' Liability
    (Compulsory Insurance) Act 1969). Quotes are for £10m cover (market standard).

    employees: number of employees
    annual_payroll: total annual payroll in £
    industry: office / retail / hospitality / manufacturing / construction / engineering / technology / healthcare / other
    """
    result = price_employers_liability(
        employees=employees,
        annual_payroll=annual_payroll,
        industry=industry,
    )
    return build_panel(result["base"], result["ref"], "employers_liability")


@mcp.tool()
def get_professional_indemnity_quote(
    revenue: float,
    profession: str,
    cover_limit: float = 500_000,
) -> str:
    """Generate illustrative Professional Indemnity insurance quotes from three fictional UK insurers.

    Covers the business against claims of negligence or errors in professional advice or services.

    revenue: annual revenue in £
    profession: technology / consulting / marketing / architecture / engineering / legal / financial / general
    cover_limit: £250,000 / £500,000 / £1,000,000 / £2,000,000 (default £500,000)
    """
    result = price_professional_indemnity(
        revenue=revenue,
        profession=profession,
        cover_limit=cover_limit,
    )
    return build_panel(result["base"], result["ref"], "professional_indemnity")


@mcp.tool()
def get_cyber_quote(
    revenue: float,
    employees: int,
    industry: str,
    data_records_held: int = 0,
) -> str:
    """Generate illustrative Cyber Liability insurance quotes from three fictional UK insurers.

    Covers data breaches, cyber attacks, ransomware, business interruption from IT failures,
    and associated response, legal, and PR costs.

    revenue: annual revenue in £
    employees: number of employees
    industry: technology / finance / healthcare / retail / office / construction / manufacturing / other
    data_records_held: approximate number of customer/employee data records held (default 0)
    """
    result = price_cyber(
        revenue=revenue,
        employees=employees,
        industry=industry,
        data_records_held=data_records_held,
    )
    return build_panel(result["base"], result["ref"], "cyber")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
