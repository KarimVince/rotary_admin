import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Member, Organisation, ServiceHour, User
from app.schemas.service_hour import ServiceHourCreate, ServiceHourRead, ServiceHourUpdate

router = APIRouter()

# Story 16.14: shares the Donations tab's permission tier rather than
# introducing a new app_function/menu entry — service hours are just
# another facet of the same NGO/Organisation record, not a separate module.
NGOS_ORGANISATIONS = "ngos.organisations"


def _get_organisation_or_404(db: Session, organisation_id: uuid.UUID) -> Organisation:
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return organisation


def _get_service_hour_or_404(db: Session, service_hour_id: uuid.UUID) -> ServiceHour:
    service_hour = db.get(ServiceHour, service_hour_id)
    if service_hour is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service hour entry not found")
    return service_hour


def _member_name(member: Member | None) -> str:
    if member is None:
        return "Unknown member"
    return f"{member.first_name} {member.last_name}"


def _to_read(service_hour: ServiceHour, member: Member | None) -> ServiceHourRead:
    # Planned entries with no member yet show "—" rather than "Unknown member".
    if service_hour.planned and service_hour.member_id is None:
        name: str | None = None
    else:
        name = _member_name(member)
    return ServiceHourRead(
        id=service_hour.id,
        organisation_id=service_hour.organisation_id,
        member_id=service_hour.member_id,
        member_name=name,
        rotary_year=service_hour.rotary_year,
        hours=float(service_hour.hours),
        service_date=service_hour.service_date,
        planned=service_hour.planned,
        notes=service_hour.notes,
        created_by=service_hour.created_by,
        created_at=service_hour.created_at,
        updated_at=service_hour.updated_at,
    )


@router.get(
    "/organisations/{organisation_id}/service-hours", response_model=list[ServiceHourRead]
)
def list_organisation_service_hours(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    _get_organisation_or_404(db, organisation_id)
    rows = (
        db.query(ServiceHour, Member)
        .outerjoin(Member, Member.id == ServiceHour.member_id)
        .filter(ServiceHour.organisation_id == organisation_id)
        .order_by(ServiceHour.rotary_year.desc(), ServiceHour.service_date.desc())
        .all()
    )
    return [_to_read(service_hour, member) for service_hour, member in rows]


@router.post(
    "/organisations/{organisation_id}/service-hours",
    response_model=ServiceHourRead,
    status_code=201,
)
def create_service_hour(
    organisation_id: uuid.UUID,
    payload: ServiceHourCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    _get_organisation_or_404(db, organisation_id)

    # Actual entries require a member and a date.
    if not payload.planned:
        if payload.member_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="member_id is required for actual (non-planned) service hours",
            )
        if payload.service_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="service_date is required for actual (non-planned) service hours",
            )

    if payload.member_id is not None:
        member = db.get(Member, payload.member_id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    else:
        member = None

    data = payload.model_dump()
    # Rotary year: use the explicit value if provided; for actual entries,
    # derive it from service_date; for planned entries without an explicit
    # year, the caller must supply rotary_year.
    if data.get("rotary_year") is None:
        if data.get("service_date") is not None:
            data["rotary_year"] = rotary_year(data["service_date"])
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="rotary_year is required when service_date is not provided",
            )

    service_hour = ServiceHour(
        organisation_id=organisation_id, created_by=current_user.id, **data
    )
    db.add(service_hour)
    db.commit()
    db.refresh(service_hour)
    return _to_read(service_hour, member)


@router.get("/service-hours", response_model=list[ServiceHourRead])
def list_service_hours(
    rotary_year: int | None = Query(
        None, description="Filter to a single rotary year (across all organisations)"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    query = db.query(ServiceHour, Member).outerjoin(Member, Member.id == ServiceHour.member_id)
    if rotary_year is not None:
        query = query.filter(ServiceHour.rotary_year == rotary_year)
    rows = query.order_by(ServiceHour.rotary_year.desc(), ServiceHour.service_date.desc()).all()
    return [_to_read(service_hour, member) for service_hour, member in rows]


@router.patch("/service-hours/{service_hour_id}", response_model=ServiceHourRead)
def update_service_hour(
    service_hour_id: uuid.UUID,
    payload: ServiceHourUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    service_hour = _get_service_hour_or_404(db, service_hour_id)

    data = payload.model_dump(exclude_unset=True)
    if "member_id" in data and data["member_id"] is not None:
        member = db.get(Member, data["member_id"])
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if "service_date" in data and data["service_date"] is not None and "rotary_year" not in data:
        data["rotary_year"] = rotary_year(data["service_date"])

    for field, value in data.items():
        setattr(service_hour, field, value)

    db.commit()
    db.refresh(service_hour)
    member = db.get(Member, service_hour.member_id) if service_hour.member_id else None
    return _to_read(service_hour, member)


@router.delete("/service-hours/{service_hour_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_hour(
    service_hour_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    service_hour = _get_service_hour_or_404(db, service_hour_id)
    db.delete(service_hour)
    db.commit()
