import pytest

from app.core.config import settings

pytestmark = pytest.mark.integration


def test_cors_allows_a_configured_origin(client):
    origin = settings.cors_allowed_origins[0]

    response = client.get("/api/v1/health", headers={"Origin": origin})

    assert response.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_an_unlisted_origin(client):
    response = client.get(
        "/api/v1/health", headers={"Origin": "http://not-an-allowed-origin.example.com"}
    )

    assert "access-control-allow-origin" not in response.headers
