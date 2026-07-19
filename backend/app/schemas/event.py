import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    date: datetime.date
    hour: datetime.time | None = None
    venue: str = Field(min_length=1, max_length=200)
    oc_chair_member_id: uuid.UUID | None = None
    theme: str | None = Field(default=None, max_length=200)


class EventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    date: datetime.date | None = None
    hour: datetime.time | None = None
    venue: str | None = Field(default=None, min_length=1, max_length=200)
    oc_chair_member_id: uuid.UUID | None = None
    theme: str | None = Field(default=None, max_length=200)


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    date: datetime.date
    hour: datetime.time | None
    venue: str
    oc_chair_member_id: uuid.UUID | None
    oc_chair_member_name: str | None = None
    theme: str | None
    rotary_year: int
    # Story 14.2: read-only on the event form, configured on the Setup page
    # (Story 14.3) — surfaced here purely for display.
    ticket_price_normal: float | None = None
    created_at: datetime.datetime
    # Story 14.13: aggregate figures for the Events list cards/table — computed
    # server-side in the list endpoint, not stored columns.
    guest_count: int = 0
    sponsor_count: int = 0
    net_proceeds: float | None = None
