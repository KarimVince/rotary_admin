import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.event_category_totals_report import build_csv_report, build_pdf_report
from app.core.report_filename import generate_report_filename
from app.db.session import get_db
from app.models import Event, EventCost
from app.schemas.event_cost import EventCostCreate, EventCostRead, EventCostUpdate

EVENT_COSTS = "event.costs"

router = APIRouter()


def _get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_cost_or_404(db: Session, event_id: uuid.UUID, cost_id: uuid.UUID) -> EventCost:
    cost = (
        db.query(EventCost)
        .filter(EventCost.id == cost_id, EventCost.event_id == event_id)
        .first()
    )
    if cost is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost item not found")
    return cost


def _compute_total(quantity: float, unit_price: float) -> float:
    return round(quantity * unit_price, 2)


@router.get("/events/{event_id}/costs", response_model=list[EventCostRead])
def list_costs(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_COSTS, "read")),
):
    _get_event_or_404(db, event_id)
    # Story 14.8: grouped by category — category ascending (nulls last),
    # entry order preserved within each category via natural row order.
    return (
        db.query(EventCost)
        .filter(EventCost.event_id == event_id)
        .order_by(EventCost.category.is_(None), EventCost.category)
        .all()
    )


@router.post("/events/{event_id}/costs", response_model=EventCostRead, status_code=status.HTTP_201_CREATED)
def create_cost(
    event_id: uuid.UUID,
    payload: EventCostCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_COSTS, "write")),
):
    _get_event_or_404(db, event_id)
    cost = EventCost(
        event_id=event_id,
        total_cost=_compute_total(payload.quantity, payload.unit_price),
        **payload.model_dump(),
    )
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return cost


@router.patch("/events/{event_id}/costs/{cost_id}", response_model=EventCostRead)
def update_cost(
    event_id: uuid.UUID,
    cost_id: uuid.UUID,
    payload: EventCostUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_COSTS, "write")),
):
    cost = _get_cost_or_404(db, event_id, cost_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cost, field, value)
    if "quantity" in update_data or "unit_price" in update_data:
        cost.total_cost = _compute_total(float(cost.quantity), float(cost.unit_price))

    db.commit()
    db.refresh(cost)
    return cost


@router.delete("/events/{event_id}/costs/{cost_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cost(
    event_id: uuid.UUID,
    cost_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_COSTS, "write")),
):
    cost = _get_cost_or_404(db, event_id, cost_id)
    db.delete(cost)
    db.commit()


@router.get("/events/{event_id}/costs/report")
def generate_cost_report(
    event_id: uuid.UUID,
    report_format: Literal["pdf", "csv"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(EVENT_COSTS, "read")),
):
    event = _get_event_or_404(db, event_id)
    costs = (
        db.query(EventCost)
        .filter(EventCost.event_id == event_id)
        .order_by(EventCost.category.is_(None), EventCost.category)
        .all()
    )
    rows = [
        {
            "name": c.name,
            "category": c.category,
            "quantity": float(c.quantity),
            "unit_price": float(c.unit_price),
            "total": float(c.total_cost),
        }
        for c in costs
    ]

    if report_format == "pdf":
        content = build_pdf_report("Operational Cost Report", event.name, event.date, rows, "Total Cost")
        media_type = "application/pdf"
        filename = generate_report_filename("event-operational-cost", "pdf")
    else:
        content = build_csv_report(rows, "Total Cost")
        media_type = "text/csv"
        filename = generate_report_filename("event-operational-cost", "csv")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
