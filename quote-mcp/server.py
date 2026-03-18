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
from pricer import build_panel, price_home, price_motor, price_pet

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

_port = int(os.environ.get("PORT", 8001))
mcp = FastMCP("insurance-quote-mcp", host="0.0.0.0", port=_port)


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
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
