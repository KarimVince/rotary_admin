"""Story 16.30 — self-service account settings (top-nav popover): change your
own password (current password required) and change your own email (via a
confirmation link sent to the new address, per Karim's answer to the story's
own "should email change require re-verification" open question).

Deliberately scoped to login/account fields only (the `users` table
identity), NOT the `members` club-profile data — matches the story's own
explicit scope note. Gated only on being logged in (`get_current_user`), not
the permission matrix — every user manages their own account regardless of
their module-level access elsewhere."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.email_client import EmailSendError, send_email
from app.core.security import (
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_db
from app.models import AuthToken, User
from app.schemas.account import (
    AccountEmailChangeConfirm,
    AccountEmailChangeRequest,
    AccountPasswordChange,
)

router = APIRouter(prefix="/api/v1/account", tags=["account"])

EMAIL_CHANGE_EXPIRE_HOURS = 1


def _send_best_effort(**kwargs) -> None:
    try:
        send_email(**kwargs)
    except EmailSendError:
        # Never let a notification failure block an account change that has
        # already succeeded — same reasoning as app/api/auth.py's
        # password-changed notice.
        pass


@router.put("/password")
def change_own_password(
    payload: AccountPasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )

    current_user.hashed_password = hash_password(payload.new_password)
    now = datetime.now(timezone.utc)
    # Same session-invalidation as the forgot-password confirm flow — old
    # refresh tokens (other devices/tabs) can't keep using the old password.
    db.query(AuthToken).filter(
        AuthToken.user_id == current_user.id,
        AuthToken.purpose == "refresh",
        AuthToken.used_at.is_(None),
    ).update({"used_at": now})
    db.commit()

    _send_best_effort(
        to_email=current_user.email,
        to_name=current_user.full_name,
        subject="Your Rotary Admin password was changed",
        html_body=(
            f"<p>Hello {current_user.full_name},</p>"
            "<p>This is a confirmation that your Rotary Admin password was just "
            "changed from your account settings. If you didn't make this change, "
            "contact your club administrator right away.</p>"
        ),
    )

    return {"detail": "Password updated"}


@router.post("/email/request")
def request_email_change(
    payload: AccountEmailChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )

    if payload.new_email == current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That's already your current email address",
        )

    taken = (
        db.query(User)
        .filter(User.email == payload.new_email, User.id != current_user.id)
        .first()
    )
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    raw_token = generate_refresh_token()
    db.add(
        AuthToken(
            user_id=current_user.id,
            token=hash_token(raw_token),
            purpose="email_change",
            payload=payload.new_email,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=EMAIL_CHANGE_EXPIRE_HOURS),
        )
    )
    db.commit()

    # Sent to the NEW address (proves the user actually controls it) — this
    # one is not best-effort, since it's an authenticated, self-triggered
    # action inside the app (not anti-enumeration-sensitive like
    # forgot-password), so a real delivery failure should surface.
    confirm_link = f"{settings.frontend_base_url}/confirm-email?token={raw_token}"
    try:
        send_email(
            to_email=payload.new_email,
            to_name=current_user.full_name,
            subject="Confirm your new Rotary Admin email address",
            html_body=(
                f"<p>Hello {current_user.full_name},</p>"
                "<p>Confirm this email address as your new Rotary Admin login email by "
                f'clicking <a href="{confirm_link}">this link</a>. '
                f"It expires in {EMAIL_CHANGE_EXPIRE_HOURS} hour(s) and can only be used "
                "once.</p>"
                "<p>If you didn't request this change, you can safely ignore this "
                "email — your account email won't change.</p>"
            ),
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send the verification email",
        ) from exc

    return {"detail": "Verification email sent to the new address"}


@router.post("/email/confirm")
def confirm_email_change(payload: AccountEmailChangeConfirm, db: Session = Depends(get_db)):
    # Public (no auth) — the confirmation link is opened from an email, same
    # as /auth/reset-password, which the user may click from a different
    # browser/session than the one they requested the change from.
    hashed = hash_token(payload.token)
    token_record = (
        db.query(AuthToken)
        .filter(AuthToken.token == hashed, AuthToken.purpose == "email_change")
        .first()
    )

    now = datetime.now(timezone.utc)
    if (
        token_record is None
        or token_record.used_at is not None
        or token_record.expires_at < now
        or not token_record.payload
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired confirmation link",
        )

    user = db.get(User, token_record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired confirmation link",
        )

    new_email = token_record.payload
    # Re-check uniqueness — someone else may have taken this address in the
    # time between the request and this confirmation.
    taken = db.query(User).filter(User.email == new_email, User.id != user.id).first()
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email address was registered by another account in the meantime",
        )

    old_email = user.email
    user.email = new_email
    token_record.used_at = now
    db.commit()

    # Story 16.30 — heads-up to the OLD address, in case the account owner
    # didn't make this change.
    _send_best_effort(
        to_email=old_email,
        to_name=user.full_name,
        subject="Your Rotary Admin account email was changed",
        html_body=(
            f"<p>Hello {user.full_name},</p>"
            f"<p>Your Rotary Admin account's login email was just changed to "
            f"{new_email}. If you didn't make this change, contact your club "
            "administrator right away.</p>"
        ),
    )

    return {"detail": "Email updated"}
