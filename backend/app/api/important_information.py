"""New story — Dashboard "Important Information" banner. A single active
admin-authored announcement shown on the Dashboard, managed from a new Admin
page with archive/reactivate/delete history. Only one message has
status="active" at a time (see the model's own docstring for the
enforcement strategy)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_access
from app.db.session import get_db
from app.models import ImportantInformationMessage, User
from app.schemas.important_information import ImportantInformationCreate, ImportantInformationRead

router = APIRouter()

KEY = "admin.important_information"


def _get_message_or_404(db: Session, message_id: uuid.UUID) -> ImportantInformationMessage:
    message = db.get(ImportantInformationMessage, message_id)
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return message


def _serialize(message: ImportantInformationMessage, db: Session) -> ImportantInformationRead:
    creator = db.get(User, message.created_by) if message.created_by else None
    return ImportantInformationRead(
        id=message.id,
        title=message.title,
        text=message.text,
        status=message.status,
        created_by=message.created_by,
        created_by_name=creator.full_name if creator else None,
        created_at=message.created_at,
        archived_at=message.archived_at,
    )


def _archive_current_active(db: Session, now: datetime) -> None:
    active = (
        db.query(ImportantInformationMessage)
        .filter(ImportantInformationMessage.status == "active")
        .first()
    )
    if active is not None:
        active.status = "archived"
        active.archived_at = now


@router.get("/important-information/active", response_model=ImportantInformationRead | None)
def get_active_important_information(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    # Deliberately gated on just "logged in", not the admin.important_information
    # matrix key — every user who can see the Dashboard should see the
    # banner; that key only gates who can *manage* messages (below).
    message = (
        db.query(ImportantInformationMessage)
        .filter(ImportantInformationMessage.status == "active")
        .first()
    )
    return _serialize(message, db) if message is not None else None


@router.get("/important-information", response_model=list[ImportantInformationRead])
def list_important_information(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "write")),
):
    messages = (
        db.query(ImportantInformationMessage)
        .order_by(ImportantInformationMessage.created_at.desc())
        .all()
    )
    return [_serialize(message, db) for message in messages]


@router.post(
    "/important-information",
    response_model=ImportantInformationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_important_information(
    payload: ImportantInformationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(KEY, "write")),
):
    now = datetime.now(timezone.utc)
    _archive_current_active(db, now)
    # Flush the archive UPDATE before inserting the new active row — the
    # partial unique index on status='active' is checked immediately (not
    # deferred), so without this a transient "two active rows" moment
    # within the same flush batch would violate it.
    db.flush()

    message = ImportantInformationMessage(
        title=payload.title,
        text=payload.text,
        status="active",
        created_by=current_user.id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _serialize(message, db)


@router.post(
    "/important-information/{message_id}/reactivate", response_model=ImportantInformationRead
)
def reactivate_important_information(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "write")),
):
    message = _get_message_or_404(db, message_id)
    if message.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This message is already active"
        )

    now = datetime.now(timezone.utc)
    _archive_current_active(db, now)
    # Same ordering fix as create_important_information above — flush the
    # archive UPDATE before activating this row, so the two updates never
    # land in the same batch with both rows reading status='active' at once.
    db.flush()
    message.status = "active"
    message.archived_at = None
    db.commit()
    db.refresh(message)
    return _serialize(message, db)


@router.post(
    "/important-information/{message_id}/deactivate", response_model=ImportantInformationRead
)
def deactivate_important_information(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "write")),
):
    """Manually archive the active message without replacing it — the
    Dashboard banner then just disappears until a new message is created or
    an archived one is reactivated."""
    message = _get_message_or_404(db, message_id)
    if message.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This message is not active"
        )

    message.status = "archived"
    message.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(message)
    return _serialize(message, db)


@router.delete("/important-information/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_important_information(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "write")),
):
    message = _get_message_or_404(db, message_id)
    if message.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the active message — replace or archive it first",
        )
    db.delete(message)
    db.commit()
    return None
