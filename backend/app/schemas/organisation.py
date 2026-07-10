import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.core.countries import COUNTRIES


def _validate_country(value: str | None) -> str | None:
    if value is not None and value not in COUNTRIES:
        raise ValueError("country must be a value from the fixed country list")
    return value


class OrganisationBase(BaseModel):
    name: str
    description: str | None = None
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    country: str | None = None
    first_supported_year: int | None = None
    logo_url: str | None = None
    # Story 11.3: optional FK, denormalized like every other FK in this app
    # (e.g. Member.title_id) — the frontend joins against the classifications
    # list it already fetches, rather than the API nesting a classification
    # object.
    classification_id: uuid.UUID | None = None

    _validate_country = field_validator("country")(_validate_country)


class OrganisationCreate(OrganisationBase):
    pass


class OrganisationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    country: str | None = None
    first_supported_year: int | None = None
    logo_url: str | None = None
    classification_id: uuid.UUID | None = None

    _validate_country = field_validator("country")(_validate_country)


class OrganisationRead(OrganisationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # Only populated when the list endpoint is called with ?rotary_year=... —
    # the org's donations for that year, converted to HKD (best-effort; a
    # donation in a currency with no exchange rate on file is excluded from
    # this total, same non-silent-drop behaviour as the statistics endpoint).
    year_total: float | None = None
