from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import FeeSettings
from app.schemas.fee_settings import FeeSettingsCreate, FeeSettingsRead, FeeSettingsUpdate

router = APIRouter()

FEES_KEY = "fees.settings"


@router.get("/fee-settings", response_model=list[FeeSettingsRead])
def list_fee_settings(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_KEY, "read")),
):
    return db.query(FeeSettings).order_by(FeeSettings.rotary_year.desc()).all()


@router.post("/fee-settings", response_model=FeeSettingsRead, status_code=201)
def create_fee_settings(
    payload: FeeSettingsCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_access(FEES_KEY, "write")),
):
    existing = (
        db.query(FeeSettings).filter(FeeSettings.rotary_year == payload.rotary_year).first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Fee settings for rotary year {payload.rotary_year} already exist",
        )

    fee_settings = FeeSettings(**payload.model_dump(), created_by=current_user.id)
    db.add(fee_settings)
    db.commit()
    db.refresh(fee_settings)
    return fee_settings


@router.get("/fee-settings/{rotary_year}", response_model=FeeSettingsRead)
def get_fee_settings(
    rotary_year: int,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_KEY, "read")),
):
    fee_settings = db.query(FeeSettings).filter(FeeSettings.rotary_year == rotary_year).first()
    if fee_settings is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No fee settings found for rotary year {rotary_year}",
        )
    return fee_settings


@router.patch("/fee-settings/{rotary_year}", response_model=FeeSettingsRead)
def update_fee_settings(
    rotary_year: int,
    payload: FeeSettingsUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_KEY, "write")),
):
    fee_settings = db.query(FeeSettings).filter(FeeSettings.rotary_year == rotary_year).first()
    if fee_settings is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No fee settings found for rotary year {rotary_year}",
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(fee_settings, field, value)

    db.commit()
    db.refresh(fee_settings)
    return fee_settings
