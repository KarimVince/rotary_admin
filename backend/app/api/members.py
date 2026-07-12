import uuid
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.api.deps import require_access, require_admin
from app.core.config import settings
from app.core.rotary_year import rotary_year
from app.core.statistics_report import build_pdf_report, build_pptx_report
from app.db.session import get_db
from app.models import Member, User
from app.schemas.member import MemberCreate, MemberRead, MemberReadLimited, MemberUpdate
from app.schemas.member_statistics import JoinsLeavesByYear, LabelValue, MembersStatistics

router = APIRouter()

MEMBERS_DIRECTORY = "members.directory"
MEMBERS_STATISTICS = "members.statistics"

AGE_BUCKETS = ["<30", "30-39", "40-49", "50-59", "60-69", "70+"]
TENURE_BUCKETS = ["0-5", "5-10", "10-20", "20+"]

PHOTO_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_PHOTO_BYTES = 5 * 1024 * 1024


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


def _tenure_bucket(years: float) -> str:
    if years < 5:
        return "0-5"
    if years < 10:
        return "5-10"
    if years < 20:
        return "10-20"
    return "20+"


def _serialize(member: Member, current_user: User) -> dict:
    schema = MemberRead if current_user.role == "admin" else MemberReadLimited
    return schema.model_validate(member).model_dump(mode="json")


@router.post("/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "write")),
):
    if payload.email is not None:
        existing = db.query(Member).filter(Member.email == payload.email).first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered to another member",
            )

    if payload.rotarian_id is not None:
        existing = db.query(Member).filter(Member.rotarian_id == payload.rotarian_id).first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Rotarian ID already registered to another member",
            )

    member = Member(**payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.post("/members/photo", status_code=status.HTTP_201_CREATED)
async def upload_member_photo(
    file: UploadFile = File(...),
    _current_user: User = Depends(require_admin),
):
    extension = PHOTO_CONTENT_TYPE_EXTENSIONS.get(file.content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Photo must be a JPEG, PNG, WEBP, or GIF image",
        )

    contents = await file.read()
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Photo must be smaller than 5MB",
        )

    filename = f"{uuid.uuid4().hex}{extension}"
    upload_dir = Path(settings.upload_dir) / "members"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / filename).write_bytes(contents)

    return {"photo_url": f"/static/members/{filename}"}


def compute_members_statistics(db: Session) -> MembersStatistics:
    """Shared by the JSON statistics endpoint and the report export (2b.14)."""
    members = db.query(Member).all()
    today = date.today()
    current_rotary_year = rotary_year(today)

    # Story 8.14: honorary is now Member.is_honorary, not a separate status —
    # honorary members are simply status == "active" with the flag set, so
    # they fall out of every "active" filter below for free.
    #
    # Headline stat cards (Story 2b.11) are scoped to Active (incl. honorary)
    # members only — Past members are excluded from every one of these, not
    # just hidden from their own card.
    active_members = [m for m in members if m.status == "active"]
    total_members = len(active_members)
    honorary_members = sum(1 for m in active_members if m.is_honorary)
    new_members_this_rotary_year = sum(
        1
        for member in active_members
        if member.join_date and rotary_year(member.join_date) == current_rotary_year
    )
    countries_represented = len(
        {member.nationality for member in active_members if member.nationality}
    )
    women_count = sum(1 for member in active_members if member.gender == "Female")
    men_count = sum(1 for member in active_members if member.gender == "Male")

    ah_ages = [
        (today - member.date_of_birth).days // 365
        for member in active_members
        if member.date_of_birth
    ]
    average_age = round(sum(ah_ages) / len(ah_ages), 1) if ah_ages else None

    ah_tenures_as_rotarian = [member.years_as_rotarian for member in active_members]
    average_tenure_as_rotarian = (
        round(sum(ah_tenures_as_rotarian) / len(ah_tenures_as_rotarian), 1)
        if ah_tenures_as_rotarian
        else None
    )

    status_counts: Counter = Counter(member.status for member in members)
    join_year_counts: Counter = Counter(
        member.join_date.year for member in members if member.join_date
    )
    # Story 8.15: nationality/gender/age/tenure graphs are scoped to Active
    # (incl. honorary) members only — Past members excluded. by_status and
    # by_join_year (and growth, which needs Past members' leave events to be
    # meaningful) are intentionally left unscoped.
    nationality_counts: Counter = Counter(
        member.nationality or "Unknown" for member in active_members
    )
    gender_counts: Counter = Counter(member.gender or "Unknown" for member in active_members)

    growth: dict[int, dict[str, int]] = {}
    age_bucket_counts: Counter = Counter()
    tenure_bucket_counts: Counter = Counter()

    for member in members:
        if member.join_date:
            join_ry = rotary_year(member.join_date)
            growth.setdefault(join_ry, {"joins": 0, "leaves": 0})
            growth[join_ry]["joins"] += 1

        if member.leave_date:
            leave_ry = rotary_year(member.leave_date)
            growth.setdefault(leave_ry, {"joins": 0, "leaves": 0})
            growth[leave_ry]["leaves"] += 1

    for member in active_members:
        if member.join_date:
            tenure_bucket_counts[_tenure_bucket(member.years_as_rotarian)] += 1

        if member.date_of_birth:
            age = (today - member.date_of_birth).days // 365
            age_bucket_counts[_age_bucket(age)] += 1

    return MembersStatistics(
        by_status=[
            LabelValue(label=label, value=value) for label, value in sorted(status_counts.items())
        ],
        by_join_year=[
            LabelValue(label=str(year), value=value)
            for year, value in sorted(join_year_counts.items())
        ],
        growth_by_rotary_year=[
            JoinsLeavesByYear(label=str(year), joins=data["joins"], leaves=data["leaves"])
            for year, data in sorted(growth.items())
        ],
        by_nationality=[
            LabelValue(label=label, value=value)
            for label, value in sorted(nationality_counts.items())
        ],
        age_distribution=[
            LabelValue(label=bucket, value=age_bucket_counts.get(bucket, 0))
            for bucket in AGE_BUCKETS
        ],
        tenure_distribution=[
            LabelValue(label=bucket, value=tenure_bucket_counts.get(bucket, 0))
            for bucket in TENURE_BUCKETS
        ],
        by_gender=[
            LabelValue(label=label, value=value) for label, value in sorted(gender_counts.items())
        ],
        total_members=total_members,
        honorary_members=honorary_members,
        new_members_this_rotary_year=new_members_this_rotary_year,
        countries_represented=countries_represented,
        women_count=women_count,
        men_count=men_count,
        average_age=average_age,
        average_tenure_as_rotarian=average_tenure_as_rotarian,
    )


@router.get("/members/statistics", response_model=MembersStatistics)
def members_statistics(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MEMBERS_STATISTICS, "read")),
):
    return compute_members_statistics(db)


@router.post("/members/statistics/report")
def generate_statistics_report(
    report_format: Literal["pdf", "pptx"] = Query(..., alias="format"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MEMBERS_STATISTICS, "read")),
):
    stats = compute_members_statistics(db)
    today_str = date.today().isoformat()

    if report_format == "pdf":
        content = build_pdf_report(stats)
        media_type = "application/pdf"
        filename = f"members-statistics-report-{today_str}.pdf"
    else:
        content = build_pptx_report(stats)
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        filename = f"members-statistics-report-{today_str}.pptx"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/members")
def list_members(
    status_filter: str | None = Query(None, alias="status"),
    is_honorary: bool | None = Query(None, description="Story 8.14: honorary is now a flag"),
    title_id: uuid.UUID | None = Query(None),
    join_year: int | None = Query(None),
    nationality: str | None = Query(None),
    classification: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "read")),
):
    query = db.query(Member)
    if status_filter is not None:
        query = query.filter(Member.status == status_filter)
    if is_honorary is not None:
        query = query.filter(Member.is_honorary == is_honorary)
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
    current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "read")),
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
    current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "write")),
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

    if update_data.get("rotarian_id") is not None:
        existing = (
            db.query(Member)
            .filter(Member.rotarian_id == update_data["rotarian_id"], Member.id != member_id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Rotarian ID already registered to another member",
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
