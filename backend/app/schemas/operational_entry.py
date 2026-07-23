import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OperationalEntryCreate(BaseModel):
    type: Literal["revenue", "cost"]
    category_id: uuid.UUID
    amount: float = Field(gt=0)
    entry_date: date
    notes: str | None = None
    # Optional override; when omitted the rotary_year is derived from
    # entry_date server-side (see app.core.rotary_year), same as Donation.
    rotary_year: int | None = None


class OperationalEntryUpdate(BaseModel):
    type: Literal["revenue", "cost"] | None = None
    category_id: uuid.UUID | None = None
    amount: float | None = Field(default=None, gt=0)
    entry_date: date | None = None
    notes: str | None = None
    rotary_year: int | None = None


class OperationalEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rotary_year: int
    type: str
    category_id: uuid.UUID | None
    amount: float
    entry_date: date
    notes: str | None
    source: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class OperationalSummaryRow(BaseModel):
    """One row in the Revenue or Cost column (Story 17.5). `id` is null and
    `editable` is false for the Member Fees/Event auto-pulled rows — those
    are computed live from their own modules, never persisted here."""

    id: uuid.UUID | None
    category_name: str
    amount: float
    entry_date: date | None
    notes: str | None
    source: str
    editable: bool


class OperationalSummary(BaseModel):
    rotary_year: int
    revenue: list[OperationalSummaryRow]
    cost: list[OperationalSummaryRow]
    total_revenue: float
    total_cost: float
