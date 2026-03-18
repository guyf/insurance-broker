"""
Photo analyzer — uses OpenAI GPT-4o-mini vision to extract asset details
from a user-supplied image URL.
"""

import json
import os

from openai import OpenAI

_client = None


def _openai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


PROMPTS = {
    "home": (
        "Look at this property photo. Extract the following details as a JSON object:\n"
        "- property_type: one of house, flat, bungalow, cottage (best guess)\n"
        "- estimated_bedrooms: integer (best guess from visible size)\n"
        "- approximate_year_built: integer (best guess from architectural style)\n"
        "- condition_notes: brief string about visible condition\n"
        "Return only valid JSON, no other text."
    ),
    "motor": (
        "Look at this vehicle photo. Extract the following details as a JSON object:\n"
        "- make: manufacturer name (e.g. Ford, BMW)\n"
        "- model: model name (e.g. Focus, 3 Series)\n"
        "- approximate_year: integer (best guess from styling)\n"
        "- colour: colour of the vehicle\n"
        "- condition_notes: brief string about visible condition\n"
        "Return only valid JSON, no other text."
    ),
    "pet": (
        "Look at this pet photo. Extract the following details as a JSON object:\n"
        "- species: one of dog, cat, rabbit, other\n"
        "- breed: best guess at breed (e.g. Labrador, French Bulldog, Tabby)\n"
        "- approximate_age_years: float (best guess — puppy/kitten ≈ 0.5, senior ≈ 10)\n"
        "- size: one of small, medium, large\n"
        "- notes: any other visible details\n"
        "Return only valid JSON, no other text."
    ),
}


def analyze_photo(image_url: str, asset_type: str) -> dict:
    """
    Call GPT-4o-mini vision on image_url and return a dict of inferred details.
    asset_type must be one of: home, motor, pet.
    """
    prompt = PROMPTS.get(asset_type.lower())
    if prompt is None:
        raise ValueError(f"Unknown asset_type '{asset_type}'. Use: home, motor, pet")

    response = _openai().chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        max_tokens=300,
    )

    raw = response.choices[0].message.content
    return json.loads(raw)
