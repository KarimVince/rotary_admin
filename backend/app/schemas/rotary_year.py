import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class RotaryYearCreate(BaseModel):
    year: int
    is_current: bool = False


class RotaryYearUpdate(BaseModel):
    # `year` is immutable once created — nothing else in the app FKs to this
    # table, but changing a year value after the fact would silently
    # re-label whatever pages already cached/displayed it. Only the
    # is_current flag can be toggled.
    is_current: bool | None = None


class RotaryYearRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    year: int
    # label/start_date/end_date are computed from `year` (never stored) via
    # app.core.rotary_year.rotary_year_bounds, so every row stays locked to
    # the app's fixed Jul 1 -> Jun 30 convention.
    label: str
    start_date: date
    end_date: date
    is_current: bool
    created_at: datetime
