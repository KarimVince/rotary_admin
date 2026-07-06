from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.email_client import EmailSendError, send_email
from app.core.tags import split_tags
from app.db.session import get_db
from app.models import EmailLog, RotaryFriend, User
from app.schemas.rotary_friend_email import (
    RotaryFriendEmailLogRead,
    RotaryFriendEmailRequest,
    RotaryFriendEmailResult,
)

router = APIRouter()


def _resolve_matching_friends(
    payload: RotaryFriendEmailRequest, db: Session
) -> list[RotaryFriend]:
    """Returns every friend matching the selection, with or without an email
    on file — the caller separates emailable vs skipped so both are counted
    (Story 4.3: skipped whatsapp-only contacts must be reported, not dropped
    silently)."""
    if payload.friend_ids:
        return db.query(RotaryFriend).filter(RotaryFriend.id.in_(payload.friend_ids)).all()

    if payload.tag:
        tag_lower = payload.tag.strip().lower()
        return [
            friend
            for friend in db.query(RotaryFriend).all()
            if tag_lower in [tag.lower() for tag in split_tags(friend.tags)]
        ]

    if payload.recipient_group == "all":
        return db.query(RotaryFriend).all()

    return []


@router.post("/rotary-friends/email", response_model=RotaryFriendEmailResult)
def email_rotary_friends(
    payload: RotaryFriendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    matching = _resolve_matching_friends(payload, db)
    recipients = [friend for friend in matching if friend.email]
    skipped_no_email_count = len(matching) - len(recipients)

    attachments = (
        {attachment.filename: attachment.url for attachment in payload.attachments}
        if payload.attachments
        else None
    )

    success_count = 0
    failure_count = 0

    for friend in recipients:
        try:
            send_email(
                to_email=friend.email,
                to_name=f"{friend.first_name} {friend.last_name}",
                subject=payload.subject,
                html_body=payload.body,
                attachments=attachments,
            )
            success_count += 1
        except EmailSendError:
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

    recipient_group_label = payload.recipient_group or payload.tag or "custom_selection"
    email_log = EmailLog(
        sent_by=current_user.id,
        subject=payload.subject,
        source_module="rotary_friends",
        recipient_group=recipient_group_label,
        recipient_count=recipient_count,
        status=log_status,
        has_attachments=bool(payload.attachments),
    )
    db.add(email_log)
    db.commit()
    db.refresh(email_log)

    return RotaryFriendEmailResult(
        email_log_id=email_log.id,
        status=log_status,
        recipient_count=recipient_count,
        success_count=success_count,
        failure_count=failure_count,
        skipped_no_email_count=skipped_no_email_count,
    )


@router.get("/rotary-friends/email-log", response_model=list[RotaryFriendEmailLogRead])
def list_rotary_friend_email_log(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    return (
        db.query(EmailLog)
        .filter(EmailLog.source_module == "rotary_friends")
        .order_by(EmailLog.sent_at.desc())
        .all()
    )
