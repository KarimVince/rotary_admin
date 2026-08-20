"""STORY 16.34 — Admin login audit log with graphical usage stats.

Confirmed with Karim before building: successful logins only (not failed
attempts — a separate security-alerting concern); IP address captured, not
device/user-agent; indefinite retention, no auto-purge; all three stats the
story itself suggests are implemented — logins-over-time trend, most-active
users, and a last-login-per-user quick-scan list."""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import ConnectionLog, User
from app.schemas.connection_log import (
    ConnectionLogRead,
    ConnectionLogStats,
    LastLoginEntry,
    LoginTrendPoint,
    MostActiveUser,
)

router = APIRouter()

KEY = "admin.connection_log"
# "Most active users" and the trend chart are windowed (indefinite
# retention doesn't mean every stat should be all-time — a lifetime
# "most active" ranking would just reward account age) — the raw log list
# below is unaffected and supports its own explicit date_from/date_to filter.
TREND_WINDOW_DAYS = 30


def _serialize(log: ConnectionLog, user: User) -> ConnectionLogRead:
    return ConnectionLogRead(
        id=log.id,
        user_id=log.user_id,
        user_email=user.email,
        user_full_name=user.full_name,
        ip_address=log.ip_address,
        created_at=log.created_at,
    )


@router.get("/connection-logs", response_model=list[ConnectionLogRead])
def list_connection_logs(
    user_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "read")),
):
    query = db.query(ConnectionLog, User).join(User, ConnectionLog.user_id == User.id)
    if user_id is not None:
        query = query.filter(ConnectionLog.user_id == user_id)
    if date_from is not None:
        query = query.filter(
            ConnectionLog.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        )
    if date_to is not None:
        # Inclusive of the whole `date_to` day.
        query = query.filter(
            ConnectionLog.created_at
            < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        )
    rows = query.order_by(ConnectionLog.created_at.desc()).all()
    return [_serialize(log, user) for log, user in rows]


@router.get("/connection-logs/stats", response_model=ConnectionLogStats)
def get_connection_log_stats(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_access(KEY, "read")),
):
    window_start = datetime.now(timezone.utc) - timedelta(days=TREND_WINDOW_DAYS)

    trend_rows = (
        db.query(func.date(ConnectionLog.created_at), func.count(ConnectionLog.id))
        .filter(ConnectionLog.created_at >= window_start)
        .group_by(func.date(ConnectionLog.created_at))
        .order_by(func.date(ConnectionLog.created_at))
        .all()
    )
    trend = [LoginTrendPoint(date=row[0], count=row[1]) for row in trend_rows]

    most_active_rows = (
        db.query(
            User.id, User.full_name, User.email, func.count(ConnectionLog.id).label("login_count")
        )
        .join(ConnectionLog, ConnectionLog.user_id == User.id)
        .filter(ConnectionLog.created_at >= window_start)
        .group_by(User.id, User.full_name, User.email)
        .order_by(func.count(ConnectionLog.id).desc())
        .limit(10)
        .all()
    )
    most_active = [
        MostActiveUser(user_id=row[0], full_name=row[1], email=row[2], login_count=row[3])
        for row in most_active_rows
    ]

    # Last-login-per-user reads straight off User.last_login_at — it's
    # already tracked there independent of this table's own retention, and
    # every user should appear (including one who's never logged in, with a
    # null last_login_at) rather than only users with at least one log row.
    users = db.query(User).order_by(User.last_login_at.desc().nullslast()).all()
    last_login = [
        LastLoginEntry(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            last_login_at=user.last_login_at,
        )
        for user in users
    ]

    return ConnectionLogStats(trend=trend, most_active=most_active, last_login=last_login)
