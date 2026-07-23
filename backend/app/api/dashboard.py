from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.finance import _compute_fundraising_summary
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Donation, Member, Organisation, RotaryFriend, ServiceHour
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
    # Story 16.26: replaces the old "Fees Collected" card — event
    # fundraising income (auction/lucky draw) + ad hoc donations, shared
    # with the Finance module's own Fund Raising Results page (Story 17.3)
    # so the two figures can't drift.
    total_funds_raised_this_year = _compute_fundraising_summary(
        db, this_rotary_year
    ).combined_total
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
        total_funds_raised_this_year=float(total_funds_raised_this_year),
        service_hours_this_year=float(service_hours_this_year),
    )
