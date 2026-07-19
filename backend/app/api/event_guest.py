import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_guest_report import build_csv_report, build_pdf_report
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event, EventGuest, EventTableMapping, Member
from app.schemas.event_guest import EventGuestCreate, EventGuestRead, EventGuestUpdate

EVENT_GUESTS = "event.guests"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_guest_or_404(db: Session, event_id: uuid.UUID, guest_id: uuid.UUID) -> EventGuest:
    guest = (
        db.query(EventGuest)
        .filter(EventGuest.id == guest_id, EventGuest.event_id == event_id)
        .first()
    )
    if guest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guest not found")
    return guest


def _serialize(db: Session, guest: EventGuest) -> EventGuestRead:
    contact_name = None
    if guest.contact_rotarian_id is not None:
        member = db.get(Member, guest.contact_rotarian_id)
        if member is not None:
            contact_name = f"{member.first_name} {member.last_name}"

    data = EventGuestRead.model_validate(guest)
    data.contact_rotarian_name = contact_name
    return data


@router.get("/events/{event_id}/guests", response_model=list[EventGuestRead])
def list_guests(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_GUESTS, "read")),
):
    _get_event_or_404(db, event_id)
    # Story 14.4: sorted by table number then surname by default. NULLS
    # LAST so unassigned guests sort after seated ones.
    guests = (
        db.query(EventGuest)
        .filter(EventGuest.event_id == event_id)
        .order_by(EventGuest.table_number.is_(None), EventGuest.table_number, EventGuest.surname)
        .all()
    )
    return [_serialize(db, guest) for guest in guests]


@router.get("/events/{event_id}/guests/report")
def generate_guest_list_report(
    event_id: uuid.UUID,
    report_format: Literal["pdf", "csv"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_GUESTS, "read")),
):
    event = _get_event_or_404(db, event_id)
    guests = (
        db.query(EventGuest)
        .filter(EventGuest.event_id == event_id)
        .order_by(EventGuest.table_number.is_(None), EventGuest.table_number, EventGuest.surname)
        .all()
    )
    guest_dicts = [_serialize(db, guest).model_dump() for guest in guests]

    tables = db.query(EventTableMapping).filter(EventTableMapping.event_id == event_id).all()
    table_by_number = {
        table.table_number: {
            "table_number": table.table_number,
            "theme_name": table.theme_name,
            "rotary_name": table.rotary_name,
        }
        for table in tables
    }

    if report_format == "pdf":
        content = build_pdf_report(event.name, event.date, guest_dicts, table_by_number)
        media_type = "application/pdf"
        filename = generate_report_filename("event-guest-list", "pdf")
    else:
        content = build_csv_report(guest_dicts, table_by_number)
        media_type = "text/csv"
        filename = generate_report_filename("event-guest-list", "csv")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/events/{event_id}/guests", response_model=EventGuestRead, status_code=status.HTTP_201_CREATED)
def create_guest(
    event_id: uuid.UUID,
    payload: EventGuestCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_GUESTS, "write")),
):
    _get_event_or_404(db, event_id)
    guest = EventGuest(event_id=event_id, **payload.model_dump())
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return _serialize(db, guest)


@router.patch("/events/{event_id}/guests/{guest_id}", response_model=EventGuestRead)
def update_guest(
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    payload: EventGuestUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_GUESTS, "write")),
):
    guest = _get_guest_or_404(db, event_id, guest_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(guest, field, value)

    db.commit()
    db.refresh(guest)
    return _serialize(db, guest)


@router.delete("/events/{event_id}/guests/{guest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guest(
    event_id: uuid.UUID,
    guest_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_GUESTS, "write")),
):
    guest = _get_guest_or_404(db, event_id, guest_id)
    db.delete(guest)
    db.commit()
