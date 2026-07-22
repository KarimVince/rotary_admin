import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.access_control import get_access
from app.db.session import get_db
from app.models import EmailDraft, User
from app.schemas.email_draft import EmailDraftCreate, EmailDraftRead, EmailDraftUpdate, SourceModule

router = APIRouter()

# Story 16.19: a draft's access control mirrors its parent compose screen's
# own send permission — no separate "drafts" app_function needed.
_MODULE_PERMISSION_KEYS = {
    "members": "members.email",
    "rotary_friends": "friends.send_message",
}


def _require_module_access(
    db: Session, current_user: User, source_module: SourceModule, level: str
) -> None:
    function_key = _MODULE_PERMISSION_KEYS[source_module]
    resolved = get_access(db, current_user, function_key)
    order = {"no_access": 0, "read": 1, "write": 2}
    if order[resolved] < order[level]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )


def _get_draft_or_404(db: Session, draft_id: uuid.UUID, current_user: User) -> EmailDraft:
    # Story 16.19: drafts are personal — scoped to whoever saved them, same
    # as the compose form itself is per-user state before being saved.
    draft = (
        db.query(EmailDraft)
        .filter(EmailDraft.id == draft_id, EmailDraft.created_by == current_user.id)
        .first()
    )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    return draft


@router.get("/email-drafts", response_model=list[EmailDraftRead])
def list_email_drafts(
    source_module: SourceModule = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_module_access(db, current_user, source_module, "read")
    return (
        db.query(EmailDraft)
        .filter(
            EmailDraft.source_module == source_module,
            EmailDraft.created_by == current_user.id,
        )
        .order_by(EmailDraft.updated_at.desc())
        .all()
    )


@router.post("/email-drafts", response_model=EmailDraftRead, status_code=201)
def create_email_draft(
    payload: EmailDraftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_module_access(db, current_user, payload.source_module, "write")
    data = payload.model_dump(mode="json")
    draft = EmailDraft(created_by=current_user.id, **data)
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


@router.patch("/email-drafts/{draft_id}", response_model=EmailDraftRead)
def update_email_draft(
    draft_id: uuid.UUID,
    payload: EmailDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    draft = _get_draft_or_404(db, draft_id, current_user)
    _require_module_access(db, current_user, draft.source_module, "write")

    data = payload.model_dump(mode="json", exclude_unset=True)
    for field, value in data.items():
        setattr(draft, field, value)

    db.commit()
    db.refresh(draft)
    return draft


@router.delete("/email-drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_email_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    draft = _get_draft_or_404(db, draft_id, current_user)
    _require_module_access(db, current_user, draft.source_module, "write")
    db.delete(draft)
    db.commit()
