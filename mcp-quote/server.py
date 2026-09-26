#!/usr/bin/env python3
"""
Insurance Quote MCP Server

Illustrative quotes for the four SME commercial lines, from three fictional
UK insurers. Exposes four tools to Claude:
  - get_public_liability_quote
  - get_employers_liability_quote
  - get_professional_indemnity_quote
  - get_cyber_quote
"""


import logging
import os

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from pricer import (
    build_panel,
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
