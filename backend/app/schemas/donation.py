import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.currencies import CURRENCIES


def _validate_currency(value: str | None) -> str | None:
    if value is None:
        return value
    code = value.upper()
    if code not in CURRENCIES:
        raise ValueError(f"Unsupported currency: {value}")
    return code


class DonationCreate(BaseModel):
    amount: float = Field(gt=0)
    donation_date: date
    currency: str = "HKD"
    notes: str | None = None
    # Optional override; when omitted the rotary_year is derived from
    # donation_date server-side (see app.core.rotary_year).
    rotary_year: int | None = None

    _validate_currency = field_validator("currency")(_validate_currency)


class DonationUpdate(BaseModel):
    amount: float | None = Field(default=None, gt=0)
    donation_date: date | None = None
    currency: str | None = None
    notes: str | None = None
    rotary_year: int | None = None

    _validate_currency = field_validator("currency")(_validate_currency)


class DonationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    rotary_year: int
    amount: float
    currency: str
    donation_date: date
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
