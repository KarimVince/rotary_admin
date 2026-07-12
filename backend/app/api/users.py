from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.config import settings
from app.core.email_client import EmailSendError, send_email
from app.core.security import generate_refresh_token, hash_password, hash_token
from app.db.session import get_db
from app.models import AuthToken, User
from app.schemas.auth import UserRead
from app.schemas.user import UserCreate, UserUpdate

router = APIRouter(dependencies=[Depends(require_admin)])

PASSWORD_RESET_EXPIRE_HOURS = 1


@router.get("/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.email).all()


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        member_id=payload.member_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True)

    is_self = str(user.id) == str(current_admin.id)
    if is_self and update_data.get("role") not in (None, "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )
    if is_self and update_data.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    if "email" in update_data and update_data["email"] != user.email:
        email_taken = (
            db.query(User)
            .filter(User.email == update_data["email"], User.id != user.id)
            .first()
        )
        if email_taken:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            )

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(current_admin.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete your own account",
        )

    db.delete(user)
    try:
        db.commit()
    except IntegrityError:
        # The user has existing records elsewhere (donations, attendance,
        # fee history, etc.) that reference them — those FKs aren't
        # cascade/set-null, by design, so history isn't silently orphaned.
        # Deactivating (existing is_active flag) is the way to remove access
        # from a user with history; hard delete only works for a clean account.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This user cannot be deleted because they have existing records "
                "(donations, attendance, fee history, etc.). Deactivate the "
                "account instead."
            ),
        )
    return None


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_200_OK)
def reset_user_password(user_id: str, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    raw_token = generate_refresh_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token=hash_token(raw_token),
            purpose="password_reset",
            expires_at=datetime.now(timezone.utc)
            + timedelta(hours=PASSWORD_RESET_EXPIRE_HOURS),
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
                "<p>An administrator has requested a password reset for your account. "
                f'Click <a href="{reset_link}">this link</a> to set a new password. '
                f"This link expires in {PASSWORD_RESET_EXPIRE_HOURS} hour(s).</p>"
                "<p>If you didn't expect this, you can safely ignore this email.</p>"
            ),
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send password reset email",
        ) from exc

    return {"detail": "Password reset email sent"}
