import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_rundown_defaults import DEFAULT_RUNDOWN_TEMPLATE
from app.core.event_summary import compute_event_summary
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Event, EventGuest, EventRundown, EventSetup, EventSponsor, Member
from app.schemas.event import EventCreate, EventRead, EventUpdate

EVENT_LIST = "event.list"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _serialize(db: Session, event: Event, *, include_aggregates: bool = False) -> EventRead:
    oc_chair_name = None
    if event.oc_chair_member_id is not None:
        member = db.get(Member, event.oc_chair_member_id)
        if member is not None:
            oc_chair_name = f"{member.first_name} {member.last_name}"

    setup = db.query(EventSetup).filter(EventSetup.event_id == event.id).first()
    ticket_price_normal = (
        float(setup.ticket_price_normal)
        if setup is not None and setup.ticket_price_normal is not None
        else None
    )

    data = EventRead.model_validate(event)
    data.oc_chair_member_name = oc_chair_name
    data.ticket_price_normal = ticket_price_normal

    # Story 14.13: guest/sponsor counts + net proceeds for the Events list
    # cards/table — only needed (and only computed) on the list endpoint.
    if include_aggregates:
        data.guest_count = (
            db.query(EventGuest).filter(EventGuest.event_id == event.id).count()
        )
        data.sponsor_count = (
            db.query(EventSponsor).filter(EventSponsor.event_id == event.id).count()
        )
        data.net_proceeds = compute_event_summary(db, event.id).net_operational_result

    return data


@router.get("/events", response_model=list[EventRead])
def list_events(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_LIST, "read")),
):
    events = db.query(Event).order_by(Event.rotary_year.desc(), Event.date.desc()).all()
    return [_serialize(db, event, include_aggregates=True) for event in events]


@router.post("/events", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_LIST, "write")),
):
    event = Event(
        name=payload.name,
        date=payload.date,
        hour=payload.hour,
        venue=payload.venue,
        oc_chair_member_id=payload.oc_chair_member_id,
        theme=payload.theme,
        rotary_year=rotary_year(payload.date),
    )
    db.add(event)
    db.flush()  # assign event.id before seeding rundown rows that FK to it

    # Story 14.11: default rundown auto-seeded for every new event — a
    # starting point only, every row is editable/deletable immediately.
    for sort_order, (time, activity, highlight) in enumerate(DEFAULT_RUNDOWN_TEMPLATE):
        db.add(
            EventRundown(
                event_id=event.id,
                time=time,
                activity=activity,
                highlight=highlight,
                sort_order=sort_order,
            )
        )

    db.commit()
    db.refresh(event)
    return _serialize(db, event)


@router.patch("/events/{event_id}", response_model=EventRead)
def update_event(
    event_id: uuid.UUID,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_LIST, "write")),
):
    event = _get_event_or_404(db, event_id)
    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(event, field, value)
    if "date" in update_data:
        event.rotary_year = rotary_year(event.date)

    db.commit()
    db.refresh(event)
    return _serialize(db, event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_LIST, "write")),
):
    # Story 14.2: all associated data (setup, table mapping, guests, items,
    # lucky draw config, costs, sponsors, rundown) cascades via each table's
    # own ON DELETE CASCADE FK to events.id (Story 14.1).
    event = _get_event_or_404(db, event_id)
    db.delete(event)
    db.commit()
