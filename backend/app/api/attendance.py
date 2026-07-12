import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.rotary_year import rotary_year
from app.core.rotary_year import rotary_year as compute_current_rotary_year
from app.db.session import get_db
from app.models import AttendanceEvent, AttendanceRecord, Member, User
from app.schemas.attendance import (
    AttendanceEventCreate,
    AttendanceEventListItem,
    AttendanceEventRead,
    AttendanceEventUpdate,
    AttendanceRecordRead,
    AttendanceRecordUpdate,
    AttendanceSheetResponse,
    AttendanceStatsResponse,
)

router = APIRouter()

ATTENDANCE_HISTORY = "attendance.history"
ATTENDANCE_SHEET = "attendance.sheet"


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> AttendanceEvent:
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _seed_records_for_event(db: Session, event: AttendanceEvent) -> None:
    # Story 10.3/10.1: snapshot every member's current status at event
    # creation time. There's no status-history table in this app (Member.status
    # is a single current value), so "as of the event date" is approximated
    # with "as of now" — acceptable since events can't be created for a
    # future date and are normally logged the same day.
    members = db.query(Member).all()
    for member in members:
        db.add(
            AttendanceRecord(
                event_id=event.id,
                member_id=member.id,
                # Story 8.14: honorary is Member.is_honorary now, not a
                # status value — this snapshot enum is independent of
                # Member.status and still has its own "honorary" bucket.
                member_status_snapshot=(
                    "honorary"
                    if member.status == "active" and member.is_honorary
                    else member.status
                ),
            )
        )


def _event_counts(db: Session, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
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


def _list_item(event: AttendanceEvent, bucket: dict[str, int]) -> AttendanceEventListItem:
    eligible_total = bucket["active_total"] + bucket["honorary_total"]
    present_count = bucket["active_present"] + bucket["honorary_present"] + bucket["past_present"]
    percentage = round(present_count / eligible_total * 100, 1) if eligible_total else 0.0
    return AttendanceEventListItem(
        **AttendanceEventRead.model_validate(event).model_dump(),
        present_count=present_count,
        eligible_total=eligible_total,
        attendance_percentage=percentage,
        active_present=bucket["active_present"],
        honorary_present=bucket["honorary_present"],
        past_present=bucket["past_present"],
    )


@router.get("/attendance/events", response_model=list[AttendanceEventListItem])
def list_attendance_events(
    rotary_year: int | None = Query(
        None, description="Defaults to the current rotary year"
    ),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_HISTORY, "read")),
):
    selected_year = rotary_year if rotary_year is not None else compute_current_rotary_year(
        date.today()
    )
    events = (
        db.query(AttendanceEvent)
        .filter(AttendanceEvent.rotary_year == selected_year)
        .order_by(AttendanceEvent.event_date.desc())
        .all()
    )
    counts = _event_counts(db, [event.id for event in events])
    return [_list_item(event, counts[event.id]) for event in events]


@router.get("/attendance/stats", response_model=AttendanceStatsResponse)
def attendance_stats(
    rotary_year: int | None = Query(
        None, description="Defaults to the current rotary year"
    ),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_HISTORY, "read")),
):
    selected_year = rotary_year if rotary_year is not None else compute_current_rotary_year(
        date.today()
    )
    events = (
        db.query(AttendanceEvent).filter(AttendanceEvent.rotary_year == selected_year).all()
    )
    counts = _event_counts(db, [event.id for event in events])

    eligible_member_count = (
        db.query(func.count(Member.id)).filter(Member.status == "active").scalar()
        or 0
    )

    if not events:
        return AttendanceStatsResponse(
            rotary_year=selected_year,
            total_events=0,
            average_attendance=None,
            average_attendance_percentage=None,
            eligible_member_count=eligible_member_count,
        )

    percentages = []
    present_counts = []
    for event in events:
        bucket = counts[event.id]
        eligible_total = bucket["active_total"] + bucket["honorary_total"]
        present_count = (
            bucket["active_present"] + bucket["honorary_present"] + bucket["past_present"]
        )
        present_counts.append(present_count)
        percentages.append(present_count / eligible_total * 100 if eligible_total else 0.0)

    return AttendanceStatsResponse(
        rotary_year=selected_year,
        total_events=len(events),
        average_attendance=round(sum(present_counts) / len(present_counts), 1),
        average_attendance_percentage=round(sum(percentages) / len(percentages), 1),
        eligible_member_count=eligible_member_count,
    )


@router.post("/attendance/events", response_model=AttendanceEventRead, status_code=201)
def create_attendance_event(
    payload: AttendanceEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    event = AttendanceEvent(
        name=payload.name,
        event_date=payload.event_date,
        event_type=payload.event_type,
        rotary_year=rotary_year(payload.event_date),
        created_by=current_user.id,
    )
    db.add(event)
    db.flush()
    _seed_records_for_event(db, event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/attendance/events/{event_id}", response_model=AttendanceEventRead)
def update_attendance_event(
    event_id: uuid.UUID,
    payload: AttendanceEventUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    event = _get_event_or_404(db, event_id)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(event, field, value)
    if "event_date" in data:
        event.rotary_year = rotary_year(event.event_date)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/attendance/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    event = _get_event_or_404(db, event_id)
    db.delete(event)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _record_read(member: Member, record: AttendanceRecord) -> AttendanceRecordRead:
    return AttendanceRecordRead(
        member_id=member.id,
        first_name=member.first_name,
        last_name=member.last_name,
        member_status_snapshot=record.member_status_snapshot,
        present=record.present,
    )


@router.get("/attendance/events/{event_id}/sheet", response_model=AttendanceSheetResponse)
def get_attendance_sheet(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "read")),
):
    event = _get_event_or_404(db, event_id)

    rows = (
        db.query(AttendanceRecord, Member)
        .join(Member, AttendanceRecord.member_id == Member.id)
        .filter(AttendanceRecord.event_id == event_id)
        .order_by(Member.last_name, Member.first_name)
        .all()
    )

    active, honorary, past = [], [], []
    active_present = honorary_present = past_present = 0
    for record, member in rows:
        item = _record_read(member, record)
        if record.member_status_snapshot == "active":
            active.append(item)
            active_present += int(record.present)
        elif record.member_status_snapshot == "honorary":
            honorary.append(item)
            honorary_present += int(record.present)
        else:
            past.append(item)
            past_present += int(record.present)

    eligible_total = len(active) + len(honorary)
    present_count = active_present + honorary_present + past_present
    percentage = round(present_count / eligible_total * 100, 1) if eligible_total else 0.0

    return AttendanceSheetResponse(
        event=event,
        active=active,
        honorary=honorary,
        past=past,
        present_count=present_count,
        eligible_total=eligible_total,
        attendance_percentage=percentage,
    )


@router.patch(
    "/attendance/events/{event_id}/records/{member_id}", response_model=AttendanceRecordRead
)
def update_attendance_record(
    event_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: AttendanceRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    _get_event_or_404(db, event_id)

    record = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.event_id == event_id, AttendanceRecord.member_id == member_id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    member = db.get(Member, member_id)
    record.present = payload.present
    record.recorded_by = current_user.id
    db.commit()
    db.refresh(record)
    return _record_read(member, record)
