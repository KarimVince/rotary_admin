from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.access_control import AccessLevel, get_access
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    user = db.get(User, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive"
        )

    return user


def require_role(*allowed_roles: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return current_user

    return dependency


require_admin = require_role("admin")
require_user = require_role("user", "admin")


def get_client_ip(request: Request) -> str | None:
    """STORY 16.34 — the client's IP for the login audit log. Render's edge
    proxies to this app's container (see `render.yaml` — plain `uvicorn`,
    no nginx/gunicorn in front, no `ProxyHeadersMiddleware` configured), so
    `request.client.host` would report the proxy's own internal address,
    not the real caller — `X-Forwarded-For`'s first (leftmost/original
    client) entry is what actually identifies the requester. Falls back to
    `request.client.host` for local/dev runs where there's no proxy at all."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def require_access(function_key: str, level: AccessLevel = "read"):
    """Gate an endpoint on the permission matrix (Story 9.4). `level` is the
    minimum required: 'read' also passes for users with 'write'."""

    def dependency(
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> User:
        resolved = get_access(db, current_user, function_key)
        order = {"no_access": 0, "read": 1, "write": 2}
        if order[resolved] < order[level]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return current_user

    return dependency
