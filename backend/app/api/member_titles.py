import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import MemberTitle
from app.schemas.member_title import MemberTitleCreate, MemberTitleRead, MemberTitleUpdate

router = APIRouter()


@router.get("/member-titles", response_model=list[MemberTitleRead])
def list_member_titles(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    query = db.query(MemberTitle)
    if not include_inactive:
        query = query.filter(MemberTitle.is_active.is_(True))
    return query.order_by(MemberTitle.sort_order).all()


@router.post("/member-titles", response_model=MemberTitleRead, status_code=201)
def create_member_title(
    payload: MemberTitleCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    existing = db.query(MemberTitle).filter(MemberTitle.code == payload.code).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Title code already exists"
        )

    title = MemberTitle(**payload.model_dump())
    db.add(title)
    db.commit()
    db.refresh(title)
    return title


@router.patch("/member-titles/{title_id}", response_model=MemberTitleRead)
def update_member_title(
    title_id: uuid.UUID,
    payload: MemberTitleUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    title = db.get(MemberTitle, title_id)
    if title is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Title not found")

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("code") is not None:
        existing = (
            db.query(MemberTitle)
            .filter(MemberTitle.code == update_data["code"], MemberTitle.id != title_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Title code already exists"
            )

    for field, value in update_data.items():
        setattr(title, field, value)

    db.commit()
    db.refresh(title)
    return title


@router.delete("/member-titles/{title_id}", response_model=MemberTitleRead)
def delete_member_title(
    title_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    """Soft delete: deactivates the title rather than removing the row, since
    historical members may still reference it via title_id."""
    title = db.get(MemberTitle, title_id)
    if title is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Title not found")

    title.is_active = False
    db.commit()
    db.refresh(title)
    return title
