import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.currencies import CURRENCIES


def _validate_currency_code(value: str) -> str:
    code = value.upper()
    if code not in CURRENCIES:
        raise ValueError(f"Unsupported currency: {value}")
    return code


class ExchangeRateCreate(BaseModel):
    currency_code: str
    rate_to_hkd: float = Field(gt=0)
    rate_to_usd: float = Field(gt=0)

    _validate_currency_code = field_validator("currency_code")(_validate_currency_code)


class ExchangeRateUpdate(BaseModel):
    rate_to_hkd: float | None = Field(default=None, gt=0)
    rate_to_usd: float | None = Field(default=None, gt=0)


class ExchangeRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    currency_code: str
    rate_to_hkd: float
    rate_to_usd: float
    updated_by: uuid.UUID | None
    updated_at: datetime
