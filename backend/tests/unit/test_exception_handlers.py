import json

import pytest
from fastapi import Request

from app.core.config import settings
from app.core.exception_handlers import unhandled_exception_handler

pytestmark = pytest.mark.unit


def _make_request(origin: str | None = None) -> Request:
    headers = [(b"origin", origin.encode())] if origin else []
    scope = {"type": "http", "method": "GET", "path": "/api/v1/whatever", "headers": headers}
    return Request(scope)


async def test_unhandled_exception_handler_returns_consistent_json_shape():
    response = await unhandled_exception_handler(_make_request(), RuntimeError("boom"))

    assert response.status_code == 500
    assert json.loads(response.body) == {"detail": "Internal server error"}


async def test_unhandled_exception_handler_adds_cors_header_for_allowed_origin():
    # Starlette's ServerErrorMiddleware (which calls this handler) sits
    # outside CORSMiddleware, so a bare 500 never gets an
    # Access-Control-Allow-Origin header from CORSMiddleware itself — the
    # browser then reports a CORS failure instead of surfacing the real
    # error. This handler must add the header itself.
    allowed_origin = settings.cors_allowed_origins[0]
    response = await unhandled_exception_handler(
        _make_request(origin=allowed_origin), RuntimeError("boom")
    )

    assert response.headers["access-control-allow-origin"] == allowed_origin
    assert response.headers["vary"] == "Origin"


async def test_unhandled_exception_handler_omits_cors_header_for_disallowed_origin():
    response = await unhandled_exception_handler(
        _make_request(origin="https://not-allowed.example.com"), RuntimeError("boom")
    )

    assert "access-control-allow-origin" not in response.headers


async def test_unhandled_exception_handler_omits_cors_header_when_no_origin_sent():
    response = await unhandled_exception_handler(_make_request(), RuntimeError("boom"))

    assert "access-control-allow-origin" not in response.headers
