import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    # Story 16.35: required for an actual donation, must be omitted (or left
    # None) for a planned one — see the model_validator below.
    donation_date: date | None = None
    currency: str = "HKD"
    notes: str | None = None
    # Optional override; when omitted the rotary_year is derived from
    # donation_date server-side (see app.core.rotary_year). Required when
    # planned=True, since there's no date to derive it from.
    rotary_year: int | None = None
    planned: bool = False

    _validate_currency = field_validator("currency")(_validate_currency)

    @model_validator(mode="after")
    def _validate_planned_fields(self) -> "DonationCreate":
        if self.planned:
            if self.rotary_year is None:
                raise ValueError("rotary_year is required for a planned donation")
            self.donation_date = None
        elif self.donation_date is None:
            raise ValueError("donation_date is required for an actual (non-planned) donation")
        return self


class DonationUpdate(BaseModel):
    amount: float | None = Field(default=None, gt=0)
    donation_date: date | None = None
    currency: str | None = None
    notes: str | None = None
    rotary_year: int | None = None
    planned: bool | None = None

    _validate_currency = field_validator("currency")(_validate_currency)


class DonationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    rotary_year: int
    amount: float
    currency: str
    donation_date: date | None
    notes: str | None
    planned: bool
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
