"""
Catalog product schema — the validation contract for the master catalog.

Mirrors functions/api/products/etl.js validateRow() exactly. The JS validator
is the runtime enforcement point (it quarantines into catalog_staging); this
model is the authoring/import-time contract. Both must agree — if you change
one, change the other, or add the row to catalog_schema_parity_check below.

WHY THERE IS NO `price` FIELD
-----------------------------
Deliberate. A price on a catalog row re-introduces the exact contamination we
removed on 2026-10-14: a typeahead suggestion carrying a monetary value that
flows toward the Base Price input. BUY requests state no price at all
("equipment details & quantity only"), and etl.js rejects any price-shaped
value in spec_template (PRICE_RE) for the same reason.

Pricing lives on the ORDER, not the product:
  - request: buy/sell line states no price (BUY) or a stated ask (SELL)
  - evaluated price: set by an admin, per request, in FinalPriceSnapshot
  - dashboard: reads the snapshot for that request id only

If a reference valuation is ever needed, it belongs in a separate
`product_price_reference` table keyed by (product_id, captured_at, source) so
it can never be joined into the suggestion payload by accident.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$")

# Mirrors PRICE_RE in etl.js — any of these in spec_template quarantines a row.
PRICE_RE = re.compile(
    r"(?:₹|\brs\.?\s*\d|\b(?:inr|usd|eur)\b|\bunder\s+\d"
    r"|\b\d{4,}\s*(?:rupees?|lakh|lakhs|crore|cr)\b)",
    re.IGNORECASE,
)


class CatalogCategory(str, Enum):
    """Controlled vocabulary. A row outside this set is quarantined."""

    SERVERS = "servers"
    STORAGE = "storage"
    NETWORKING = "networking"
    LAPTOPS = "laptops"
    COMPONENTS = "components"
    PERIPHERALS = "peripherals"
    TELECOM = "telecom"


class VerificationStatus(str, Enum):
    """
    Trust level of a catalog row.

    UNVERIFIED rows are display-only for match purposes: normalize/line.js caps
    their anchor confidence at UNVERIFIED_CATALOG_MAX_CONFIDENCE (0.75), which is
    deliberately below PROMOTE_MIN_CONFIDENCE (0.80). An unverified row can
    therefore never become a normalized match key, while remaining searchable
    and matchable on raw text. Bulk-generated SKUs MUST ship as UNVERIFIED.
    """

    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    QUARANTINED = "quarantined"


class MatchType(str, Enum):
    PREFIX = "prefix"
    FUZZY = "fuzzy"


class ProductSuggestion(BaseModel):
    """One typeahead row. This is the ONLY shape the browser ever receives."""

    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(min_length=3, max_length=64)]
    category: CatalogCategory
    model_name: Annotated[str, Field(alias="model", min_length=2, max_length=160)]
    spec_template: Annotated[str, Field(max_length=400)] = ""
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    match_type: MatchType = MatchType.PREFIX
    # NOTE: no price, ever. See module docstring.


class CatalogRow(BaseModel):
    """
    A canonical catalog record (the `products` table).

    `fuzzy_matches` are REAL user-language phrasings harvested for the intent
    panel / synonym layer. They are retrieval training signal, not aliases —
    aliases are canonical model spellings only.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: Annotated[str, Field(pattern=ID_RE.pattern)]
    category: CatalogCategory
    model: Annotated[str, Field(min_length=2, max_length=160)]
    spec_template: Annotated[str, Field(max_length=400)] = ""
    aliases: Annotated[list[str], Field(max_length=12)] = Field(default_factory=list)
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    fuzzy_matches: Annotated[list[str], Field(max_length=8)] = Field(default_factory=list)

    # ── Validators (mirror etl.js validateRow) ──

    @field_validator("spec_template")
    @classmethod
    def _no_price_in_spec(cls, v: str) -> str:
        if PRICE_RE.search(v or ""):
            raise ValueError(
                "spec_template contains price-shaped text; pricing belongs on "
                "the order snapshot, never the catalog"
            )
        return v

    @field_validator("aliases")
    @classmethod
    def _alias_shape(cls, v: list[str]) -> list[str]:
        for a in v:
            if len(a) > 64:
                raise ValueError(f"alias too long (max 64): {a!r}")
        return v

    @field_validator("fuzzy_matches")
    @classmethod
    def _fuzzy_shape(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip() for s in v if s and s.strip()]
        return list(dict.fromkeys(cleaned))  # de-dupe, preserve order

    @model_validator(mode="after")
    def _identity_present(self) -> "CatalogRow":
        if not self.model.strip():
            raise ValueError("model must be non-empty")
        return self

    def to_products_row(self) -> dict:
        """Serialize for the D1 `products` table."""
        return {
            "id": self.id,
            "category": self.category.value,
            "model": self.model,
            "spec_template": self.spec_template,
            "aliases": json.dumps(self.aliases),
            "verification_status": self.verification_status.value,
        }

    def to_fuzzy_row(self) -> dict:
        """Serialize for the `product_fuzzy` table (intent-panel phrases)."""
        return {
            "product_id": self.id,
            "phrase": self.fuzzy_matches[0] if self.fuzzy_matches else "",
            "phrase_tokens": " ".join(
                sorted({w for m in self.fuzzy_matches for w in _tok(m)})
            ),
        }


def _tok(s: str) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if w}


class CatalogSeed(BaseModel):
    """A full seed file, so an import can be rejected as a unit."""

    model_config = ConfigDict(extra="forbid")

    generated_at: datetime
    generator_version: str
    default_verification: VerificationStatus = VerificationStatus.UNVERIFIED
    products: Annotated[list[CatalogRow], Field(min_length=1)]

    @model_validator(mode="after")
    def _unique_ids(self) -> "CatalogSeed":
        seen: dict[str, str] = {}
        for p in self.products:
            key = p.model.strip().lower()
            if key in seen:
                raise ValueError(
                    f"duplicate model {p.model!r}: ids {seen[key]} and {p.id}. "
                    "INSERT OR IGNORE dedupes on primary key only, so a model "
                    "collision splits one product across two ids and can anchor "
                    "normalization inconsistently."
                )
            seen[key] = p.id
        return self


# ── Relational DDL (mirrors the above) ──────────────────────────────────────
#
# ALTER TABLE products ADD COLUMN verification_status TEXT DEFAULT 'unverified';
#
# CREATE TABLE product_fuzzy (
#   product_id   TEXT NOT NULL REFERENCES products(id),
#   phrase       TEXT NOT NULL,
#   phrase_tokens TEXT NOT NULL,
#   PRIMARY KEY (product_id, phrase)
# );
# CREATE INDEX idx_fuzzy_tokens ON product_fuzzy(phrase_tokens);
