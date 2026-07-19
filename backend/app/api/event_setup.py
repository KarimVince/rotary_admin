import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import Event, EventCostCategory, EventSetup, EventSponsorCategory, EventTableMapping
from app.schemas.event_setup import (
    EventCategoryCreate,
    EventCategoryRead,
    EventCategoryUpdate,
    EventSetupRead,
    EventSetupUpdate,
    EventTableMappingCreate,
    EventTableMappingRead,
    EventTableMappingUpdate,
)

EVENT_SETUP = "event.setup"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_table_mapping_or_404(
    db: Session, event_id: uuid.UUID, mapping_id: uuid.UUID
) -> EventTableMapping:
    mapping = (
        db.query(EventTableMapping)
        .filter(EventTableMapping.id == mapping_id, EventTableMapping.event_id == event_id)
        .first()
    )
    if mapping is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    return mapping


@router.get("/events/{event_id}/setup", response_model=EventSetupRead)
def get_event_setup(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "read")),
):
    _get_event_or_404(db, event_id)
    setup = db.query(EventSetup).filter(EventSetup.event_id == event_id).first()
    if setup is None:
        # Story 14.3: no row yet — surface defaults rather than 404 so the
        # Setup page can render its price fields empty on a brand-new event.
        return EventSetupRead(
            event_id=event_id,
            ticket_price_normal=None,
            ticket_price_early_bird=None,
            lucky_draw_ticket_price=None,
        )
    return setup


@router.put("/events/{event_id}/setup", response_model=EventSetupRead)
def upsert_event_setup(
    event_id: uuid.UUID,
    payload: EventSetupUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "write")),
):
    _get_event_or_404(db, event_id)
    setup = db.query(EventSetup).filter(EventSetup.event_id == event_id).first()
    if setup is None:
        setup = EventSetup(event_id=event_id)
        db.add(setup)

    for field, value in payload.model_dump().items():
        setattr(setup, field, value)

    db.commit()
    db.refresh(setup)
    return setup


@router.get("/events/{event_id}/table-mapping", response_model=list[EventTableMappingRead])
def list_table_mapping(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "read")),
):
    _get_event_or_404(db, event_id)
    return (
        db.query(EventTableMapping)
        .filter(EventTableMapping.event_id == event_id)
        .order_by(EventTableMapping.table_number)
        .all()
    )


@router.post(
    "/events/{event_id}/table-mapping",
    response_model=EventTableMappingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_table_mapping(
    event_id: uuid.UUID,
    payload: EventTableMappingCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "write")),
):
    _get_event_or_404(db, event_id)
    mapping = EventTableMapping(event_id=event_id, **payload.model_dump())
    db.add(mapping)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Table number already exists"
        ) from exc
    db.refresh(mapping)
    return mapping


@router.patch(
    "/events/{event_id}/table-mapping/{mapping_id}", response_model=EventTableMappingRead
)
def update_table_mapping(
    event_id: uuid.UUID,
    mapping_id: uuid.UUID,
    payload: EventTableMappingUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "write")),
):
    mapping = _get_table_mapping_or_404(db, event_id, mapping_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(mapping, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Table number already exists"
        ) from exc
    db.refresh(mapping)
    return mapping


@router.delete("/events/{event_id}/table-mapping/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table_mapping(
    event_id: uuid.UUID,
    mapping_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_SETUP, "write")),
):
    mapping = _get_table_mapping_or_404(db, event_id, mapping_id)
    db.delete(mapping)
    db.commit()


def _category_router(model, prefix: str):
    """Story 14.3: cost categories and sponsor categories are two separate
    global lookup tables with identical shape and CRUD behaviour — a small
    factory avoids writing the same four endpoints twice."""

    sub_router = APIRouter()

    def _get_or_404(db: Session, category_id: uuid.UUID):
        category = db.get(model, category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        return category

    @sub_router.get(f"/{prefix}", response_model=list[EventCategoryRead])
    def list_categories(
        db: Session = Depends(get_db),
        _current_user=Depends(require_access(EVENT_SETUP, "read")),
    ):
        return db.query(model).order_by(model.name).all()

    @sub_router.post(f"/{prefix}", response_model=EventCategoryRead, status_code=status.HTTP_201_CREATED)
    def create_category(
        payload: EventCategoryCreate,
        db: Session = Depends(get_db),
        _current_user=Depends(require_access(EVENT_SETUP, "write")),
    ):
        existing = db.query(model).filter(model.name == payload.name).first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Category name already exists"
            )
        category = model(name=payload.name)
        db.add(category)
        db.commit()
        db.refresh(category)
        return category

    @sub_router.patch(f"/{prefix}/{{category_id}}", response_model=EventCategoryRead)
    def update_category(
        category_id: uuid.UUID,
        payload: EventCategoryUpdate,
        db: Session = Depends(get_db),
        _current_user=Depends(require_access(EVENT_SETUP, "write")),
    ):
        category = _get_or_404(db, category_id)
        existing = (
            db.query(model)
            .filter(model.name == payload.name, model.id != category_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Category name already exists"
            )
        category.name = payload.name
        db.commit()
        db.refresh(category)
        return category

    @sub_router.delete(f"/{prefix}/{{category_id}}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_category(
        category_id: uuid.UUID,
        db: Session = Depends(get_db),
        _current_user=Depends(require_access(EVENT_SETUP, "write")),
    ):
        category = _get_or_404(db, category_id)
        db.delete(category)
        db.commit()

    return sub_router


router.include_router(_category_router(EventCostCategory, "event-cost-categories"))
router.include_router(_category_router(EventSponsorCategory, "event-sponsor-categories"))
