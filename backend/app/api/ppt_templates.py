from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.config import settings
from app.core.rotary_year import rotary_year as compute_rotary_year
from app.db.session import get_db
from app.models import PptTemplate, User
from app.schemas.ppt_template import PptTemplateRead

router = APIRouter()

PPT_TEMPLATE_KEY = "admin.ppt_template"

# Uploaded via a plain <input type="file" accept=".pptx">, so browsers vary in
# what content_type they report — some send the correct OOXML type, others
# fall back to the generic octet-stream. The filename extension is the more
# reliable signal and is checked first; content_type is only used to reject
# an obviously-wrong upload (e.g. a .jpg renamed to .pptx would still report
# an image content_type).
PPTX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
MAX_TEMPLATE_BYTES = 20 * 1024 * 1024


def _template_dir() -> Path:
    path = Path(settings.upload_dir) / "ppt-templates"
    path.mkdir(parents=True, exist_ok=True)
    return path


def template_path_for_year(year: int) -> Path | None:
    """Used by report generation (app.core.statistics_report) to resolve the
    active template file for a rotary year, if one exists."""
    path = _template_dir() / f"{year}.pptx"
    return path if path.exists() else None


def _serialize(template: PptTemplate, db: Session) -> PptTemplateRead:
    uploader = db.get(User, template.uploaded_by) if template.uploaded_by else None
    return PptTemplateRead(
        id=template.id,
        rotary_year=template.rotary_year,
        original_filename=template.original_filename,
        uploaded_by=template.uploaded_by,
        uploaded_by_name=uploader.full_name if uploader else None,
        uploaded_at=template.uploaded_at,
    )


@router.get("/ppt-templates/current", response_model=PptTemplateRead | None)
def get_current_ppt_template(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(PPT_TEMPLATE_KEY, "read")),
):
    year = compute_rotary_year(date.today())
    template = db.query(PptTemplate).filter(PptTemplate.rotary_year == year).first()
    if template is None:
        return None
    return _serialize(template, db)


@router.post(
    "/ppt-templates", response_model=PptTemplateRead, status_code=status.HTTP_201_CREATED
)
async def upload_ppt_template(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(PPT_TEMPLATE_KEY, "write")),
):
    filename_lower = (file.filename or "").lower()
    if not filename_lower.endswith(".pptx") or (
        file.content_type
        and file.content_type not in (PPTX_CONTENT_TYPE, "application/octet-stream")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Template must be a .pptx file",
        )

    contents = await file.read()
    if len(contents) > MAX_TEMPLATE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Template must be smaller than 20MB",
        )

    year = compute_rotary_year(date.today())
    # Deterministic filename per year (not a random uuid like member photos /
    # NGO logos) — a Replace upload can then just overwrite the same path,
    # with no orphaned file left behind from the previous upload.
    stored_filename = f"{year}.pptx"
    (_template_dir() / stored_filename).write_bytes(contents)

    template = db.query(PptTemplate).filter(PptTemplate.rotary_year == year).first()
    if template is None:
        template = PptTemplate(
            rotary_year=year, filename=stored_filename, original_filename=file.filename
        )
        db.add(template)
    else:
        # uploaded_at's onupdate=func.now() stamps the replace time
        # automatically since this row is dirty — no need to set it here.
        template.original_filename = file.filename

    template.uploaded_by = current_user.id
    db.commit()
    db.refresh(template)
    return _serialize(template, db)


@router.delete("/ppt-templates", status_code=status.HTTP_204_NO_CONTENT)
def delete_ppt_template(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(PPT_TEMPLATE_KEY, "write")),
):
    year = compute_rotary_year(date.today())
    template = db.query(PptTemplate).filter(PptTemplate.rotary_year == year).first()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No annual template uploaded for this rotary year",
        )

    stored_path = _template_dir() / template.filename
    if stored_path.exists():
        stored_path.unlink()

    db.delete(template)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
