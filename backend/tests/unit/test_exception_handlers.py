import json

import pytest
from fastapi import Request

from app.core.exception_handlers import unhandled_exception_handler

pytestmark = pytest.mark.unit


def _make_request() -> Request:
    scope = {"type": "http", "method": "GET", "path": "/api/v1/whatever", "headers": []}
    return Request(scope)


async def test_unhandled_exception_handler_returns_consistent_json_shape():
    response = await unhandled_exception_handler(_make_request(), RuntimeError("boom"))

    assert response.status_code == 500
    assert json.loads(response.body) == {"detail": "Internal server error"}
