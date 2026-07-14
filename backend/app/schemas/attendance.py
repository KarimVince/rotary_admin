import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EventType = Literal["dinner", "fellowship"]
MemberStatusSnapshot = Literal["active", "honorary", "past"]


class AttendanceEventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    event_date: date
    event_type: EventType

    @field_validator("event_date")
    @classmethod
    def _not_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("event_date cannot be in the future")
        return value


class AttendanceEventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    event_date: date | None = None
    event_type: EventType | None = None

    @field_validator("event_date")
    @classmethod
    def _not_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("event_date cannot be in the future")
        return value


class AttendanceEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    event_date: date
    event_type: EventType
    rotary_year: int
    # Story 15.1 — Dinner Forecast planning fields, present on every event
    # since forecast and attendance share the same table.
    location: str | None = None
    speaker_name: str | None = None
    ngo_organisation_name: str | None = None
    speaker_rotary_contact_member_id: uuid.UUID | None = None
    topics_description: str | None = None
    # Story 15.6/15.7: whether this dinner event is restricted to members only.
    member_only: bool = False
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class AttendanceEventListItem(AttendanceEventRead):
    # Story 10.9 — present count includes past members marked present, but
    # eligible_total (the denominator) stays active + honorary only.
    present_count: int
    eligible_total: int
    attendance_percentage: float
    active_present: int
    honorary_present: int
    past_present: int


class AttendanceRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    member_id: uuid.UUID
    first_name: str
    last_name: str
    member_status_snapshot: MemberStatusSnapshot
    present: bool


class AttendanceSheetResponse(BaseModel):
    event: AttendanceEventRead
    active: list[AttendanceRecordRead]
    honorary: list[AttendanceRecordRead]
    past: list[AttendanceRecordRead]
    present_count: int
    eligible_total: int
    attendance_percentage: float


class AttendanceRecordUpdate(BaseModel):
    present: bool


class AttendanceStatsResponse(BaseModel):
    rotary_year: int
    total_events: int
    average_attendance: float | None
    average_attendance_percentage: float | None
    eligible_member_count: int
