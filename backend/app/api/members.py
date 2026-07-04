import uuid
from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import Member, User
from app.schemas.member import MemberCreate, MemberRead, MemberReadLimited, MemberUpdate
from app.schemas.member_statistics import JoinsLeavesByYear, LabelValue, MembersStatistics

router = APIRouter()

AGE_BUCKETS = ["<30", "30-39", "40-49", "50-59", "60-69", "70+"]


def _age_bucket(age: int) -> str:
    if age < 30:
        return "<30"
    if age < 40:
        return "30-39"
    if age < 50:
        return "40-49"
    if age < 60:
        return "50-59"
    if age < 70:
        return "60-69"
    return "70+"


def _serialize(member: Member, current_user: User) -> dict:
    schema = MemberRead if current_user.role == "admin" else MemberReadLimited
    return schema.model_validate(member).model_dump(mode="json")


@router.post("/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    if payload.email is not None:
        existing = db.query(Member).filter(Member.email == payload.email).first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered to another member",
            )

    member = Member(**payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.get("/members/statistics", response_model=MembersStatistics)
def members_statistics(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    members = db.query(Member).all()
    today = date.today()

    status_counts: Counter = Counter(member.status for member in members)
    join_year_counts: Counter = Counter(
        member.join_date.year for member in members if member.join_date
    )
    nationality_counts: Counter = Counter(
        member.nationality or "Unknown" for member in members
    )
    classification_counts: Counter = Counter(
        member.classification or "Unknown" for member in members
    )

    tenures: list[float] = []
    growth: dict[int, dict[str, int]] = {}
    ages: list[int] = []
    age_bucket_counts: Counter = Counter()

    for member in members:
        if member.join_date:
            end = member.leave_date or today
            tenures.append((end - member.join_date).days / 365.25)

            join_ry = rotary_year(member.join_date)
            growth.setdefault(join_ry, {"joins": 0, "leaves": 0})
            growth[join_ry]["joins"] += 1

        if member.leave_date:
            leave_ry = rotary_year(member.leave_date)
            growth.setdefault(leave_ry, {"joins": 0, "leaves": 0})
            growth[leave_ry]["leaves"] += 1

        if member.date_of_birth:
            age = (today - member.date_of_birth).days // 365
            ages.append(age)
            age_bucket_counts[_age_bucket(age)] += 1

    return MembersStatistics(
        by_status=[
            LabelValue(label=label, value=value) for label, value in sorted(status_counts.items())
        ],
        by_join_year=[
            LabelValue(label=str(year), value=value)
            for year, value in sorted(join_year_counts.items())
        ],
        average_tenure_years=round(sum(tenures) / len(tenures), 1) if tenures else None,
        growth_by_rotary_year=[
            JoinsLeavesByYear(label=str(year), joins=data["joins"], leaves=data["leaves"])
            for year, data in sorted(growth.items())
        ],
        by_nationality=[
            LabelValue(label=label, value=value)
            for label, value in sorted(nationality_counts.items())
        ],
        by_classification=[
            LabelValue(label=label, value=value)
            for label, value in sorted(classification_counts.items())
        ],
        age_distribution=[
            LabelValue(label=bucket, value=age_bucket_counts.get(bucket, 0))
            for bucket in AGE_BUCKETS
        ],
        average_age=round(sum(ages) / len(ages), 1) if ages else None,
    )


@router.get("/members")
def list_members(
    status_filter: str | None = Query(None, alias="status"),
    title_id: uuid.UUID | None = Query(None),
    join_year: int | None = Query(None),
    nationality: str | None = Query(None),
    classification: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Member)
    if status_filter is not None:
        query = query.filter(Member.status == status_filter)
    if title_id is not None:
        query = query.filter(Member.title_id == title_id)
    if join_year is not None:
        query = query.filter(extract("year", Member.join_date) == join_year)
    if nationality is not None:
        query = query.filter(Member.nationality == nationality)
    if classification is not None:
        query = query.filter(Member.classification == classification)

    members = query.order_by(Member.last_name, Member.first_name).all()
    return [_serialize(member, current_user) for member in members]


@router.get("/members/{member_id}")
def get_member(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return _serialize(member, current_user)


@router.patch("/members/{member_id}", response_model=MemberRead)
def update_member(
    member_id: uuid.UUID,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("email") is not None:
        existing = (
            db.query(Member)
            .filter(Member.email == update_data["email"], Member.id != member_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered to another member",
            )

    for field, value in update_data.items():
        setattr(member, field, value)

    if (
        member.leave_date is not None
        and member.join_date is not None
        and member.leave_date < member.join_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="leave_date must be on or after join_date",
        )

    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}", response_model=MemberRead)
def delete_member(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    """Soft delete: marks the member 'past' rather than removing the row."""
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.status = "past"
    if member.leave_date is None:
        member.leave_date = date.today()

    db.commit()
    db.refresh(member)
    return member
