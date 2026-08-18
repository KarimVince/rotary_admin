from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.email_client import EmailSendError, send_email
from app.core.security import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_db
from app.models import AuthToken, User
from app.schemas.auth import ForgotPasswordRequest, LoginRequest, RefreshRequest, TokenResponse, UserRead
from app.schemas.user import PasswordResetConfirm

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Story 16.30 — self-service forgot-password. Separate from
# app/api/users.py's PASSWORD_RESET_EXPIRE_HOURS (admin-triggered reset) —
# duplicated rather than shared, matching this codebase's existing
# convention of every email-sending caller inlining its own constant/HTML
# (see app/core/email_client.py's docstring) rather than a shared template
# module. Same value (1 hour) by design.
FORGOT_PASSWORD_EXPIRE_HOURS = 1


def _issue_tokens(db: Session, user: User) -> TokenResponse:
    access_token = create_access_token(str(user.id), user.role)
    refresh_token = generate_refresh_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token=hash_token(refresh_token),
            purpose="refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return _issue_tokens(db, user)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    hashed = hash_token(payload.refresh_token)
    token_record = (
        db.query(AuthToken)
        .filter(AuthToken.token == hashed, AuthToken.purpose == "refresh")
        .first()
    )

    now = datetime.now(timezone.utc)
    if token_record is None or token_record.used_at is not None or token_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    token_record.used_at = now
    db.commit()

    user = db.get(User, token_record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive"
        )

    return _issue_tokens(db, user)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Story 16.30 — self-service password reset request (login page's
    "Forgot password?" link), distinct from app/api/users.py's admin-
    triggered reset. Always returns the same generic response regardless of
    whether the email is registered — the AC explicitly calls out that
    "email not found" must not reveal account existence."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None and user.is_active:
        raw_token = generate_refresh_token()
        db.add(
            AuthToken(
                user_id=user.id,
                token=hash_token(raw_token),
                purpose="password_reset",
                expires_at=datetime.now(timezone.utc)
                + timedelta(hours=FORGOT_PASSWORD_EXPIRE_HOURS),
            )
        )
        db.commit()

        reset_link = f"{settings.frontend_base_url}/reset-password?token={raw_token}"
        try:
            send_email(
                to_email=user.email,
                to_name=user.full_name,
                subject="Reset your Rotary Admin password",
                html_body=(
                    f"<p>Hello {user.full_name},</p>"
                    "<p>We received a request to reset your Rotary Admin password. "
                    f'Click <a href="{reset_link}">this link</a> to set a new password. '
                    f"This link expires in {FORGOT_PASSWORD_EXPIRE_HOURS} hour(s) and can "
                    "only be used once.</p>"
                    "<p>If you didn't request this, you can safely ignore this email — "
                    "your password won't be changed.</p>"
                ),
            )
        except EmailSendError:
            # Best-effort: swallow send failures rather than surfacing them,
            # so the response shape never differs based on delivery success
            # either — same anti-enumeration reasoning as the "user not
            # found" branch above.
            pass

    return {
        "detail": "If that email is registered, we've sent a password reset link to it."
    }


@router.post("/reset-password")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    hashed = hash_token(payload.token)
    token_record = (
        db.query(AuthToken)
        .filter(AuthToken.token == hashed, AuthToken.purpose == "password_reset")
        .first()
    )

    now = datetime.now(timezone.utc)
    if token_record is None or token_record.used_at is not None or token_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user = db.get(User, token_record.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user.hashed_password = hash_password(payload.new_password)
    token_record.used_at = now
    # Invalidate any outstanding refresh tokens so old sessions can't keep
    # using the password that was just reset.
    db.query(AuthToken).filter(
        AuthToken.user_id == user.id,
        AuthToken.purpose == "refresh",
        AuthToken.used_at.is_(None),
    ).update({"used_at": now})
    db.commit()

    # Story 16.30 — heads-up sent to the account's own email whenever its
    # password changes (covers both this self-service flow and the
    # admin-triggered reset in app/api/users.py, since both land here to
    # confirm), in case it wasn't the account owner who triggered it.
    # Best-effort: a notification failure must never block the password
    # change that already succeeded.
    try:
        send_email(
            to_email=user.email,
            to_name=user.full_name,
            subject="Your Rotary Admin password was changed",
            html_body=(
                f"<p>Hello {user.full_name},</p>"
                "<p>This is a confirmation that your Rotary Admin password was just "
                "changed. If you didn't make this change, contact your club "
                "administrator right away.</p>"
            ),
        )
    except EmailSendError:
        pass

    return {"detail": "Password updated"}
