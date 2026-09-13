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
    # the org's *actual* (non-planned) donations for that year, converted to
    # HKD (best-effort; a donation in a currency with no exchange rate on
    # file is excluded from this total, same non-silent-drop behaviour as
    # the statistics endpoint).
    year_total: float | None = None
    # Story 16.35 follow-up: the *planned* (not-yet-made) donation total for
    # the same year — kept as a separate field rather than folded into
    # year_total, so an org with only planned donations still shows up in
    # the year-filtered list (year_total alone would be 0/None for it) and
    # the two figures never get conflated into one number.
    year_total_planned: float | None = None
    # Total service hours (actual + planned) logged for this org in the
    # filtered rotary year — None when no year filter is active.
    year_service_hours: float | None = None
    # Planned service hours for this org in the filtered rotary year (forecast,
    # not yet delivered). None when no year filter is active.
    year_service_hours_planned: float | None = None
