import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.rotary_year import rotary_year as compute_rotary_year
from app.db.session import get_db
from app.models import FeeSettings, MemberFee
from app.schemas.member_fee import (
    MemberFeeRead,
    MemberFeeStatistics,
    MemberFeeUpdate,
    PriceTypeBreakdown,
)

router = APIRouter()

FEES_TRACKING = "fees.tracking"
FEES_STATISTICS = "fees.statistics"


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
    )


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
