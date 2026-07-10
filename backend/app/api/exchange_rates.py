import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import require_access

ADMIN_CURRENCIES = "admin.currencies"
from app.db.session import get_db
from app.models import ExchangeRate, User
from app.schemas.exchange_rate import ExchangeRateCreate, ExchangeRateRead, ExchangeRateUpdate

router = APIRouter()


@router.get("/exchange-rates", response_model=list[ExchangeRateRead])
def list_exchange_rates(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_CURRENCIES, "read")),
):
    return db.query(ExchangeRate).order_by(ExchangeRate.currency_code).all()


@router.post("/exchange-rates", response_model=ExchangeRateRead, status_code=201)
def create_exchange_rate(
    payload: ExchangeRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ADMIN_CURRENCIES, "write")),
):
    existing = (
        db.query(ExchangeRate)
        .filter(ExchangeRate.currency_code == payload.currency_code)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A rate already exists for this currency — update it instead",
        )

    rate = ExchangeRate(**payload.model_dump(), updated_by=current_user.id)
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.patch("/exchange-rates/{rate_id}", response_model=ExchangeRateRead)
def update_exchange_rate(
    rate_id: uuid.UUID,
    payload: ExchangeRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ADMIN_CURRENCIES, "write")),
):
    rate = db.get(ExchangeRate, rate_id)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rate not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rate, field, value)
    rate.updated_by = current_user.id

    db.commit()
    db.refresh(rate)
    return rate


@router.delete("/exchange-rates/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exchange_rate(
    rate_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ADMIN_CURRENCIES, "write")),
):
    rate = db.get(ExchangeRate, rate_id)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rate not found")

    db.delete(rate)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
