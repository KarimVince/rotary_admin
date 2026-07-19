import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_category_totals_report import build_csv_report, build_pdf_report
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event, EventSponsor
from app.schemas.event_sponsor import EventSponsorCreate, EventSponsorRead, EventSponsorUpdate

EVENT_SPONSORS = "event.sponsors"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_sponsor_or_404(db: Session, event_id: uuid.UUID, sponsor_id: uuid.UUID) -> EventSponsor:
    sponsor = (
        db.query(EventSponsor)
        .filter(EventSponsor.id == sponsor_id, EventSponsor.event_id == event_id)
        .first()
    )
    if sponsor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor item not found")
    return sponsor


def _compute_total(quantity: float, unit_price: float) -> float:
    return round(quantity * unit_price, 2)


@router.get("/events/{event_id}/sponsors", response_model=list[EventSponsorRead])
def list_sponsors(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SPONSORS, "read")),
):
    _get_event_or_404(db, event_id)
    return (
        db.query(EventSponsor)
        .filter(EventSponsor.event_id == event_id)
        .order_by(EventSponsor.category.is_(None), EventSponsor.category)
        .all()
    )


@router.post("/events/{event_id}/sponsors", response_model=EventSponsorRead, status_code=status.HTTP_201_CREATED)
def create_sponsor(
    event_id: uuid.UUID,
    payload: EventSponsorCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SPONSORS, "write")),
):
    _get_event_or_404(db, event_id)
    sponsor = EventSponsor(
        event_id=event_id,
        total_cost=_compute_total(payload.quantity, payload.unit_price),
        **payload.model_dump(),
    )
    db.add(sponsor)
    db.commit()
    db.refresh(sponsor)
    return sponsor


@router.patch("/events/{event_id}/sponsors/{sponsor_id}", response_model=EventSponsorRead)
def update_sponsor(
    event_id: uuid.UUID,
    sponsor_id: uuid.UUID,
    payload: EventSponsorUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SPONSORS, "write")),
):
    sponsor = _get_sponsor_or_404(db, event_id, sponsor_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sponsor, field, value)
    if "quantity" in update_data or "unit_price" in update_data:
        sponsor.total_cost = _compute_total(float(sponsor.quantity), float(sponsor.unit_price))

    db.commit()
    db.refresh(sponsor)
    return sponsor


@router.delete("/events/{event_id}/sponsors/{sponsor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sponsor(
    event_id: uuid.UUID,
    sponsor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SPONSORS, "write")),
):
    sponsor = _get_sponsor_or_404(db, event_id, sponsor_id)
    db.delete(sponsor)
    db.commit()


@router.get("/events/{event_id}/sponsors/report")
def generate_sponsor_report(
    event_id: uuid.UUID,
    report_format: Literal["pdf", "csv"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SPONSORS, "read")),
):
    event = _get_event_or_404(db, event_id)
    sponsors = (
        db.query(EventSponsor)
        .filter(EventSponsor.event_id == event_id)
        .order_by(EventSponsor.category.is_(None), EventSponsor.category)
        .all()
    )
    rows = [
        {
            "name": s.name,
            "category": s.category,
            "quantity": float(s.quantity),
            "unit_price": float(s.unit_price),
            "total": float(s.total_cost),
        }
        for s in sponsors
    ]

    if report_format == "pdf":
        content = build_pdf_report("Sponsor Report", event.name, event.date, rows, "Total Amount")
        media_type = "application/pdf"
        filename = generate_report_filename("event-sponsors", "pdf")
    else:
        content = build_csv_report(rows, "Total Amount")
        media_type = "text/csv"
        filename = generate_report_filename("event-sponsors", "csv")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
