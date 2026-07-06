import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.models import RotaryFriend, User
from app.schemas.rotary_friend import RotaryFriendCreate
from app.schemas.rotary_friend_import import (
    CsvImportPreviewResult,
    CsvImportRowPreview,
    RotaryFriendImportCommitRequest,
    RotaryFriendImportCommitResult,
)

router = APIRouter()

CSV_EXPORT_COLUMNS = ["first_name", "last_name", "email", "whatsapp", "tags", "source", "notes"]


def _normalize(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _split_name(name: str | None) -> tuple[str | None, str | None]:
    if not name:
        return None, None
    parts = name.strip().rsplit(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


@router.post("/rotary-friends/import/preview", response_model=CsvImportPreviewResult)
async def preview_rotary_friends_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV file must be UTF-8 encoded",
        ) from exc

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CSV file is empty"
        )
    headers = {name.strip().lower(): name for name in reader.fieldnames}

    existing_emails = {
        email.lower()
        for (email,) in db.query(RotaryFriend.email).filter(RotaryFriend.email.isnot(None)).all()
    }
    seen_emails: set[str] = set()

    rows: list[CsvImportRowPreview] = []
    for row_number, raw_row in enumerate(reader, start=2):
        first_name, last_name = _split_name(_normalize(raw_row.get(headers.get("name", ""))))
        email = _normalize(raw_row.get(headers.get("email", "")))
        whatsapp = _normalize(raw_row.get(headers.get("whatsapp", "")))
        tags = _normalize(raw_row.get(headers.get("tags", "")))
        source = _normalize(raw_row.get(headers.get("source", "")))
        notes = _normalize(raw_row.get(headers.get("notes", "")))

        errors: list[str] = []
        try:
            RotaryFriendCreate(
                first_name=first_name,
                last_name=last_name,
                email=email,
                whatsapp=whatsapp,
                tags=tags,
                source=source,
                notes=notes,
            )
        except ValidationError as exc:
            errors = [error["msg"] for error in exc.errors()]

        email_lower = email.lower() if email else None
        is_duplicate = bool(
            email_lower and (email_lower in existing_emails or email_lower in seen_emails)
        )
        if email_lower:
            seen_emails.add(email_lower)

        rows.append(
            CsvImportRowPreview(
                row_number=row_number,
                first_name=first_name,
                last_name=last_name,
                email=email,
                whatsapp=whatsapp,
                tags=tags,
                source=source,
                notes=notes,
                errors=errors,
                is_duplicate=is_duplicate,
            )
        )

    return CsvImportPreviewResult(
        rows=rows,
        valid_count=sum(1 for row in rows if not row.errors and not row.is_duplicate),
        error_count=sum(1 for row in rows if row.errors),
        duplicate_count=sum(1 for row in rows if row.is_duplicate),
    )


@router.post("/rotary-friends/import", response_model=RotaryFriendImportCommitResult)
def commit_rotary_friends_import(
    payload: RotaryFriendImportCommitRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    existing_emails = {
        email.lower()
        for (email,) in db.query(RotaryFriend.email).filter(RotaryFriend.email.isnot(None)).all()
    }

    created_count = 0
    skipped_emails: list[str] = []
    seen_emails: set[str] = set()

    for friend_payload in payload.friends:
        email_lower = friend_payload.email.lower() if friend_payload.email else None
        if email_lower and (email_lower in existing_emails or email_lower in seen_emails):
            skipped_emails.append(friend_payload.email)
            continue

        friend = RotaryFriend(**friend_payload.model_dump())
        db.add(friend)
        created_count += 1
        if email_lower:
            seen_emails.add(email_lower)

    db.commit()

    return RotaryFriendImportCommitResult(
        created_count=created_count,
        skipped_count=len(skipped_emails),
        skipped_emails=skipped_emails,
    )


@router.get("/rotary-friends/export")
def export_rotary_friends(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    friends = db.query(RotaryFriend).order_by(RotaryFriend.last_name, RotaryFriend.first_name).all()

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_EXPORT_COLUMNS)
    writer.writeheader()
    for friend in friends:
        writer.writerow({column: getattr(friend, column) or "" for column in CSV_EXPORT_COLUMNS})

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="rotary_friends.csv"'},
    )
