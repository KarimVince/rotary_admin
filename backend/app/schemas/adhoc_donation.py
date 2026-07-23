import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AdhocDonationCreate(BaseModel):
    donation_date: date
    description: str = Field(min_length=1, max_length=300)
    amount: float = Field(gt=0)
    # Optional override; when omitted the rotary_year is derived from
    # donation_date server-side (see app.core.rotary_year), same as Donation.
    rotary_year: int | None = None


class AdhocDonationUpdate(BaseModel):
    donation_date: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=300)
    amount: float | None = Field(default=None, gt=0)
    rotary_year: int | None = None


class AdhocDonationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rotary_year: int
    donation_date: date
    description: str
    amount: float
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class EventFundraisingRow(BaseModel):
    """One row per event with any fundraising income (Story 17.3)."""

    event_id: uuid.UUID
    event_name: str
    event_date: date
    auction_total: float
    lucky_draw_total: float
    other_donation_total: float
    total: float


class FundraisingSummary(BaseModel):
    rotary_year: int
    events: list[EventFundraisingRow]
    event_fundraising_total: float
    adhoc_donations_total: float
    combined_total: float
