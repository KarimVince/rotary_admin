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

# Story 14.6, reworked 2026-08-08, then 2026-08-10, then twice more on
# 2026-08-11 (back to a shared *number* pool for the two lucky-draw
# subtypes, per explicit user request, but each subtype keeps its own
# displayed tag — "every type gets its own letter" from 2026-08-10 is
# superseded by "one letter for the group" which is itself superseded by
# this): the NUMBER is drawn from one continuous pool per group ("auction"
# on its own, "lucky_draw" shared by lucky_draw_on_stage + lucky_draw), but
# the PREFIX printed in lot_ref always follows the item's own item_type
# (_ITEM_PREFIX) — so within the shared group, on-stage items keep their
# "LS" tag and take the front of the pool (LS-1, LS-2…), then regular
# items continue the *same* pool without resetting to 1 (e.g. L-4, L-5…).
# See _recompute_group/_SUBTYPE_ORDER below for the pool ordering, and
# _insert_and_shift for manual override support.
_ITEM_PREFIX = {"auction": "A", "lucky_draw_on_stage": "LS", "lucky_draw": "L"}

# Maps each item_type to the shared lot_ref number pool it belongs to —
# auction is its own pool, the two lucky-draw subtypes share one (see
# _ITEM_PREFIX above for why the printed tag still differs between them).
_GROUP_KEY = {"auction": "auction", "lucky_draw_on_stage": "lucky_draw", "lucky_draw": "lucky_draw"}

# Within the shared "lucky_draw" pool, on-stage items form the first block
# and regular lucky-draw items the second — each block internally ordered
# by value_hkd descending (see _recompute_group). Not used for "auction",
# which has no subtype split.
_SUBTYPE_ORDER = {"lucky_draw_on_stage": 0, "lucky_draw": 1}

# Story 14.6: fixed display sort — Auction, then the shared Lucky Draw
# pool (on-stage block, then regular block, each value_hkd descending).
_TYPE_ORDER = {"auction": 0, "lucky_draw_on_stage": 1, "lucky_draw": 1}


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


def _group_key(item_type: str) -> str:
    return _GROUP_KEY[item_type]


def _item_prefix(item_type: str) -> str:
    return _ITEM_PREFIX[item_type]


def _group_filter(group_key: str):
    types = [item_type for item_type, key in _GROUP_KEY.items() if key == group_key]
    return EventItem.item_type.in_(types)


def _recompute_group(db: Session, event_id: uuid.UUID, group_key: str) -> None:
    """Full re-sync: renumber every item in this group's pool — for
    "lucky_draw", on-stage items first (as a block), then regular items,
    each block ordered by value_hkd descending (no-value items sort last
    within their block; id as a stable tiebreaker); "auction" has no
    subtype split so _SUBTYPE_ORDER is a no-op there. The number keeps
    counting up across both blocks (not reset at the block boundary) but
    each item's printed prefix always follows its own item_type — so a
    3-item on-stage block followed by 2 regular items becomes
    LS-1, LS-2, LS-3, L-4, L-5. Clears every lot_ref_overridden flag in the
    group. Call whenever the group needs to go back to pure subtype+value
    order — a value_hkd or item_type change, or a new item being added to
    it."""
    items = (
        db.query(EventItem)
        .filter(EventItem.event_id == event_id, _group_filter(group_key))
        .all()
    )
    items.sort(
        key=lambda i: (
            _SUBTYPE_ORDER.get(i.item_type, 0),
            -(float(i.value_hkd) if i.value_hkd is not None else -1),
            str(i.id),
        )
    )
    for index, item in enumerate(items):
        item.lot_ref = f"{_item_prefix(item.item_type)}-{index + 1}"
        item.lot_ref_overridden = False


def _parse_lot_number(lot_ref: str, prefix: str) -> int:
    """Raises ValueError if lot_ref isn't a well-formed "<prefix>-<n>" for
    this item's own prefix."""
    head = f"{prefix}-"
    if not lot_ref.startswith(head):
        raise ValueError(f'must start with "{head}"')
    suffix = lot_ref[len(head):]
    if not suffix.isdigit() or int(suffix) < 1:
        raise ValueError("must end with a positive whole number")
    return int(suffix)


def _insert_and_shift(
    db: Session, event_id: uuid.UUID, group_key: str, moving_item: EventItem, target_number: int
) -> None:
    """Manual override: moving_item takes target_number within the group's
    shared number pool, everything at or after that position shifts up by
    one. Each shifted item keeps its own prefix (LS/L/A per its item_type)
    while sharing the same running number as moving_item. Only
    moving_item's lot_ref_overridden flag is set — the shifted items'
    numbers changed as a side effect, not a manual choice of their own."""
    others = (
        db.query(EventItem)
        .filter(EventItem.event_id == event_id, _group_filter(group_key), EventItem.id != moving_item.id)
        .all()
    )
    others.sort(
        key=lambda i: _parse_lot_number(i.lot_ref, _item_prefix(i.item_type)) if i.lot_ref else 10**9
    )
    index = max(0, min(target_number - 1, len(others)))
    ordered = others[:index] + [moving_item] + others[index:]
    for position, item in enumerate(ordered):
        item.lot_ref = f"{_item_prefix(item.item_type)}-{position + 1}"
    moving_item.lot_ref_overridden = True


def _lot_number(item: EventItem) -> int:
    """Sort key for the current lot number — falls back to "last" for the
    rare case of a missing/malformed lot_ref rather than raising."""
    if not item.lot_ref:
        return 10**9
    try:
        return _parse_lot_number(item.lot_ref, _item_prefix(item.item_type))
    except ValueError:
        return 10**9


def _sorted_items(db: Session, event_id: uuid.UUID) -> list[EventItem]:
    # 2026-08-10: always display in current lot-number order, not
    # value_hkd directly — the number already *is* the value order by
    # default (see _recompute_group), but after a manual override the two
    # diverge; the displayed row order must follow the number (whether
    # changed or not) so the list and the lot refs on screen never
    # contradict each other.
    items = db.query(EventItem).filter(EventItem.event_id == event_id).all()
    items.sort(key=lambda i: (_TYPE_ORDER[i.item_type], _lot_number(i)))
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
    item = EventItem(event_id=event_id, **payload.model_dump())
    db.add(item)
    db.flush()
    # 2026-08-08: lot_ref defaults to value-descending position within the
    # item's type-group, recomputed fresh (including every existing item
    # in the group) rather than just appended — a new high-value item can
    # land at #1, bumping everything else down.
    _recompute_group(db, event_id, _group_key(item.item_type))
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
    # 2026-08-08 rework, 2026-08-10, then 2026-08-11 (back to a shared
    # "lucky_draw" group, see _GROUP_KEY): lot_ref no longer stays fixed
    # forever —
    #  - a manual `lot_ref` in the payload is an override: insert-and-shift
    #    within the item's (post-update) group, mark overridden.
    #  - a value_hkd change re-syncs the affected group(s) to pure
    #    subtype+value order, clearing every override in them.
    #  - an item_type change re-syncs too, even when it stays within the
    #    same shared group (on-stage <-> regular lucky draw) — the subtype
    #    determines which block the item lands in, so the group's whole
    #    ordering can change even though no item left the group.
    item = _get_item_or_404(db, event_id, item_id)
    update_data = payload.model_dump(exclude_unset=True)
    lot_ref_override = update_data.pop("lot_ref", None)

    old_group = _group_key(item.item_type)
    type_changed = "item_type" in update_data
    for field, value in update_data.items():
        setattr(item, field, value)
    new_group = _group_key(item.item_type)

    value_changed = "value_hkd" in update_data
    group_crossed = old_group != new_group

    if lot_ref_override is not None and not value_changed and not type_changed:
        # The override must use the item's OWN prefix (LS/L/A per its
        # item_type), not a group-level one — within the shared
        # "lucky_draw" pool an on-stage item is still only addressable as
        # "LS-<n>", never "L-<n>".
        prefix = _item_prefix(item.item_type)
        try:
            target_number = _parse_lot_number(lot_ref_override, prefix)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f'Invalid lot ref "{lot_ref_override}": {exc}',
            ) from exc
        db.flush()
        _insert_and_shift(db, event_id, new_group, item, target_number)
    elif value_changed or type_changed:
        # 2026-08-11 fix: the pending item_type/value_hkd mutation above
        # must be flushed BEFORE the old_group recompute query runs —
        # without it, old_group's SELECT can still match `item` on its
        # stale (pre-change) DB row, and the ORM's identity map then hands
        # back the SAME Python object with the ALREADY-mutated attributes,
        # so it gets sorted/prefixed as if it were still in old_group using
        # its new item_type — corrupting one slot in old_group's numbering
        # (a real item ends up skipped, e.g. A-1 never assigned) even
        # though `item` itself gets correctly renumbered again moments
        # later by the new_group recompute. Symptom reported: moving an
        # item out of Auction left a gap in the Auction list; moving one
        # back into Auction didn't renumber On Stage either.
        db.flush()
        if group_crossed:
            _recompute_group(db, event_id, old_group)
        db.flush()
        _recompute_group(db, event_id, new_group)

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
    # 2026-08-10 fix: deleting an item left a gap in its group's numbering
    # (e.g. A-1, A-3 with no A-2) — _recompute_group wasn't called here at
    # all. Closes the gap the same way a type-change moving an item out of
    # the group already does.
    item = _get_item_or_404(db, event_id, item_id)
    group_key = _group_key(item.item_type)
    db.delete(item)
    db.flush()
    _recompute_group(db, event_id, group_key)
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
