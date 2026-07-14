import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.config import settings
from app.core.email_client import EmailSendError, send_email
from app.core.member_application_pdf import build_member_application_pdf
from app.db.session import get_db
from app.models import MemberApplication, User
from app.schemas.member_application import (
    MemberApplicationCreate,
    MemberApplicationRead,
    MemberApplicationSendRequest,
)

router = APIRouter()

MEMBERS_DIRECTORY = "members.directory"


def _applications_dir() -> Path:
    path = Path(settings.upload_dir) / "applications"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _serialize(application: MemberApplication) -> MemberApplicationRead:
    return MemberApplicationRead(
        id=application.id,
        name=application.name,
        email=application.email,
        phone=application.phone,
        email_sent_at=application.email_sent_at,
        whatsapp_sent_at=application.whatsapp_sent_at,
        created_at=application.created_at,
        pdf_url=f"/static/applications/{application.pdf_filename}",
    )


@router.post(
    "/member-applications", response_model=MemberApplicationRead, status_code=status.HTTP_201_CREATED
)
def create_member_application(
    payload: MemberApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "write")),
):
    pdf_bytes = build_member_application_pdf(payload.name, payload.email, payload.phone)

    filename = f"{uuid.uuid4().hex}.pdf"
    (_applications_dir() / filename).write_bytes(pdf_bytes)

    application = MemberApplication(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        pdf_filename=filename,
        created_by=current_user.id,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return _serialize(application)


@router.post("/member-applications/{application_id}/send", response_model=MemberApplicationRead)
def send_member_application(
    application_id: uuid.UUID,
    payload: MemberApplicationSendRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "write")),
):
    application = db.get(MemberApplication, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    if payload.channel == "email":
        if not application.email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This application has no email address on file",
            )
        pdf_url = f"{settings.public_base_url}/static/applications/{application.pdf_filename}"
        try:
            send_email(
                to_email=application.email,
                to_name=application.name,
                subject=f"{application.name} — Rotary Club membership application",
                html_body=(
                    "<p>Please find attached your membership application form. "
                    "Complete the remaining fields, sign, and return it to the club.</p>"
                ),
                attachments={"Membership Application.pdf": pdf_url},
            )
        except EmailSendError as err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send email"
            ) from err
        application.email_sent_at = datetime.now(timezone.utc)
    else:
        # Story 8.3: WhatsApp send has no real integration yet (Epic 8's
        # WhatsApp block is deferred) — this is a manual "mark sent" flag
        # only, same convention as MemberFee.last_channel="whatsapp".
        application.whatsapp_sent_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(application)
    return _serialize(application)


@router.get("/member-applications/{application_id}", response_model=MemberApplicationRead)
def get_member_application(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(MEMBERS_DIRECTORY, "read")),
):
    application = db.get(MemberApplication, application_id)
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )
    return _serialize(application)
