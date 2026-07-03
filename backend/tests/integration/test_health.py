import pytest

pytestmark = pytest.mark.integration


def test_health_check_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
