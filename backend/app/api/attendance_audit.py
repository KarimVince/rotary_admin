"""2026-08-14 — the completed, filled-in attendance sheet (Story 16.33's
fillable PDF, marked up during/after the meeting — printed+scanned or filled
digitally) uploaded back as the event's permanent audit record. File-only
(unlike EventMinutes, no text mode makes sense here); otherwise the same
upload/list/download/delete shape as `app/api/event_minutes.py`'s file mode."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.attendance import ATTENDANCE_SHEET, _get_event_or_404
from app.api.deps import require_access
from app.core import storage
from app.db.session import get_db
from app.models import AttendanceAudit, User
from app.schemas.attendance_audit import AttendanceAuditRead

router = APIRouter()

# Digital fill-in (PDF) or a printed-and-scanned copy (image) — the two
# realistic ways a completed sheet comes back.
FILE_EXTENSION_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}
MAX_FILE_BYTES = 10 * 1024 * 1024


def _get_audit_or_404(db: Session, event_id: uuid.UUID, audit_id: uuid.UUID) -> AttendanceAudit:
    audit = (
        db.query(AttendanceAudit)
        .filter(AttendanceAudit.id == audit_id, AttendanceAudit.event_id == event_id)
        .first()
    )
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit record not found")
    return audit


def _serialize(audit: AttendanceAudit, db: Session) -> AttendanceAuditRead:
    uploader = db.get(User, audit.uploaded_by) if audit.uploaded_by else None
    return AttendanceAuditRead(
        id=audit.id,
        event_id=audit.event_id,
        file_original_filename=audit.file_original_filename,
        file_content_type=audit.file_content_type,
        file_size_bytes=audit.file_size_bytes,
        uploaded_by=audit.uploaded_by,
        uploaded_by_name=uploader.full_name if uploader else None,
        uploaded_at=audit.uploaded_at,
    )


def _validate_extension(filename: str) -> str:
    extension = Path(filename or "").suffix.lower()
    if extension not in FILE_EXTENSION_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Completed sheet must be a .pdf, .jpg, .jpeg, or .png file",
        )
    return extension


async def _read_and_validate_size(file: UploadFile) -> bytes:
    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Completed sheet must be smaller than 10MB",
        )
    return contents


@router.get("/attendance/events/{event_id}/audit", response_model=list[AttendanceAuditRead])
def list_attendance_audits(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "read")),
):
    _get_event_or_404(db, event_id)
    rows = (
        db.query(AttendanceAudit)
        .filter(AttendanceAudit.event_id == event_id)
        .order_by(AttendanceAudit.uploaded_at.desc())
        .all()
    )
    return [_serialize(row, db) for row in rows]


@router.post(
    "/attendance/events/{event_id}/audit",
    response_model=AttendanceAuditRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attendance_audit(
    event_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    _get_event_or_404(db, event_id)
    extension = _validate_extension(file.filename)
    contents = await _read_and_validate_size(file)

    # Generated up front (rather than flush-then-fill, which would violate
    # storage_path's NOT NULL constraint at flush time) since the storage
    # path is keyed on the row's own id.
    audit_id = uuid.uuid4()
    path = f"audit/{event_id}/{audit_id.hex}{extension}"
    storage.upload_object(storage.EVENT_MINUTES_BUCKET, path, contents, FILE_EXTENSION_CONTENT_TYPES[extension])

    audit = AttendanceAudit(
        id=audit_id,
        event_id=event_id,
        uploaded_by=current_user.id,
        storage_path=path,
        file_original_filename=file.filename,
        file_content_type=FILE_EXTENSION_CONTENT_TYPES[extension],
        file_size_bytes=len(contents),
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return _serialize(audit, db)


@router.get("/attendance/events/{event_id}/audit/{audit_id}/download")
def download_attendance_audit(
    event_id: uuid.UUID,
    audit_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "read")),
):
    audit = _get_audit_or_404(db, event_id, audit_id)
    try:
        contents = storage.download_object(storage.EVENT_MINUTES_BUCKET, audit.storage_path)
    except storage.StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from exc

    return Response(
        content=contents,
        media_type=audit.file_content_type,
        headers={"Content-Disposition": f'inline; filename="{audit.file_original_filename}"'},
    )


@router.delete("/attendance/events/{event_id}/audit/{audit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance_audit(
    event_id: uuid.UUID,
    audit_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(ATTENDANCE_SHEET, "write")),
):
    audit = _get_audit_or_404(db, event_id, audit_id)
    try:
        storage.delete_object(storage.EVENT_MINUTES_BUCKET, audit.storage_path)
    except storage.StorageNotFoundError:
        pass
    db.delete(audit)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
