from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.sender_client import SenderAPIError, send_email
from app.db.session import get_db
from app.models import EmailLog, Member, User
from app.schemas.member_email import EmailLogRead, MemberEmailRequest, MemberEmailResult

router = APIRouter()


def _resolve_recipients(payload: MemberEmailRequest, db: Session) -> list[Member]:
    query = db.query(Member).filter(Member.email.isnot(None))

    if payload.member_ids:
        return query.filter(Member.id.in_(payload.member_ids)).all()

    if payload.recipient_group == "all":
        return query.all()
    if payload.recipient_group == "active":
        return query.filter(Member.status == "active").all()
    if payload.recipient_group == "past":
        return query.filter(Member.status == "past").all()
    return []


@router.post("/members/email", response_model=MemberEmailResult)
def email_members(
    payload: MemberEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    recipients = _resolve_recipients(payload, db)

    success_count = 0
    failure_count = 0

    for member in recipients:
        try:
            send_email(
                to_email=member.email,
                to_name=f"{member.first_name} {member.last_name}",
                subject=payload.subject,
                html_body=payload.body,
            )
            success_count += 1
        except SenderAPIError:
            failure_count += 1

    recipient_count = len(recipients)
    if recipient_count == 0:
        log_status = "no_recipients"
    elif failure_count == 0:
        log_status = "sent"
    elif success_count == 0:
        log_status = "failed"
    else:
        log_status = "partial_failure"

    recipient_group_label = payload.recipient_group or "custom_selection"
    email_log = EmailLog(
        sent_by=current_user.id,
        subject=payload.subject,
        source_module="members",
        recipient_group=recipient_group_label,
        recipient_count=recipient_count,
        status=log_status,
    )
    db.add(email_log)
    db.commit()
    db.refresh(email_log)

    return MemberEmailResult(
        email_log_id=email_log.id,
        status=log_status,
        recipient_count=recipient_count,
        success_count=success_count,
        failure_count=failure_count,
    )


@router.get("/members/email-log", response_model=list[EmailLogRead])
def list_email_log(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    return (
        db.query(EmailLog)
        .filter(EmailLog.source_module == "members")
        .order_by(EmailLog.sent_at.desc())
        .all()
    )
