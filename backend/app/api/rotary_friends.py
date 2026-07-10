import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.core.tags import split_tags
from app.models import RotaryFriend
from app.schemas.member_statistics import LabelValue
from app.schemas.rotary_friend import (
    RotaryFriendCreate,
    RotaryFriendRead,
    RotaryFriendUpdate,
)
from app.schemas.rotary_friend_statistics import RotaryFriendStatistics

router = APIRouter()

FRIENDS_DIRECTORY = "friends.directory"
FRIENDS_STATISTICS = "friends.statistics"


@router.get("/rotary-friends", response_model=list[RotaryFriendRead])
def list_rotary_friends(
    search: str | None = Query(
        None, description="Case-insensitive match on name, email, or tags"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_DIRECTORY, "read")),
):
    query = db.query(RotaryFriend)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                RotaryFriend.first_name.ilike(term),
                RotaryFriend.last_name.ilike(term),
                RotaryFriend.email.ilike(term),
                RotaryFriend.tags.ilike(term),
            )
        )
    return query.order_by(RotaryFriend.last_name, RotaryFriend.first_name).all()


@router.get("/rotary-friends/statistics", response_model=RotaryFriendStatistics)
def rotary_friend_statistics(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_STATISTICS, "read")),
):
    friends = db.query(RotaryFriend).all()

    source_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}
    contactability_counts = {"Email only": 0, "WhatsApp only": 0, "Both": 0}

    for friend in friends:
        if friend.source:
            source_counts[friend.source] = source_counts.get(friend.source, 0) + 1
        for tag in split_tags(friend.tags):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

        has_email = bool(friend.email)
        has_whatsapp = bool(friend.whatsapp)
        if has_email and has_whatsapp:
            contactability_counts["Both"] += 1
        elif has_email:
            contactability_counts["Email only"] += 1
        elif has_whatsapp:
            contactability_counts["WhatsApp only"] += 1

    return RotaryFriendStatistics(
        total_friends=len(friends),
        by_source=[
            LabelValue(label=label, value=count) for label, count in sorted(source_counts.items())
        ],
        by_tag=[
            LabelValue(label=label, value=count) for label, count in sorted(tag_counts.items())
        ],
        contactability=[
            LabelValue(label=label, value=count)
            for label, count in contactability_counts.items()
            if count > 0
        ],
    )


@router.post("/rotary-friends", response_model=RotaryFriendRead, status_code=201)
def create_rotary_friend(
    payload: RotaryFriendCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_DIRECTORY, "write")),
):
    friend = RotaryFriend(**payload.model_dump())
    db.add(friend)
    db.commit()
    db.refresh(friend)
    return friend


@router.get("/rotary-friends/{friend_id}", response_model=RotaryFriendRead)
def get_rotary_friend(
    friend_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_DIRECTORY, "read")),
):
    friend = db.get(RotaryFriend, friend_id)
    if friend is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rotary friend not found"
        )
    return friend


@router.patch("/rotary-friends/{friend_id}", response_model=RotaryFriendRead)
def update_rotary_friend(
    friend_id: uuid.UUID,
    payload: RotaryFriendUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_DIRECTORY, "write")),
):
    friend = db.get(RotaryFriend, friend_id)
    if friend is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rotary friend not found"
        )

    update_data = payload.model_dump(exclude_unset=True)
    resulting_email = update_data.get("email", friend.email)
    resulting_whatsapp = update_data.get("whatsapp", friend.whatsapp)
    if resulting_email is None and resulting_whatsapp is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either email or whatsapp is required",
        )

    for field, value in update_data.items():
        setattr(friend, field, value)

    db.commit()
    db.refresh(friend)
    return friend


@router.delete("/rotary-friends/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rotary_friend(
    friend_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FRIENDS_DIRECTORY, "write")),
):
    friend = db.get(RotaryFriend, friend_id)
    if friend is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rotary friend not found"
        )

    db.delete(friend)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
