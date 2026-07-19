import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_summary import compute_event_summary
from app.core.event_summary_report import build_pdf_report, build_pptx_report
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event
from app.schemas.event_summary import EventSummary

EVENT_SUMMARY = "event.summary"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/events/{event_id}/summary", response_model=EventSummary)
def get_event_summary(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SUMMARY, "read")),
):
    _get_event_or_404(db, event_id)
    return compute_event_summary(db, event_id)


@router.get("/events/{event_id}/summary/report")
def generate_summary_report(
    event_id: uuid.UUID,
    report_format: Literal["pdf", "pptx"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SUMMARY, "read")),
):
    event = _get_event_or_404(db, event_id)
    summary = compute_event_summary(db, event_id)

    if report_format == "pdf":
        content = build_pdf_report(event.name, event.date, summary)
        media_type = "application/pdf"
        filename = generate_report_filename("event-summary", "pdf")
    else:
        content = build_pptx_report(event.name, event.date, summary)
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        filename = generate_report_filename("event-summary", "pptx")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
