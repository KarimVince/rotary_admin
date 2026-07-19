import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_rundown_report import build_csv_report, build_pdf_report
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event, EventRundown
from app.schemas.event_rundown import (
    EventRundownCreate,
    EventRundownRead,
    EventRundownReorder,
    EventRundownUpdate,
)

EVENT_RUNDOWN = "event.rundown"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_row_or_404(db: Session, event_id: uuid.UUID, row_id: uuid.UUID) -> EventRundown:
    row = (
        db.query(EventRundown)
        .filter(EventRundown.id == row_id, EventRundown.event_id == event_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rundown row not found")
    return row


@router.get("/events/{event_id}/rundown", response_model=list[EventRundownRead])
def list_rundown(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "read")),
):
    _get_event_or_404(db, event_id)
    return (
        db.query(EventRundown)
        .filter(EventRundown.event_id == event_id)
        .order_by(EventRundown.sort_order)
        .all()
    )


@router.post("/events/{event_id}/rundown", response_model=EventRundownRead, status_code=status.HTTP_201_CREATED)
def create_rundown_row(
    event_id: uuid.UUID,
    payload: EventRundownCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "write")),
):
    _get_event_or_404(db, event_id)
    max_sort_order = (
        db.query(func.max(EventRundown.sort_order)).filter(EventRundown.event_id == event_id).scalar()
    )
    row = EventRundown(
        event_id=event_id,
        sort_order=0 if max_sort_order is None else max_sort_order + 1,
        **payload.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/events/{event_id}/rundown/reorder", response_model=list[EventRundownRead])
def reorder_rundown(
    event_id: uuid.UUID,
    payload: EventRundownReorder,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "write")),
):
    # Registered before "/{row_id}" so the literal "reorder" path segment
    # isn't swallowed as a UUID path param.
    _get_event_or_404(db, event_id)
    rows = {
        row.id: row
        for row in db.query(EventRundown).filter(EventRundown.event_id == event_id).all()
    }
    for item in payload.items:
        row = rows.get(item.id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Rundown row {item.id} not found"
            )
        row.sort_order = item.sort_order

    db.commit()
    return (
        db.query(EventRundown)
        .filter(EventRundown.event_id == event_id)
        .order_by(EventRundown.sort_order)
        .all()
    )


@router.patch("/events/{event_id}/rundown/{row_id}", response_model=EventRundownRead)
def update_rundown_row(
    event_id: uuid.UUID,
    row_id: uuid.UUID,
    payload: EventRundownUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "write")),
):
    row = _get_row_or_404(db, event_id, row_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete("/events/{event_id}/rundown/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rundown_row(
    event_id: uuid.UUID,
    row_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "write")),
):
    row = _get_row_or_404(db, event_id, row_id)
    db.delete(row)
    db.commit()


@router.get("/events/{event_id}/rundown/report")
def generate_rundown_report(
    event_id: uuid.UUID,
    report_format: Literal["pdf", "csv"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_RUNDOWN, "read")),
):
    event = _get_event_or_404(db, event_id)
    rows = (
        db.query(EventRundown)
        .filter(EventRundown.event_id == event_id)
        .order_by(EventRundown.sort_order)
        .all()
    )
    row_dicts = [
        {"sort_order": r.sort_order, "time": r.time, "activity": r.activity, "highlight": r.highlight}
        for r in rows
    ]

    if report_format == "pdf":
        content = build_pdf_report(event.name, event.date, row_dicts)
        media_type = "application/pdf"
        filename = generate_report_filename("event-rundown", "pdf")
    else:
        content = build_csv_report(row_dicts)
        media_type = "text/csv"
        filename = generate_report_filename("event-rundown", "csv")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
