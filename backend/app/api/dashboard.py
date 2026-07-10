from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Donation, Member, MemberFee, Organisation, RotaryFriend
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
    fees_collected_this_year = (
        db.query(func.coalesce(func.sum(MemberFee.amount_due), 0))
        .filter(MemberFee.rotary_year == this_rotary_year, MemberFee.is_paid.is_(True))
        .scalar()
    )
    return DashboardSummary(
        active_members=db.query(Member).filter(Member.status == "active").count(),
        organisations_supported=db.query(Organisation).count(),
        rotary_friends=db.query(RotaryFriend).count(),
        donations_this_year=float(donations_this_year),
        fees_collected_this_year=float(fees_collected_this_year),
    )
