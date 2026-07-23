import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.api.donations import _compute_donation_statistics
from app.core.member_fee_totals import total_collected
from app.core.rotary_year import rotary_year as compute_rotary_year
from app.db.session import get_db
from app.models import (
    AdhocDonation,
    Event,
    EventCost,
    EventItem,
    EventLuckyDrawConfig,
    EventSetup,
    FinanceCategory,
    MemberFee,
    OperationalEntry,
    User,
)
from app.schemas.adhoc_donation import (
    AdhocDonationCreate,
    AdhocDonationRead,
    AdhocDonationUpdate,
    EventFundraisingRow,
    FundraisingSummary,
)
from app.schemas.finance_summary import FinanceSummary
from app.schemas.operational_entry import (
    OperationalEntryCreate,
    OperationalEntryRead,
    OperationalEntryUpdate,
    OperationalSummary,
    OperationalSummaryRow,
)

router = APIRouter()

FINANCE_SUMMARY = "finance.summary"
FINANCE_FUNDRAISING = "finance.fundraising"
FINANCE_OPERATIONAL = "finance.operational"


def _get_adhoc_donation_or_404(db: Session, donation_id: uuid.UUID) -> AdhocDonation:
    donation = db.get(AdhocDonation, donation_id)
    if donation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ad hoc donation not found"
        )
    return donation


@router.get("/adhoc-donations", response_model=list[AdhocDonationRead])
def list_adhoc_donations(
    rotary_year: int | None = Query(None, description="Filter to a single rotary year"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FINANCE_FUNDRAISING, "read")),
):
    query = db.query(AdhocDonation)
    if rotary_year is not None:
        query = query.filter(AdhocDonation.rotary_year == rotary_year)
    return query.order_by(AdhocDonation.donation_date.desc()).all()


@router.post("/adhoc-donations", response_model=AdhocDonationRead, status_code=201)
def create_adhoc_donation(
    payload: AdhocDonationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(FINANCE_FUNDRAISING, "write")),
):
    data = payload.model_dump()
    if data.get("rotary_year") is None:
        data["rotary_year"] = compute_rotary_year(data["donation_date"])

    donation = AdhocDonation(created_by=current_user.id, **data)
    db.add(donation)
    db.commit()
    db.refresh(donation)
    return donation


@router.patch("/adhoc-donations/{donation_id}", response_model=AdhocDonationRead)
def update_adhoc_donation(
    donation_id: uuid.UUID,
    payload: AdhocDonationUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FINANCE_FUNDRAISING, "write")),
):
    donation = _get_adhoc_donation_or_404(db, donation_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(donation, field, value)
    db.commit()
    db.refresh(donation)
    return donation


@router.delete("/adhoc-donations/{donation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adhoc_donation(
    donation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FINANCE_FUNDRAISING, "write")),
):
    donation = _get_adhoc_donation_or_404(db, donation_id)
    db.delete(donation)
    db.commit()


def _compute_fundraising_summary(db: Session, selected_year: int) -> FundraisingSummary:
    """Story 17.3 — event fundraising income (auction proceeds, lucky draw
    ticket sales + other_donation) recapped per event, plus the ad hoc
    donations total, combined into one figure for the Finance Summary
    (17.1). The Event module (Epic 14) only has its data model built so
    far (Story 14.1) — no UI populates these tables yet, so `events`
    correctly comes back empty/zero until Epic 14's later stories ship;
    this endpoint is wired against the real tables so nothing needs
    revisiting then."""
    events = (
        db.query(Event).filter(Event.rotary_year == selected_year).order_by(Event.date).all()
    )

    auction_totals = dict(
        db.query(EventItem.event_id, func.coalesce(func.sum(EventItem.value_sold), 0))
        .filter(EventItem.item_type == "auction", EventItem.value_sold.isnot(None))
        .group_by(EventItem.event_id)
        .all()
    )
    lucky_draw_configs = {row.event_id: row for row in db.query(EventLuckyDrawConfig).all()}
    ticket_prices = dict(db.query(EventSetup.event_id, EventSetup.lucky_draw_ticket_price).all())

    rows: list[EventFundraisingRow] = []
    event_fundraising_total = 0.0
    for event in events:
        auction_total = float(auction_totals.get(event.id, 0) or 0)
        config = lucky_draw_configs.get(event.id)
        ticket_price = float(ticket_prices.get(event.id) or 0)
        tickets_sold = config.tickets_sold if config else 0
        other_donation_total = float(config.other_donation) if config else 0.0
        lucky_draw_total = tickets_sold * ticket_price
        total = auction_total + lucky_draw_total + other_donation_total
        if total == 0:
            # Nothing raised yet for this event — omit rather than clutter
            # the recap with an all-zero row for every dinner/event.
            continue
        rows.append(
            EventFundraisingRow(
                event_id=event.id,
                event_name=event.name,
                event_date=event.date,
                auction_total=auction_total,
                lucky_draw_total=lucky_draw_total,
                other_donation_total=other_donation_total,
                total=total,
            )
        )
        event_fundraising_total += total

    adhoc_donations_total = float(
        db.query(func.coalesce(func.sum(AdhocDonation.amount), 0))
        .filter(AdhocDonation.rotary_year == selected_year)
        .scalar()
    )

    return FundraisingSummary(
        rotary_year=selected_year,
        events=rows,
        event_fundraising_total=event_fundraising_total,
        adhoc_donations_total=adhoc_donations_total,
        combined_total=event_fundraising_total + adhoc_donations_total,
    )


@router.get("/finance/fundraising-summary", response_model=FundraisingSummary)
def fundraising_summary(
    rotary_year: int | None = Query(
        None, description="Rotary year to summarize; defaults to the current rotary year"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FINANCE_FUNDRAISING, "read")),
):
    selected_year = (
        rotary_year if rotary_year is not None else compute_rotary_year(date.today())
    )
    return _compute_fundraising_summary(db, selected_year)


def _get_operational_entry_or_404(db: Session, entry_id: uuid.UUID) -> OperationalEntry:
    entry = db.get(OperationalEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Operational entry not found"
        )
    return entry


def _validate_category_matches_type(db: Session, category_id: uuid.UUID, entry_type: str) -> None:
    category = db.get(FinanceCategory, category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Finance category not found"
        )
    if category.type != entry_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Category '{category.name}' is a {category.type} category, not {entry_type}",
        )


@router.get("/operational-entries", response_model=list[OperationalEntryRead])
def list_operational_entries(
    rotary_year: int | None = Query(None, description="Filter to a single rotary year"),
    entry_type: Literal["revenue", "cost"] | None = Query(None, alias="type"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FINANCE_OPERATIONAL, "read")),
):
    query = db.query(OperationalEntry)
    if rotary_year is not None:
        query = query.filter(OperationalEntry.rotary_year == rotary_year)
    if entry_type is not None:
        query = query.filter(OperationalEntry.type == entry_type)
    return query.order_by(OperationalEntry.entry_date.desc()).all()


@router.post("/operational-entries", response_model=OperationalEntryRead, status_code=201)
def create_operational_entry(
    payload: OperationalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(FINANCE_OPERATIONAL, "write")),
):
    _validate_category_matches_type(db, payload.category_id, payload.type)

    data = payload.model_dump()
    if data.get("rotary_year") is None:
        data["rotary_year"] = compute_rotary_year(data["entry_date"])

    entry = OperationalEntry(created_by=current_user.id, source="manual", **data)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/operational-entries/{entry_id}", response_model=OperationalEntryRead)
def update_operational_entry(
    entry_id: uuid.UUID,
    payload: OperationalEntryUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FINANCE_OPERATIONAL, "write")),
):
    entry = _get_operational_entry_or_404(db, entry_id)
    update_data = payload.model_dump(exclude_unset=True)

    new_type = update_data.get("type", entry.type)
    new_category_id = update_data.get("category_id", entry.category_id)
    if "type" in update_data or "category_id" in update_data:
        _validate_category_matches_type(db, new_category_id, new_type)

    for field, value in update_data.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/operational-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operational_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(FINANCE_OPERATIONAL, "write")),
):
    entry = _get_operational_entry_or_404(db, entry_id)
    db.delete(entry)
    db.commit()


def _compute_operational_summary(db: Session, selected_year: int) -> OperationalSummary:
    """Story 17.5 — manual revenue/cost entries plus two auto-pulled,
    read-only rows: the Member Fees collected total (Revenue) and one
    lump-sum-per-event row from the Event module's cost data (Cost). Same
    "wired against the real tables now, $0 until Epic 14 has UI" reasoning
    as Story 17.3's fundraising summary."""
    manual_entries = (
        db.query(OperationalEntry).filter(OperationalEntry.rotary_year == selected_year).all()
    )
    category_names = dict(db.query(FinanceCategory.id, FinanceCategory.name).all())

    revenue_rows: list[OperationalSummaryRow] = []
    cost_rows: list[OperationalSummaryRow] = []
    total_revenue = 0.0
    total_cost = 0.0

    for entry in manual_entries:
        row = OperationalSummaryRow(
            id=entry.id,
            category_name=category_names.get(entry.category_id, "Uncategorized"),
            amount=float(entry.amount),
            entry_date=entry.entry_date,
            notes=entry.notes,
            source=entry.source,
            editable=True,
        )
        if entry.type == "revenue":
            revenue_rows.append(row)
            total_revenue += float(entry.amount)
        else:
            cost_rows.append(row)
            total_cost += float(entry.amount)

    fees_total = total_collected(
        db.query(MemberFee).filter(MemberFee.rotary_year == selected_year).all()
    )
    if fees_total > 0:
        revenue_rows.append(
            OperationalSummaryRow(
                id=None,
                category_name="Member Fees",
                amount=fees_total,
                entry_date=None,
                notes=None,
                source="member_fees",
                editable=False,
            )
        )
        total_revenue += fees_total

    events = db.query(Event).filter(Event.rotary_year == selected_year).order_by(Event.date).all()
    event_cost_totals = dict(
        db.query(EventCost.event_id, func.coalesce(func.sum(EventCost.total_cost), 0))
        .group_by(EventCost.event_id)
        .all()
    )
    for event in events:
        event_total = float(event_cost_totals.get(event.id, 0) or 0)
        if event_total == 0:
            continue
        cost_rows.append(
            OperationalSummaryRow(
                id=None,
                category_name=event.name,
                amount=event_total,
                entry_date=event.date,
                notes=None,
                source="event",
                editable=False,
            )
        )
        total_cost += event_total

    return OperationalSummary(
        rotary_year=selected_year,
        revenue=revenue_rows,
        cost=cost_rows,
        total_revenue=total_revenue,
        total_cost=total_cost,
    )


@router.get("/finance/operational-summary", response_model=OperationalSummary)
def operational_summary(
    rotary_year: int | None = Query(
        None, description="Rotary year to summarize; defaults to the current rotary year"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FINANCE_OPERATIONAL, "read")),
):
    selected_year = (
        rotary_year if rotary_year is not None else compute_rotary_year(date.today())
    )
    return _compute_operational_summary(db, selected_year)


@router.get("/finance/summary", response_model=FinanceSummary)
def finance_summary(
    rotary_year: int | None = Query(
        None, description="Rotary year to summarize; defaults to the current rotary year"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FINANCE_SUMMARY, "read")),
):
    """Story 17.1 — Finance Summary landing page. Two-column overview built
    entirely from figures already computed by 17.2-17.5's own endpoints
    (donation statistics, fundraising summary, operational summary) — no
    new data entry or duplicated queries, per the story's own AC."""
    selected_year = (
        rotary_year if rotary_year is not None else compute_rotary_year(date.today())
    )

    donation_stats = _compute_donation_statistics(db, selected_year, None)
    fundraising = _compute_fundraising_summary(db, selected_year)
    operational = _compute_operational_summary(db, selected_year)

    total_donations = donation_stats.selected_year.total_hkd
    total_fundraising = fundraising.combined_total
    fees_collected = total_collected(
        db.query(MemberFee).filter(MemberFee.rotary_year == selected_year).all()
    )

    return FinanceSummary(
        rotary_year=selected_year,
        total_donations=total_donations,
        total_fundraising=total_fundraising,
        total_charity=total_donations + total_fundraising,
        fees_collected=fees_collected,
        total_revenue=operational.total_revenue,
        total_expenses=operational.total_cost,
        net_balance=operational.total_revenue - operational.total_cost,
    )
