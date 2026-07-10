import time
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.core.rotary_year import rotary_year
from app.models import AppFunction, BoardPosition, BoardPositionAssignment, PermissionMatrix, User

AccessLevel = Literal["no_access", "read", "write"]

_ACCESS_LEVEL_ORDER: dict[AccessLevel, int] = {"no_access": 0, "read": 1, "write": 2}

# Permission resolution is cached per (user, function) for a short TTL so a
# page rendering many gated elements doesn't re-run the matrix lookup once
# per element. Deliberately process-local and small-scale — this app has a
# handful of users, not enough to warrant a real cache backend.
_CACHE_TTL_SECONDS = 30.0
_cache: dict[tuple[str, str], tuple[AccessLevel, float]] = {}


def clear_access_cache() -> None:
    """Drop all cached resolutions — call after any change to board position
    assignments, the permission matrix, or board position active/deactive
    state so the effect is visible immediately rather than waiting out the TTL."""
    _cache.clear()


def get_access(db: Session, user: User, function_key: str) -> AccessLevel:
    if user.role == "admin":
        return "write"

    cache_key = (str(user.id), function_key)
    now = time.monotonic()
    cached = _cache.get(cache_key)
    if cached is not None and cached[1] > now:
        return cached[0]

    level = _resolve_access(db, user, function_key)
    _cache[cache_key] = (level, now + _CACHE_TTL_SECONDS)
    return level


def _resolve_access(db: Session, user: User, function_key: str) -> AccessLevel:
    if user.member_id is None:
        return _default_user_access(db, function_key)

    current_year = rotary_year(date.today())
    held_position_ids = [
        row[0]
        for row in (
            db.query(BoardPositionAssignment.board_position_id)
            .join(BoardPosition, BoardPositionAssignment.board_position_id == BoardPosition.id)
            .filter(
                BoardPositionAssignment.member_id == user.member_id,
                BoardPositionAssignment.rotary_year == current_year,
                BoardPosition.active.is_(True),
            )
            .all()
        )
    ]

    if not held_position_ids:
        return _default_user_access(db, function_key)

    app_function = db.query(AppFunction).filter(AppFunction.key == function_key).first()
    if app_function is None:
        return "no_access"

    levels = [
        row[0]
        for row in (
            db.query(PermissionMatrix.access_level)
            .filter(
                PermissionMatrix.app_function_id == app_function.id,
                PermissionMatrix.board_position_id.in_(held_position_ids),
            )
            .all()
        )
    ]

    if not levels:
        return "no_access"

    return max(levels, key=lambda level: _ACCESS_LEVEL_ORDER[level])


def _default_user_access(db: Session, function_key: str) -> AccessLevel:
    app_function = db.query(AppFunction).filter(AppFunction.key == function_key).first()
    if app_function is None:
        return "no_access"

    entry = (
        db.query(PermissionMatrix)
        .filter(
            PermissionMatrix.app_function_id == app_function.id,
            PermissionMatrix.is_default_user.is_(True),
        )
        .first()
    )
    return entry.access_level if entry is not None else "no_access"
