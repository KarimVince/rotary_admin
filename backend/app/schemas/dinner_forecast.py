import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.schemas.attendance import AttendanceEventRead, EventType


class DinnerForecastEventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    event_date: date
    event_type: EventType
    location: str = Field(min_length=1, max_length=200)
    speaker_name: str | None = Field(default=None, max_length=200)
    ngo_organisation_name: str | None = Field(default=None, max_length=255)
    speaker_rotary_contact_member_id: uuid.UUID | None = None
    topics_description: str | None = None
    member_only: bool = False


class DinnerForecastEventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    event_date: date | None = None
    event_type: EventType | None = None
    location: str | None = Field(default=None, min_length=1, max_length=200)
    speaker_name: str | None = Field(default=None, max_length=200)
    ngo_organisation_name: str | None = Field(default=None, max_length=255)
    speaker_rotary_contact_member_id: uuid.UUID | None = None
    topics_description: str | None = None
    member_only: bool | None = None


class DinnerForecastEventRead(AttendanceEventRead):
    # Story 15.3 — whether this forecast event already has an attendance
    # sheet started (i.e. records seeded) for it.
    attendance_started: bool


__all__ = ["DinnerForecastEventCreate", "DinnerForecastEventUpdate", "DinnerForecastEventRead"]
