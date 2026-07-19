"""Shared helpers between app/api/attendance.py and app/api/dinner_forecast.py
(Story 16.8's merge needs both the attendance stats logic and the date-aware
snapshot logic in a place both routers can import from without one importing
the other's private functions)."""
import uuid
from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AttendanceEvent, AttendanceRecord, DinnerEventType, Member


def validate_event_type(db: Session, name: str) -> None:
    """Story 16.10: event_type is a plain name string (no DB-level FK), so
    both attendance.py's and dinner_forecast.py's create/update endpoints
    check it against the live DinnerEventType list here instead of
    duplicating the same query in each router."""
    exists = db.query(DinnerEventType.id).filter(DinnerEventType.name == name).first()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Unknown event type "{name}"',
        )


def member_status_as_of(member: Member, as_of_date: date) -> str:
    """Story 16.5: a member's active/past status is derived from
    join_date/leave_date as of the given date rather than Member.status
    (today's live value), since a dinner's attendance can be started long
    after the event itself was planned/dated and the roster may have
    changed since. is_honorary has no historical tracking anywhere else in
    this app, so it's applied as its current value regardless of date.

    leave_date isn't always populated when a member is marked "past" (data
    entry gap — Member.status can be set independently) — when there's no
    leave_date to compare against, fall back to the member's current
    status rather than assuming they were still active on every past date.
    """
    if member.join_date > as_of_date:
        return "past"  # hadn't joined yet as of this date
    if member.leave_date is not None and member.leave_date <= as_of_date:
        return "past"  # had already left by this date
    if member.status == "past":
        return "past"  # left at some point, but no leave_date on record
    return "honorary" if member.is_honorary else "active"


def compute_event_counts(db: Session, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    if not event_ids:
        return {}

    rows = (
        db.query(
            AttendanceRecord.event_id,
            AttendanceRecord.member_status_snapshot,
            AttendanceRecord.present,
            func.count(AttendanceRecord.id),
        )
        .filter(AttendanceRecord.event_id.in_(event_ids))
        .group_by(
            AttendanceRecord.event_id,
            AttendanceRecord.member_status_snapshot,
            AttendanceRecord.present,
        )
        .all()
    )

    counts: dict[uuid.UUID, dict[str, int]] = {
        event_id: {
            "active_total": 0,
            "active_present": 0,
            "honorary_total": 0,
            "honorary_present": 0,
            "past_present": 0,
        }
        for event_id in event_ids
    }

    for event_id, snapshot, present, count in rows:
        bucket = counts[event_id]
        if snapshot in ("active", "honorary"):
            bucket[f"{snapshot}_total"] += count
            if present:
                bucket[f"{snapshot}_present"] += count
        elif snapshot == "past" and present:
            bucket["past_present"] += count

    return counts


def eligible_and_present(bucket: dict[str, int]) -> tuple[int, int]:
    """Returns (eligible_total, present_count) from a compute_event_counts bucket."""
    eligible_total = bucket["active_total"] + bucket["honorary_total"]
    present_count = bucket["active_present"] + bucket["honorary_present"] + bucket["past_present"]
    return eligible_total, present_count


@dataclass
class AttendanceStats:
    rotary_year: int
    total_events: int
    average_attendance: float | None
    average_attendance_percentage: float | None
    eligible_member_count: int
    event_counts: dict[uuid.UUID, dict[str, int]]


def compute_attendance_stats(db: Session, rotary_year_value: int) -> AttendanceStats:
    """Shared by the on-screen stat cards (attendance.py) and the PDF
    report's stat tiles (dinner_forecast_report.py) so the two never
    disagree. Story 15.1 follow-up: future-dated, not-yet-started planning
    events are excluded so they don't drag the average down with a phantom
    0% turnout."""
    events = (
        db.query(AttendanceEvent)
        .filter(
            AttendanceEvent.rotary_year == rotary_year_value,
            AttendanceEvent.event_date <= date.today(),
        )
        .all()
    )
    counts = compute_event_counts(db, [event.id for event in events])
    eligible_member_count = (
        db.query(func.count(Member.id)).filter(Member.status == "active").scalar() or 0
    )

    if not events:
        return AttendanceStats(
            rotary_year=rotary_year_value,
            total_events=0,
            average_attendance=None,
            average_attendance_percentage=None,
            eligible_member_count=eligible_member_count,
            event_counts=counts,
        )

    present_counts = []
    percentages = []
    for event in events:
        eligible_total, present_count = eligible_and_present(counts[event.id])
        present_counts.append(present_count)
        percentages.append(present_count / eligible_total * 100 if eligible_total else 0.0)

    return AttendanceStats(
        rotary_year=rotary_year_value,
        total_events=len(events),
        average_attendance=round(sum(present_counts) / len(present_counts), 1),
        average_attendance_percentage=round(sum(percentages) / len(percentages), 1),
        eligible_member_count=eligible_member_count,
        event_counts=counts,
    )
