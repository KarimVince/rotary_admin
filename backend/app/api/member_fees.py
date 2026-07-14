import uuid
from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.rotary_year import rotary_year as compute_rotary_year
from app.core.rotary_year import rotary_year_bounds
from app.db.session import get_db
from app.models import FeeSettings, Member, MemberFee
from app.schemas.member_fee import (
    FeeYearHistory,
    MemberFeeRead,
    MemberFeeStatistics,
    MemberFeeUpdate,
    PriceTypeBreakdown,
)

router = APIRouter()

FEES_TRACKING = "fees.tracking"
FEES_STATISTICS = "fees.statistics"


def _active_non_honorary_member_ids(db: Session, year: int) -> set[uuid.UUID]:
    """Story 8.29/8.31: members active at any point during rotary year `year`,
    excluding honorary members — the shared scoping rule for fee runs,
    tracking and statistics alike."""
    year_start, year_end = rotary_year_bounds(year)
    rows = (
        db.query(Member.id)
        .filter(
            Member.is_honorary.is_(False),
            Member.join_date <= year_end,
            or_(Member.leave_date.is_(None), Member.leave_date >= year_start),
        )
        .all()
    )
    return {row[0] for row in rows}


@router.get("/member-fees", response_model=list[MemberFeeRead])
def list_member_fees(
    rotary_year: int | None = Query(None),
    is_paid: bool | None = Query(None),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_TRACKING, "read")),
):
    query = db.query(MemberFee)
    if rotary_year is not None:
        query = query.filter(MemberFee.rotary_year == rotary_year)
    if is_paid is not None:
        query = query.filter(MemberFee.is_paid == is_paid)
    return query.order_by(MemberFee.rotary_year.desc(), MemberFee.created_at).all()


@router.get("/member-fees/statistics", response_model=MemberFeeStatistics)
def member_fee_statistics(
    rotary_year: int | None = Query(None),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_STATISTICS, "read")),
):
    year = rotary_year if rotary_year is not None else compute_rotary_year(date.today())

    fees = db.query(MemberFee).filter(MemberFee.rotary_year == year).all()
    fee_settings = db.query(FeeSettings).filter(FeeSettings.rotary_year == year).first()

    paid_count = sum(1 for fee in fees if fee.is_paid)
    unpaid_count = len(fees) - paid_count
    # Collected totals reflect the actual amount received (amount_paid) when
    # it was amended at payment validation — falling back to the standard
    # invoiced amount_due otherwise. amount_due itself is never overwritten.
    total_collected = sum(
        float(fee.amount_paid if fee.amount_paid is not None else fee.amount_due)
        for fee in fees
        if fee.is_paid
    )
    total_outstanding = sum(float(fee.amount_due) for fee in fees if not fee.is_paid)
    denominator = total_collected + total_outstanding
    collection_rate = (total_collected / denominator * 100) if denominator > 0 else 0.0

    breakdown: dict[str, list] = defaultdict(lambda: [0, 0.0])
    for fee in fees:
        breakdown[fee.price_type][0] += 1
        breakdown[fee.price_type][1] += float(fee.amount_due)

    # Story 8.31: average fee card — active non-honorary member count uses
    # the same date-scoping rule as Story 8.29's fee run/tracking scoping,
    # not the count of MemberFee rows (a member with no fee run generated
    # for this year yet still counts in the denominator).
    active_member_count = len(_active_non_honorary_member_ids(db, year))
    average_fee_per_active_member = (
        total_collected / active_member_count if active_member_count > 0 else 0.0
    )

    return MemberFeeStatistics(
        rotary_year=year,
        currency=fee_settings.currency if fee_settings else None,
        total_members=len(fees),
        paid_count=paid_count,
        unpaid_count=unpaid_count,
        total_collected=total_collected,
        total_outstanding=total_outstanding,
        collection_rate=collection_rate,
        breakdown_by_price_type=[
            PriceTypeBreakdown(price_type=price_type, count=count, total_amount=total_amount)
            for price_type, (count, total_amount) in breakdown.items()
        ],
        active_member_count=active_member_count,
        average_fee_per_active_member=average_fee_per_active_member,
    )


@router.get("/member-fees/statistics/history", response_model=list[FeeYearHistory])
def member_fee_statistics_history(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_STATISTICS, "read")),
):
    """Story 8.31: full-history data for the Amount Collected and Paying
    Members graphs — always all available years, independent of whichever
    year the page's selector is on (that only drives the Average Fee card)."""
    current_year = compute_rotary_year(date.today())
    earliest_year = db.query(func.min(MemberFee.rotary_year)).scalar()
    start_year = earliest_year if earliest_year is not None else current_year

    fees_by_year: dict[int, list[MemberFee]] = defaultdict(list)
    for fee in (
        db.query(MemberFee)
        .filter(MemberFee.rotary_year >= start_year, MemberFee.rotary_year <= current_year)
        .all()
    ):
        fees_by_year[fee.rotary_year].append(fee)

    history: list[FeeYearHistory] = []
    for year in range(start_year, current_year + 1):
        active_ids = _active_non_honorary_member_ids(db, year)
        fees = [fee for fee in fees_by_year.get(year, []) if fee.member_id in active_ids]

        total_collected = sum(float(fee.amount_paid or 0) for fee in fees)
        paid_count = sum(1 for fee in fees if (fee.amount_paid or 0) > 0)
        zero_count = len(active_ids) - paid_count

        history.append(
            FeeYearHistory(
                rotary_year=year,
                total_collected=total_collected,
                paid_count=paid_count,
                zero_count=zero_count,
            )
        )

    return history


@router.patch("/member-fees/{member_fee_id}", response_model=MemberFeeRead)
def update_member_fee(
    member_fee_id: uuid.UUID,
    payload: MemberFeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_access(FEES_TRACKING, "write")),
):
    member_fee = db.get(MemberFee, member_fee_id)
    if member_fee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member fee record not found"
        )

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("is_paid") is True and "paid_date" not in update_data:
        update_data["paid_date"] = date.today()
    if update_data.get("is_paid") is False:
        if "paid_date" not in update_data:
            update_data["paid_date"] = None
        if "amount_paid" not in update_data:
            update_data["amount_paid"] = None

    # Story 8.29: "Invoice Sent" is a plain checkbox in the sub-screen, but
    # there's no raw boolean column for it — it maps onto invoice_sent_at
    # (set/cleared here) so invoice_send_count stays solely the automated
    # send flow's own audit trail, untouched by manual edits.
    if "invoice_sent" in update_data:
        invoice_sent = update_data.pop("invoice_sent")
        if invoice_sent:
            if member_fee.invoice_sent_at is None:
                update_data["invoice_sent_at"] = datetime.now(timezone.utc)
        else:
            update_data["invoice_sent_at"] = None

    for field, value in update_data.items():
        setattr(member_fee, field, value)

    # Audit trail: record who last touched paid status or the collected
    # amount (updated_at gives "when"; amount_due is preserved untouched
    # above as the "from" reference for whatever amount_paid is amended to).
    if "is_paid" in update_data or "amount_paid" in update_data:
        member_fee.paid_by = current_user.id

    db.commit()
    db.refresh(member_fee)
    return member_fee
