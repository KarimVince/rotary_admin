"""Story 16.29 — Dinner/Event Minutes: pasted text or an uploaded Word/PDF
file, recorded against an `AttendanceEvent` ("Dinner/Event" in this app's
terminology — see the ClickUp story). Multiple minutes records per event are
allowed (confirmed with Karim before building — not a single 1:1 record)."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.attendance import _get_event_or_404
from app.api.deps import require_access
from app.core import storage
from app.db.session import get_db
from app.models import EventMinutes, User
from app.schemas.event_minutes import (
    EventMinutesRead,
    EventMinutesTextCreate,
    EventMinutesTextUpdate,
)

router = APIRouter()

MINUTES_KEY = "attendance.minutes"

# Extension is the reliable signal (browsers report inconsistent
# content_type for Word docs in particular) — same approach as
# app/api/ppt_templates.py. Content-type stored against the row is our own
# canonical value, not whatever the browser sent.
FILE_EXTENSION_CONTENT_TYPES = {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf",
}
MAX_FILE_BYTES = 5 * 1024 * 1024


def _get_minutes_or_404(db: Session, event_id: uuid.UUID, minutes_id: uuid.UUID) -> EventMinutes:
    minutes = (
        db.query(EventMinutes)
        .filter(EventMinutes.id == minutes_id, EventMinutes.event_id == event_id)
        .first()
    )
    if minutes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Minutes record not found")
    return minutes


def _serialize(minutes: EventMinutes, db: Session) -> EventMinutesRead:
    creator = db.get(User, minutes.created_by) if minutes.created_by else None
    updater = db.get(User, minutes.last_updated_by) if minutes.last_updated_by else None
    return EventMinutesRead(
        id=minutes.id,
        event_id=minutes.event_id,
        minutes_type=minutes.minutes_type,
        content_text=minutes.content_text,
        file_original_filename=minutes.file_original_filename,
        file_content_type=minutes.file_content_type,
        file_size_bytes=minutes.file_size_bytes,
        created_by=minutes.created_by,
        created_by_name=creator.full_name if creator else None,
        created_at=minutes.created_at,
        last_updated_by=minutes.last_updated_by,
        last_updated_by_name=updater.full_name if updater else None,
        last_updated_at=minutes.last_updated_at,
    )


def _validate_extension(filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if extension not in FILE_EXTENSION_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minutes file must be a .doc, .docx, or .pdf file",
        )
    return extension


async def _read_and_validate_size(file: UploadFile) -> bytes:
    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minutes file must be smaller than 5MB",
        )
    return contents


@router.get("/attendance/events/{event_id}/minutes", response_model=list[EventMinutesRead])
def list_event_minutes(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MINUTES_KEY, "read")),
):
    _get_event_or_404(db, event_id)
    rows = (
        db.query(EventMinutes)
        .filter(EventMinutes.event_id == event_id)
        .order_by(EventMinutes.created_at.desc())
        .all()
    )
    return [_serialize(row, db) for row in rows]


@router.post(
    "/attendance/events/{event_id}/minutes/text",
    response_model=EventMinutesRead,
    status_code=status.HTTP_201_CREATED,
)
def create_text_minutes(
    event_id: uuid.UUID,
    payload: EventMinutesTextCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MINUTES_KEY, "write")),
):
    _get_event_or_404(db, event_id)
    minutes = EventMinutes(
        event_id=event_id,
        minutes_type="text",
        content_text=payload.content_text,
        created_by=current_user.id,
        last_updated_by=current_user.id,
    )
    db.add(minutes)
    db.commit()
    db.refresh(minutes)
    return _serialize(minutes, db)


@router.put("/attendance/events/{event_id}/minutes/{minutes_id}/text", response_model=EventMinutesRead)
def update_text_minutes(
    event_id: uuid.UUID,
    minutes_id: uuid.UUID,
    payload: EventMinutesTextUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MINUTES_KEY, "write")),
):
    minutes = _get_minutes_or_404(db, event_id, minutes_id)
    if minutes.minutes_type != "text":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This minutes record is a file, not text — replace the file instead",
        )
    minutes.content_text = payload.content_text
    minutes.last_updated_by = current_user.id
    db.commit()
    db.refresh(minutes)
    return _serialize(minutes, db)


def _store_file(event_id: uuid.UUID, file_id: uuid.UUID, extension: str, contents: bytes) -> str:
    content_type = FILE_EXTENSION_CONTENT_TYPES[extension]
    path = f"{event_id}/{file_id.hex}{extension}"
    storage.upload_object(storage.EVENT_MINUTES_BUCKET, path, contents, content_type)
    return path


@router.post(
    "/attendance/events/{event_id}/minutes/file",
    response_model=EventMinutesRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_file_minutes(
    event_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MINUTES_KEY, "write")),
):
    _get_event_or_404(db, event_id)
    extension = _validate_extension(file.filename)
    contents = await _read_and_validate_size(file)

    minutes = EventMinutes(
        event_id=event_id,
        minutes_type="file",
        created_by=current_user.id,
        last_updated_by=current_user.id,
    )
    db.add(minutes)
    db.flush()  # assigns minutes.id, used as the stored file's own uuid

    minutes.storage_path = _store_file(event_id, minutes.id, extension, contents)
    minutes.file_original_filename = file.filename
    minutes.file_content_type = FILE_EXTENSION_CONTENT_TYPES[extension]
    minutes.file_size_bytes = len(contents)

    db.commit()
    db.refresh(minutes)
    return _serialize(minutes, db)


@router.post("/attendance/events/{event_id}/minutes/{minutes_id}/file", response_model=EventMinutesRead)
async def replace_file_minutes(
    event_id: uuid.UUID,
    minutes_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MINUTES_KEY, "write")),
):
    minutes = _get_minutes_or_404(db, event_id, minutes_id)
    if minutes.minutes_type != "file":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This minutes record is text, not a file — edit the text instead",
        )
    extension = _validate_extension(file.filename)
    contents = await _read_and_validate_size(file)

    old_path = minutes.storage_path
    minutes.storage_path = _store_file(event_id, minutes.id, extension, contents)
    # x-upsert overwrites in place when the extension is unchanged, but a
    # changed extension (e.g. .doc -> .pdf) leaves the old object orphaned —
    # clean it up once the new upload has succeeded.
    if old_path and old_path != minutes.storage_path:
        try:
            storage.delete_object(storage.EVENT_MINUTES_BUCKET, old_path)
        except storage.StorageNotFoundError:
            pass

    minutes.file_original_filename = file.filename
    minutes.file_content_type = FILE_EXTENSION_CONTENT_TYPES[extension]
    minutes.file_size_bytes = len(contents)
    minutes.last_updated_by = current_user.id

    db.commit()
    db.refresh(minutes)
    return _serialize(minutes, db)


@router.get("/attendance/events/{event_id}/minutes/{minutes_id}/download")
def download_file_minutes(
    event_id: uuid.UUID,
    minutes_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MINUTES_KEY, "read")),
):
    minutes = _get_minutes_or_404(db, event_id, minutes_id)
    if minutes.minutes_type != "file" or not minutes.storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No file attached")

    try:
        contents = storage.download_object(storage.EVENT_MINUTES_BUCKET, minutes.storage_path)
    except storage.StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from exc

    return Response(
        content=contents,
        media_type=minutes.file_content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{minutes.file_original_filename}"',
        },
    )


@router.delete("/attendance/events/{event_id}/minutes/{minutes_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_minutes(
    event_id: uuid.UUID,
    minutes_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MINUTES_KEY, "write")),
):
    minutes = _get_minutes_or_404(db, event_id, minutes_id)
    if minutes.minutes_type == "file" and minutes.storage_path:
        try:
            storage.delete_object(storage.EVENT_MINUTES_BUCKET, minutes.storage_path)
        except storage.StorageNotFoundError:
            pass
    db.delete(minutes)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
