from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.member_fee_totals import total_collected
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Donation, Member, MemberFee, Organisation, RotaryFriend, ServiceHour
from app.schemas.dashboard import DashboardSummary

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    this_rotary_year = rotary_year(date.today())
    donations_this_year = (
        db.query(func.coalesce(func.sum(Donation.amount), 0))
        .filter(Donation.rotary_year == this_rotary_year)
        .scalar()
    )
    # Story 15.10: was summing amount_due for is_paid fees, which diverged
    # from the Fees module's total whenever amount_paid differs from
    # amount_due (prorated fees, Story 8.29's zero-amount fee-exempt
    # members). Now shares the same helper as GET /member-fees/statistics'
    # total_collected (app/core/member_fee_totals.py) so the two can't drift.
    fees_this_year = db.query(MemberFee).filter(MemberFee.rotary_year == this_rotary_year).all()
    fees_collected_this_year = total_collected(fees_this_year)
    service_hours_this_year = (
        db.query(func.coalesce(func.sum(ServiceHour.hours), 0))
        .filter(ServiceHour.rotary_year == this_rotary_year)
        .scalar()
    )
    return DashboardSummary(
        active_members=db.query(Member).filter(Member.status == "active").count(),
        honorary_members=db.query(Member)
        .filter(Member.status == "active", Member.is_honorary.is_(True))
        .count(),
        organisations_supported=db.query(Organisation).count(),
        rotary_friends=db.query(RotaryFriend).count(),
        donations_this_year=float(donations_this_year),
        fees_collected_this_year=float(fees_collected_this_year),
        service_hours_this_year=float(service_hours_this_year),
    )
