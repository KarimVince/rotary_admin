import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import AttendanceEvent, DinnerEventType
from app.schemas.dinner_event_type import (
    DinnerEventTypeCreate,
    DinnerEventTypeRead,
    DinnerEventTypeReorder,
    DinnerEventTypeUpdate,
)

router = APIRouter()

ADMIN_DINNER_EVENT_TYPES = "admin.dinner_event_types"
# The Dinner Events list/report/forms need to read this list to render type
# chips and populate selectors — gated by the broader Dinner module
# permission (default read for everyone), not the narrower admin-management
# one that only Secretary/President/President Elect get.
FORECAST_KEY = "attendance.forecast"


def _get_type_or_404(db: Session, type_id: uuid.UUID) -> DinnerEventType:
    event_type = db.get(DinnerEventType, type_id)
    if event_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")
    return event_type


@router.get("/dinner-event-types", response_model=list[DinnerEventTypeRead])
def list_dinner_event_types(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FORECAST_KEY, "read")),
):
    types = db.query(DinnerEventType).order_by(DinnerEventType.sort_order).all()
    counts = dict(
        db.query(AttendanceEvent.event_type, func.count(AttendanceEvent.id))
        .group_by(AttendanceEvent.event_type)
        .all()
    )
    results = []
    for event_type in types:
        item = DinnerEventTypeRead.model_validate(event_type)
        item.event_count = counts.get(event_type.name, 0)
        results.append(item)
    return results


@router.post("/dinner-event-types", response_model=DinnerEventTypeRead, status_code=201)
def create_dinner_event_type(
    payload: DinnerEventTypeCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_DINNER_EVENT_TYPES, "write")),
):
    existing = db.query(DinnerEventType).filter(DinnerEventType.name == payload.name).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Event type name already exists"
        )

    max_sort_order = db.query(func.max(DinnerEventType.sort_order)).scalar()
    event_type = DinnerEventType(
        name=payload.name,
        color_bg=payload.color_bg,
        color_text=payload.color_text,
        sort_order=0 if max_sort_order is None else max_sort_order + 1,
    )
    db.add(event_type)
    db.commit()
    db.refresh(event_type)
    return event_type


@router.patch("/dinner-event-types/reorder", response_model=list[DinnerEventTypeRead])
def reorder_dinner_event_types(
    payload: DinnerEventTypeReorder,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_DINNER_EVENT_TYPES, "write")),
):
    # Registered before "/{type_id}" so the literal "reorder" path segment
    # isn't swallowed as a UUID path param.
    types = {t.id: t for t in db.query(DinnerEventType).all()}
    for item in payload.items:
        event_type = types.get(item.id)
        if event_type is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Event type {item.id} not found"
            )
        event_type.sort_order = item.sort_order

    db.commit()
    return db.query(DinnerEventType).order_by(DinnerEventType.sort_order).all()


@router.patch("/dinner-event-types/{type_id}", response_model=DinnerEventTypeRead)
def update_dinner_event_type(
    type_id: uuid.UUID,
    payload: DinnerEventTypeUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_DINNER_EVENT_TYPES, "write")),
):
    event_type = _get_type_or_404(db, type_id)

    data = payload.model_dump(exclude_unset=True)
    renamed_from = None
    if data.get("name") is not None and data["name"] != event_type.name:
        existing = (
            db.query(DinnerEventType)
            .filter(DinnerEventType.name == data["name"], DinnerEventType.id != type_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Event type name already exists"
            )
        renamed_from = event_type.name

    for field, value in data.items():
        setattr(event_type, field, value)

    if renamed_from is not None:
        # event_type is stored as a plain name string on AttendanceEvent
        # (no FK — see Story 16.10's migration notes), so a rename must
        # re-point every existing event to keep its chip/label resolving.
        db.query(AttendanceEvent).filter(AttendanceEvent.event_type == renamed_from).update(
            {"event_type": event_type.name}
        )

    db.commit()
    db.refresh(event_type)
    return event_type


@router.delete("/dinner-event-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dinner_event_type(
    type_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_DINNER_EVENT_TYPES, "write")),
):
    event_type = _get_type_or_404(db, type_id)
    in_use = (
        db.query(AttendanceEvent.id).filter(AttendanceEvent.event_type == event_type.name).first()
    )
    if in_use is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an event type that is in use by existing dinner events",
        )
    db.delete(event_type)
    db.commit()
    return None
