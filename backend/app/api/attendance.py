import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.attendance_support import (
    compute_attendance_stats,
    compute_event_counts,
    eligible_and_present,
    member_status_as_of,
    validate_event_type,
)
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
    # Story 15.1's soft-delete only hides an event from the Dinner Forecast
    # list/report (dinner_forecast.py's own queries filter deleted_at) — it
    # deliberately does NOT block already-started attendance history here,
    # per AttendanceEvent.deleted_at's own docstring ("historical attendance
    # data tied to a deleted forecast event stays intact").
    event = db.get(AttendanceEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _seed_records_for_event(db: Session, event: AttendanceEvent) -> None:
    # Story 16.5: snapshot every member's status as of the event's own date
    # (via join_date/leave_date), not "now" — a Dinner Forecast event can be
    # planned well ahead of its date and attendance started long after, by
    # which point the roster may have changed.
    members = db.query(Member).all()
    for member in members:
        db.add(
            AttendanceRecord(
                event_id=event.id,
                member_id=member.id,
                member_status_snapshot=member_status_as_of(member, event.event_date),
            )
        )


def _refresh_records_for_event(db: Session, event: AttendanceEvent) -> None:
    # Story 16.5's "Refresh List": re-derive every current member's snapshot
    # as of the event date. Existing records keep their `present` mark —
    # only the snapshot bucket (active/honorary/past) is recomputed, so a
    # member whose join/leave dates were corrected after the fact moves to
    # the right bucket without losing recorded attendance. Members with no
    # record yet (joined the roster after the event was first started) get
    # one seeded now, defaulting to not present.
    existing = {
        record.member_id: record
        for record in db.query(AttendanceRecord).filter(AttendanceRecord.event_id == event.id)
    }
    for member in db.query(Member).all():
        snapshot = member_status_as_of(member, event.event_date)
        record = existing.get(member.id)
        if record is None:
            db.add(
                AttendanceRecord(
                    event_id=event.id,
                    member_id=member.id,
                    member_status_snapshot=snapshot,
                )
            )
        elif record.member_status_snapshot != snapshot:
            record.member_status_snapshot = snapshot


def _list_item(event: AttendanceEvent, bucket: dict[str, int]) -> AttendanceEventListItem:
    eligible_total, present_count = eligible_and_present(bucket)
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
    counts = compute_event_counts(db, [event.id for event in events])
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
    stats = compute_attendance_stats(db, selected_year)
    return AttendanceStatsResponse(
        rotary_year=stats.rotary_year,
        total_events=stats.total_events,
        average_attendance=stats.average_attendance,
        average_attendance_percentage=stats.average_attendance_percentage,
        eligible_member_count=stats.eligible_member_count,
    )


@router.post("/attendance/events", response_model=AttendanceEventRead, status_code=201)
def create_attendance_event(
    payload: AttendanceEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    validate_event_type(db, payload.event_type)
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


@router.post(
    "/attendance/events/{event_id}/start", response_model=AttendanceEventRead, status_code=201
)
def start_attendance_for_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    # Story 15.3 — Dinner Forecast events are planned (and dated, possibly
    # in the future) on the Dinner Forecast page without seeding attendance
    # records. This turns a pre-planned event into one actively tracked on
    # the Attendance page, by seeding records for it now.
    event = _get_event_or_404(db, event_id)
    already_started = (
        db.query(AttendanceRecord).filter(AttendanceRecord.event_id == event_id).first()
    )
    if already_started is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance has already been started for this event",
        )
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
    if data.get("event_type") is not None:
        validate_event_type(db, data["event_type"])
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


def _build_sheet_response(db: Session, event: AttendanceEvent) -> AttendanceSheetResponse:
    rows = (
        db.query(AttendanceRecord, Member)
        .join(Member, AttendanceRecord.member_id == Member.id)
        .filter(AttendanceRecord.event_id == event.id)
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


@router.get("/attendance/events/{event_id}/sheet", response_model=AttendanceSheetResponse)
def get_attendance_sheet(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "read")),
):
    event = _get_event_or_404(db, event_id)
    return _build_sheet_response(db, event)


@router.post("/attendance/events/{event_id}/refresh", response_model=AttendanceSheetResponse)
def refresh_attendance_sheet(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    # Story 16.5's "Refresh List" — re-derives every member's active/
    # honorary/past bucket as of the event's date from the current roster,
    # adding records for members not yet on the list. Existing `present`
    # marks are never touched.
    event = _get_event_or_404(db, event_id)
    _refresh_records_for_event(db, event)
    db.commit()
    return _build_sheet_response(db, event)


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
