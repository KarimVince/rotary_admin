from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import MemberTitle
from app.schemas.member_title import MemberTitleCreate, MemberTitleRead

router = APIRouter()


@router.get("/member-titles", response_model=list[MemberTitleRead])
def list_member_titles(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    return db.query(MemberTitle).order_by(MemberTitle.sort_order).all()


@router.post("/member-titles", response_model=MemberTitleRead, status_code=201)
def create_member_title(
    payload: MemberTitleCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    title = MemberTitle(**payload.model_dump())
    db.add(title)
    db.commit()
    db.refresh(title)
    return title
