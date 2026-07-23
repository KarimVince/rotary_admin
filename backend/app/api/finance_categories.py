import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import FinanceCategory
from app.schemas.finance_category import (
    FinanceCategoryCreate,
    FinanceCategoryRead,
    FinanceCategoryUpdate,
)

ADMIN_FINANCE_CATEGORIES = "admin.finance_categories"

router = APIRouter()


@router.get("/finance-categories", response_model=list[FinanceCategoryRead])
def list_finance_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_FINANCE_CATEGORIES, "read")),
):
    query = db.query(FinanceCategory)
    if not include_inactive:
        query = query.filter(FinanceCategory.is_active.is_(True))
    return query.order_by(FinanceCategory.type, FinanceCategory.sort_order).all()


@router.post("/finance-categories", response_model=FinanceCategoryRead, status_code=201)
def create_finance_category(
    payload: FinanceCategoryCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_FINANCE_CATEGORIES, "write")),
):
    existing = db.query(FinanceCategory).filter(FinanceCategory.name == payload.name).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Finance category name already exists"
        )

    category = FinanceCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch("/finance-categories/{category_id}", response_model=FinanceCategoryRead)
def update_finance_category(
    category_id: uuid.UUID,
    payload: FinanceCategoryUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_FINANCE_CATEGORIES, "write")),
):
    category = db.get(FinanceCategory, category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Finance category not found"
        )

    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("name") is not None:
        existing = (
            db.query(FinanceCategory)
            .filter(FinanceCategory.name == update_data["name"], FinanceCategory.id != category_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Finance category name already exists"
            )

    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)
    return category


@router.delete("/finance-categories/{category_id}", response_model=FinanceCategoryRead)
def delete_finance_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_FINANCE_CATEGORIES, "write")),
):
    """Soft delete: deactivates the category rather than removing the row,
    since operational entries may still reference it via category_id."""
    category = db.get(FinanceCategory, category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Finance category not found"
        )

    category.is_active = False
    db.commit()
    db.refresh(category)
    return category
