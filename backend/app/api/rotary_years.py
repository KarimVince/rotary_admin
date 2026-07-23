import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.rotary_year import rotary_year_bounds, rotary_year_label
from app.db.session import get_db
from app.models import RotaryYear
from app.schemas.rotary_year import RotaryYearCreate, RotaryYearRead, RotaryYearUpdate

ADMIN_ROTARY_YEARS = "admin.rotary_years"

router = APIRouter()


def _to_read(row: RotaryYear) -> RotaryYearRead:
    start_date, end_date = rotary_year_bounds(row.year)
    return RotaryYearRead(
        id=row.id,
        year=row.year,
        label=rotary_year_label(row.year),
        start_date=start_date,
        end_date=end_date,
        is_current=row.is_current,
        created_at=row.created_at,
    )


@router.get("/rotary-years", response_model=list[RotaryYearRead])
def list_rotary_years(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_ROTARY_YEARS, "read")),
):
    rows = db.query(RotaryYear).order_by(RotaryYear.year.desc()).all()
    return [_to_read(row) for row in rows]


@router.post("/rotary-years", response_model=RotaryYearRead, status_code=201)
def create_rotary_year(
    payload: RotaryYearCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_ROTARY_YEARS, "write")),
):
    existing = db.query(RotaryYear).filter(RotaryYear.year == payload.year).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Rotary year already exists"
        )

    if payload.is_current:
        db.query(RotaryYear).filter(RotaryYear.is_current.is_(True)).update(
            {"is_current": False}
        )

    row = RotaryYear(year=payload.year, is_current=payload.is_current)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


@router.patch("/rotary-years/{rotary_year_id}", response_model=RotaryYearRead)
def update_rotary_year(
    rotary_year_id: uuid.UUID,
    payload: RotaryYearUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_ROTARY_YEARS, "write")),
):
    row = db.get(RotaryYear, rotary_year_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rotary year not found")

    if payload.is_current is not None:
        if payload.is_current:
            db.query(RotaryYear).filter(
                RotaryYear.is_current.is_(True), RotaryYear.id != rotary_year_id
            ).update({"is_current": False})
            row.is_current = True
        else:
            row.is_current = False

    db.commit()
    db.refresh(row)
    return _to_read(row)


@router.delete("/rotary-years/{rotary_year_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rotary_year(
    rotary_year_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_ROTARY_YEARS, "write")),
):
    row = db.get(RotaryYear, rotary_year_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rotary year not found")
    if row.is_current:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete the current rotary year — set another year as current first",
        )

    db.delete(row)
    db.commit()
