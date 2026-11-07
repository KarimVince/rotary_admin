"""NGO Project File — per-NGO, per-rotary-year preparation work (objectives,
plan, outcome, lead member) and uploaded documents. Shown as a "Project File"
section on the NGO detail page, next to Donations and Services.

Records are addressed by (organisation, rotary_year) rather than by id: there
is at most one per NGO per year (unique constraint), and uploading a document
for a year that has no record yet creates one on the fly, so users can start
attaching preparation documents before filling in any plan text.

Shares the `ngos.organisations` permission tier, same as donations and
service hours — anyone who can read/write NGOs can read/write project files.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core import storage
from app.db.session import get_db
from app.models import Member, Organisation, ServiceProject, ServiceProjectDocument, User
from app.schemas.service_project import (
    ServiceProjectDocumentRead,
    ServiceProjectRead,
    ServiceProjectUpsert,
)

router = APIRouter()

NGOS_ORGANISATIONS = "ngos.organisations"

# Extension is the reliable signal (browsers report inconsistent content
# types, Office files especially) — same approach as event_minutes.py. The
# content type stored on the row is our own canonical value.
FILE_EXTENSION_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
}
MAX_FILE_BYTES = 10 * 1024 * 1024
STORAGE_PREFIX = "ngo-projects"


def _get_organisation_or_404(db: Session, organisation_id: uuid.UUID) -> Organisation:
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")
    return organisation


def _find_project(db: Session, organisation_id: uuid.UUID, year: int) -> ServiceProject | None:
    return (
        db.query(ServiceProject)
        .filter(ServiceProject.organisation_id == organisation_id, ServiceProject.rotary_year == year)
        .first()
    )


def _get_project_or_404(db: Session, organisation_id: uuid.UUID, year: int) -> ServiceProject:
    project = _find_project(db, organisation_id, year)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project file not found")
    return project


def _get_document_or_404(
    db: Session, organisation_id: uuid.UUID, year: int, document_id: uuid.UUID
) -> ServiceProjectDocument:
    project = _get_project_or_404(db, organisation_id, year)
    document = (
        db.query(ServiceProjectDocument)
        .filter(
            ServiceProjectDocument.id == document_id,
            ServiceProjectDocument.service_project_id == project.id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def _user_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    if user_id is None:
        return None
    user = db.get(User, user_id)
    return user.full_name if user else None


def _serialize_document(db: Session, document: ServiceProjectDocument) -> ServiceProjectDocumentRead:
    return ServiceProjectDocumentRead(
        id=document.id,
        service_project_id=document.service_project_id,
        description=document.description,
        file_original_filename=document.file_original_filename,
        file_content_type=document.file_content_type,
        file_size_bytes=document.file_size_bytes,
        uploaded_by=document.uploaded_by,
        uploaded_by_name=_user_name(db, document.uploaded_by),
        created_at=document.created_at,
    )


def _serialize(db: Session, project: ServiceProject) -> ServiceProjectRead:
    lead = db.get(Member, project.lead_member_id) if project.lead_member_id else None
    documents = (
        db.query(ServiceProjectDocument)
        .filter(ServiceProjectDocument.service_project_id == project.id)
        .order_by(ServiceProjectDocument.created_at.desc())
        .all()
    )
    return ServiceProjectRead(
        id=project.id,
        organisation_id=project.organisation_id,
        rotary_year=project.rotary_year,
        status=project.status,
        lead_member_id=project.lead_member_id,
        lead_member_name=f"{lead.first_name} {lead.last_name}" if lead else None,
        objectives=project.objectives,
        plan=project.plan,
        outcome=project.outcome,
        documents=[_serialize_document(db, document) for document in documents],
        created_by=project.created_by,
        created_at=project.created_at,
        last_updated_by=project.last_updated_by,
        last_updated_by_name=_user_name(db, project.last_updated_by),
        last_updated_at=project.last_updated_at,
    )


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def delete_project_files(db: Session, organisation_id: uuid.UUID) -> None:
    """Remove every stored document object for an organisation. The DB rows
    go via ON DELETE CASCADE; this cleans the bucket, which can't cascade.
    Called by the organisation delete endpoint before deleting the row."""
    paths = (
        db.query(ServiceProjectDocument.storage_path)
        .join(ServiceProject, ServiceProject.id == ServiceProjectDocument.service_project_id)
        .filter(ServiceProject.organisation_id == organisation_id)
        .all()
    )
    for (path,) in paths:
        _delete_object_quietly(path)


def _delete_object_quietly(path: str) -> None:
    try:
        storage.delete_object(storage.EVENT_MINUTES_BUCKET, path)
    except storage.StorageNotFoundError:
        pass


@router.get(
    "/organisations/{organisation_id}/service-projects", response_model=list[ServiceProjectRead]
)
def list_service_projects(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    _get_organisation_or_404(db, organisation_id)
    projects = (
        db.query(ServiceProject)
        .filter(ServiceProject.organisation_id == organisation_id)
        .order_by(ServiceProject.rotary_year.desc())
        .all()
    )
    return [_serialize(db, project) for project in projects]


@router.put(
    "/organisations/{organisation_id}/service-projects/{year}", response_model=ServiceProjectRead
)
def upsert_service_project(
    organisation_id: uuid.UUID,
    year: int,
    payload: ServiceProjectUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    _get_organisation_or_404(db, organisation_id)
    if payload.lead_member_id is not None and db.get(Member, payload.lead_member_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    project = _find_project(db, organisation_id, year)
    if project is None:
        project = ServiceProject(
            organisation_id=organisation_id, rotary_year=year, created_by=current_user.id
        )
        db.add(project)

    project.status = payload.status
    project.lead_member_id = payload.lead_member_id
    project.objectives = _blank_to_none(payload.objectives)
    project.plan = _blank_to_none(payload.plan)
    project.outcome = _blank_to_none(payload.outcome)
    project.last_updated_by = current_user.id

    db.commit()
    db.refresh(project)
    return _serialize(db, project)


@router.delete(
    "/organisations/{organisation_id}/service-projects/{year}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_service_project(
    organisation_id: uuid.UUID,
    year: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    project = _get_project_or_404(db, organisation_id, year)
    for document in db.query(ServiceProjectDocument).filter(
        ServiceProjectDocument.service_project_id == project.id
    ):
        _delete_object_quietly(document.storage_path)
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/organisations/{organisation_id}/service-projects/{year}/documents",
    response_model=ServiceProjectRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_service_project_document(
    organisation_id: uuid.UUID,
    year: int,
    file: UploadFile = File(...),
    description: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    _get_organisation_or_404(db, organisation_id)

    extension = Path(file.filename or "").suffix.lower()
    if extension not in FILE_EXTENSION_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Unsupported file type — upload a PDF, Word, Excel, PowerPoint, "
                "CSV, text or image file"
            ),
        )
    contents = await file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be smaller than 10MB",
        )
    description = _blank_to_none(description)
    if description is not None and len(description) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Description must be 255 characters or fewer",
        )

    project = _find_project(db, organisation_id, year)
    if project is None:
        project = ServiceProject(
            organisation_id=organisation_id,
            rotary_year=year,
            created_by=current_user.id,
            last_updated_by=current_user.id,
        )
        db.add(project)
        db.flush()

    document_id = uuid.uuid4()
    content_type = FILE_EXTENSION_CONTENT_TYPES[extension]
    path = f"{STORAGE_PREFIX}/{organisation_id}/{year}/{document_id.hex}{extension}"
    storage.upload_object(storage.EVENT_MINUTES_BUCKET, path, contents, content_type)

    db.add(
        ServiceProjectDocument(
            id=document_id,
            service_project_id=project.id,
            description=description,
            storage_path=path,
            file_original_filename=Path(file.filename).name[:255],
            file_content_type=content_type,
            file_size_bytes=len(contents),
            uploaded_by=current_user.id,
        )
    )
    db.commit()
    db.refresh(project)
    return _serialize(db, project)


@router.get(
    "/organisations/{organisation_id}/service-projects/{year}/documents/{document_id}/download"
)
def download_service_project_document(
    organisation_id: uuid.UUID,
    year: int,
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    document = _get_document_or_404(db, organisation_id, year, document_id)
    try:
        contents = storage.download_object(storage.EVENT_MINUTES_BUCKET, document.storage_path)
    except storage.StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from exc

    safe_name = document.file_original_filename.replace('"', "")
    return Response(
        content=contents,
        media_type=document.file_content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.delete(
    "/organisations/{organisation_id}/service-projects/{year}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_service_project_document(
    organisation_id: uuid.UUID,
    year: int,
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    document = _get_document_or_404(db, organisation_id, year, document_id)
    _delete_object_quietly(document.storage_path)
    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
