import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import Honorific
from app.schemas.honorific import HonorificCreate, HonorificRead, HonorificUpdate

ADMIN_HONORIFICS = "admin.honorifics"

router = APIRouter()


@router.get("/honorifics", response_model=list[HonorificRead])
def list_honorifics(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_HONORIFICS, "read")),
):
    query = db.query(Honorific)
    if not include_inactive:
        query = query.filter(Honorific.is_active.is_(True))
    return query.order_by(Honorific.sort_order).all()


@router.post("/honorifics", response_model=HonorificRead, status_code=201)
def create_honorific(
    payload: HonorificCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_HONORIFICS, "write")),
):
    existing = db.query(Honorific).filter(Honorific.code == payload.code).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Honorific code already exists"
        )

    honorific = Honorific(**payload.model_dump())
    db.add(honorific)
    db.commit()
    db.refresh(honorific)
    return honorific


@router.patch("/honorifics/{honorific_id}", response_model=HonorificRead)
def update_honorific(
    honorific_id: uuid.UUID,
    payload: HonorificUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_HONORIFICS, "write")),
):
    honorific = db.get(Honorific, honorific_id)
    if honorific is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Honorific not found")

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("code") is not None:
        existing = (
            db.query(Honorific)
            .filter(Honorific.code == update_data["code"], Honorific.id != honorific_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Honorific code already exists"
            )

    for field, value in update_data.items():
        setattr(honorific, field, value)

    db.commit()
    db.refresh(honorific)
    return honorific


@router.delete("/honorifics/{honorific_id}", response_model=HonorificRead)
def delete_honorific(
    honorific_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_HONORIFICS, "write")),
):
    """Soft delete: deactivates the honorific rather than removing the row,
    since members may still reference it via honorific_id."""
    honorific = db.get(Honorific, honorific_id)
    if honorific is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Honorific not found")

    honorific.is_active = False
    db.commit()
    db.refresh(honorific)
    return honorific
