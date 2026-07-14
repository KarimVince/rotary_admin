import uuid
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.dinner_forecast_report import build_csv_report, build_pdf_report
from app.core.rotary_year import rotary_year
from app.core.rotary_year import rotary_year as compute_current_rotary_year
from app.db.session import get_db
from app.models import AttendanceEvent, AttendanceRecord, User
from app.schemas.attendance import AttendanceEventRead
from app.schemas.dinner_forecast import (
    DinnerForecastEventCreate,
    DinnerForecastEventRead,
    DinnerForecastEventUpdate,
)

router = APIRouter()

FORECAST_KEY = "attendance.forecast"

EventFilter = Literal["all", "dinner", "fellowship"]
ReportFormat = Literal["pdf", "csv"]


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> AttendanceEvent:
    event = (
        db.query(AttendanceEvent)
        .filter(AttendanceEvent.id == event_id, AttendanceEvent.deleted_at.is_(None))
        .first()
    )
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _started_event_ids(db: Session, event_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not event_ids:
        return set()
    rows = (
        db.query(AttendanceRecord.event_id)
        .filter(AttendanceRecord.event_id.in_(event_ids))
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def _to_forecast_read(event: AttendanceEvent, started: bool) -> DinnerForecastEventRead:
    return DinnerForecastEventRead(
        **AttendanceEventRead.model_validate(event).model_dump(),
        attendance_started=started,
    )


def _list_query(
    db: Session, rotary_year_filter: int, event_type: EventFilter
):
    query = db.query(AttendanceEvent).filter(
        AttendanceEvent.rotary_year == rotary_year_filter,
        AttendanceEvent.deleted_at.is_(None),
    )
    if event_type != "all":
        query = query.filter(AttendanceEvent.event_type == event_type)
    return query.order_by(AttendanceEvent.event_date.asc())


@router.get("/dinner-forecast/events", response_model=list[DinnerForecastEventRead])
def list_dinner_forecast_events(
    rotary_year: int | None = Query(None, description="Defaults to the current rotary year"),
    event_type: EventFilter = Query("all"),
    unstarted_only: bool = Query(
        False, description="Only events with no attendance records seeded yet"
    ),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FORECAST_KEY, "read")),
):
    selected_year = (
        rotary_year if rotary_year is not None else compute_current_rotary_year(date.today())
    )
    events = _list_query(db, selected_year, event_type).all()
    started = _started_event_ids(db, [event.id for event in events])
    if unstarted_only:
        events = [event for event in events if event.id not in started]
    return [_to_forecast_read(event, event.id in started) for event in events]


@router.post("/dinner-forecast/events", response_model=DinnerForecastEventRead, status_code=201)
def create_dinner_forecast_event(
    payload: DinnerForecastEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(FORECAST_KEY, "write")),
):
    event = AttendanceEvent(
        name=payload.name,
        event_date=payload.event_date,
        event_type=payload.event_type,
        rotary_year=rotary_year(payload.event_date),
        location=payload.location,
        speaker_name=payload.speaker_name,
        ngo_organisation_name=payload.ngo_organisation_name,
        speaker_rotary_contact_member_id=payload.speaker_rotary_contact_member_id,
        topics_description=payload.topics_description,
        member_only=payload.member_only,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_forecast_read(event, started=False)


@router.put("/dinner-forecast/events/{event_id}", response_model=DinnerForecastEventRead)
def update_dinner_forecast_event(
    event_id: uuid.UUID,
    payload: DinnerForecastEventUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FORECAST_KEY, "write")),
):
    event = _get_event_or_404(db, event_id)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(event, field, value)
    if "event_date" in data:
        event.rotary_year = rotary_year(event.event_date)

    db.commit()
    db.refresh(event)
    started = bool(_started_event_ids(db, [event.id]))
    return _to_forecast_read(event, started)


@router.delete("/dinner-forecast/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dinner_forecast_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FORECAST_KEY, "write")),
):
    event = _get_event_or_404(db, event_id)
    event.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dinner-forecast/report")
def generate_dinner_forecast_report(
    rotary_year: int | None = Query(None, description="Defaults to the current rotary year"),
    format: ReportFormat = Query("pdf"),
    event_type: EventFilter = Query("all"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FORECAST_KEY, "read")),
):
    selected_year = (
        rotary_year if rotary_year is not None else compute_current_rotary_year(date.today())
    )
    events = _list_query(db, selected_year, event_type).all()

    if format == "csv":
        content = build_csv_report(db, events)
        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="dinner-events-{selected_year}-'
                    f'{selected_year + 1}.csv"'
                )
            },
        )

    content = build_pdf_report(db, events, selected_year)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="dinner-events-{selected_year}-'
                f'{selected_year + 1}.pdf"'
            )
        },
    )
