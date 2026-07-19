import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_lucky_draw_report import (
    build_auction_receipts_pdf,
    build_lucky_draw_results_pdf,
    build_programme_pdf,
)
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event, EventItem, EventLuckyDrawConfig, EventSetup, Member
from app.schemas.event_item import (
    EventItemCreate,
    EventItemRead,
    EventItemUpdate,
    EventLuckyDrawConfigRead,
    EventLuckyDrawConfigUpdate,
)

EVENT_AUCTION = "event.auction"

router = APIRouter()

# Story 14.6: lot ref sequences are independent per type-group — A for
# auction, L shared between lucky_draw_on_stage and lucky_draw (ordered by
# entry, not sub-type) — and reset per event (counted fresh each time, not
# stored as a running counter).
_L_TYPES = ("lucky_draw_on_stage", "lucky_draw")

# Story 14.6: fixed display sort — Auction, then Lucky Draw On Stage, then
# Lucky Draw, each group ordered by value_hkd descending.
_TYPE_ORDER = {"auction": 0, "lucky_draw_on_stage": 1, "lucky_draw": 2}


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_item_or_404(db: Session, event_id: uuid.UUID, item_id: uuid.UUID) -> EventItem:
    item = (
        db.query(EventItem)
        .filter(EventItem.id == item_id, EventItem.event_id == event_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


def _serialize(db: Session, item: EventItem) -> EventItemRead:
    contact_name = None
    if item.contact_rotary_id is not None:
        member = db.get(Member, item.contact_rotary_id)
        if member is not None:
            contact_name = f"{member.first_name} {member.last_name}"

    data = EventItemRead.model_validate(item)
    data.contact_rotary_name = contact_name
    return data


def _next_lot_ref(db: Session, event_id: uuid.UUID, item_type: str) -> str:
    if item_type == "auction":
        count = (
            db.query(EventItem)
            .filter(EventItem.event_id == event_id, EventItem.item_type == "auction")
            .count()
        )
        return f"A-{count + 1}"

    count = (
        db.query(EventItem)
        .filter(EventItem.event_id == event_id, EventItem.item_type.in_(_L_TYPES))
        .count()
    )
    return f"L-{count + 1}"


def _sorted_items(db: Session, event_id: uuid.UUID) -> list[EventItem]:
    items = db.query(EventItem).filter(EventItem.event_id == event_id).all()
    items.sort(key=lambda i: (_TYPE_ORDER[i.item_type], -(float(i.value_hkd) if i.value_hkd is not None else 0)))
    return items


@router.get("/events/{event_id}/items", response_model=list[EventItemRead])
def list_items(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "read")),
):
    _get_event_or_404(db, event_id)
    items = _sorted_items(db, event_id)
    return [_serialize(db, item) for item in items]


@router.get("/events/{event_id}/items/report/programme")
def generate_programme_report(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "read")),
):
    event = _get_event_or_404(db, event_id)
    items = [_serialize(db, item).model_dump() for item in _sorted_items(db, event_id)]
    content = build_programme_pdf(event.name, event.date, items)
    filename = generate_report_filename("lucky-draw-programme", "pdf")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/events/{event_id}/items/report/results")
def generate_lucky_draw_results_report(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "read")),
):
    event = _get_event_or_404(db, event_id)
    items = [_serialize(db, item).model_dump() for item in _sorted_items(db, event_id)]
    content = build_lucky_draw_results_pdf(event.name, event.date, items)
    filename = generate_report_filename("lucky-draw-results", "pdf")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/events/{event_id}/items/report/auction-receipts")
def generate_auction_receipts_report(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "read")),
):
    event = _get_event_or_404(db, event_id)
    items = [_serialize(db, item).model_dump() for item in _sorted_items(db, event_id)]
    auction_items = [i for i in items if i["item_type"] == "auction"]
    if not auction_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No auction items to generate receipts for"
        )

    setup = db.query(EventSetup).filter(EventSetup.event_id == event_id).first()
    setup_dict = {
        "payment_deadline": setup.payment_deadline.isoformat() if setup and setup.payment_deadline else None,
        "bank_account": setup.bank_account if setup else None,
        "fps_id": setup.fps_id if setup else None,
    }
    content = build_auction_receipts_pdf(event.name, event.date, auction_items, setup_dict)
    filename = generate_report_filename("auction-receipts", "pdf")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/events/{event_id}/items", response_model=EventItemRead, status_code=status.HTTP_201_CREATED)
def create_item(
    event_id: uuid.UUID,
    payload: EventItemCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "write")),
):
    _get_event_or_404(db, event_id)
    lot_ref = _next_lot_ref(db, event_id, payload.item_type)
    item = EventItem(event_id=event_id, lot_ref=lot_ref, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize(db, item)


@router.patch("/events/{event_id}/items/{item_id}", response_model=EventItemRead)
def update_item(
    event_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: EventItemUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "write")),
):
    # Story 14.6: lot_ref is assigned once at creation and never
    # regenerated on update, even if item_type changes — simplest rule
    # that keeps lot refs stable once printed/handed out.
    item = _get_item_or_404(db, event_id, item_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return _serialize(db, item)


@router.delete("/events/{event_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    event_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "write")),
):
    item = _get_item_or_404(db, event_id, item_id)
    db.delete(item)
    db.commit()


@router.get("/events/{event_id}/lucky-draw-config", response_model=EventLuckyDrawConfigRead)
def get_lucky_draw_config(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "read")),
):
    _get_event_or_404(db, event_id)
    config = (
        db.query(EventLuckyDrawConfig)
        .filter(EventLuckyDrawConfig.event_id == event_id)
        .first()
    )
    if config is None:
        return EventLuckyDrawConfigRead(event_id=event_id, tickets_sold=0, other_donation=0)
    return config


@router.put("/events/{event_id}/lucky-draw-config", response_model=EventLuckyDrawConfigRead)
def upsert_lucky_draw_config(
    event_id: uuid.UUID,
    payload: EventLuckyDrawConfigUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_AUCTION, "write")),
):
    _get_event_or_404(db, event_id)
    config = (
        db.query(EventLuckyDrawConfig)
        .filter(EventLuckyDrawConfig.event_id == event_id)
        .first()
    )
    if config is None:
        config = EventLuckyDrawConfig(event_id=event_id)
        db.add(config)

    config.tickets_sold = payload.tickets_sold
    config.other_donation = payload.other_donation
    db.commit()
    db.refresh(config)
    return config
