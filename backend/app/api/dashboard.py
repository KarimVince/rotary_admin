from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Member, Organisation, RotaryFriend
from app.schemas.dashboard import DashboardSummary

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    return DashboardSummary(
        active_members=db.query(Member).filter(Member.status == "active").count(),
        organisations_supported=db.query(Organisation).count(),
        rotary_friends=db.query(RotaryFriend).count(),
    )
