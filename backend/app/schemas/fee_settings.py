import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.currencies import CURRENCIES


def _validate_currency(value: str | None) -> str | None:
    if value is None:
        return value
    code = value.upper()
    if code not in CURRENCIES:
        raise ValueError(f"Unsupported currency: {value}")
    return code


class FeeSettingsCreate(BaseModel):
    rotary_year: int
    early_bird_single_price: float = Field(gt=0)
    early_bird_couple_price: float = Field(gt=0)
    full_single_price: float = Field(gt=0)
    full_couple_price: float = Field(gt=0)
    currency: str = "HKD"

    _validate_currency = field_validator("currency")(_validate_currency)


class FeeSettingsUpdate(BaseModel):
    early_bird_single_price: float | None = Field(default=None, gt=0)
    early_bird_couple_price: float | None = Field(default=None, gt=0)
    full_single_price: float | None = Field(default=None, gt=0)
    full_couple_price: float | None = Field(default=None, gt=0)
    currency: str | None = None

    _validate_currency = field_validator("currency")(_validate_currency)


class FeeSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rotary_year: int
    early_bird_single_price: float
    early_bird_couple_price: float
    full_single_price: float
    full_couple_price: float
    currency: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
