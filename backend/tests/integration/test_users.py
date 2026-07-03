import pytest

pytestmark = pytest.mark.integration


def _create_payload(**overrides):
    payload = {
        "email": "new.user@example.com",
        "password": "password123",
        "full_name": "New User",
        "role": "user",
    }
    payload.update(overrides)
    return payload


def test_admin_can_create_user(admin_client):
    response = admin_client.post("/api/v1/users", json=_create_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.user@example.com"
    assert body["role"] == "user"
    assert body["is_active"] is True
    assert "password" not in body
    assert "hashed_password" not in body


def test_non_admin_cannot_create_user(user_client):
    response = user_client.post("/api/v1/users", json=_create_payload())

    assert response.status_code == 403


def test_treasurer_cannot_create_user(treasurer_client):
    response = treasurer_client.post("/api/v1/users", json=_create_payload())

    assert response.status_code == 403


def test_create_user_duplicate_email_returns_409(admin_client):
    admin_client.post("/api/v1/users", json=_create_payload())

    response = admin_client.post("/api/v1/users", json=_create_payload())

    assert response.status_code == 409


def test_admin_can_list_users(admin_client):
    admin_client.post("/api/v1/users", json=_create_payload())

    response = admin_client.get("/api/v1/users")

    assert response.status_code == 200
    emails = [user["email"] for user in response.json()]
    assert "new.user@example.com" in emails


def test_non_admin_cannot_list_users(user_client):
    response = user_client.get("/api/v1/users")

    assert response.status_code == 403


def test_admin_can_change_user_role(admin_client):
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.patch(f"/api/v1/users/{created['id']}", json={"role": "treasurer"})

    assert response.status_code == 200
    assert response.json()["role"] == "treasurer"


def test_admin_can_deactivate_user(admin_client):
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.patch(f"/api/v1/users/{created['id']}", json={"is_active": False})

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_patch_nonexistent_user_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/users/00000000-0000-0000-0000-000000000000", json={"is_active": False}
    )

    assert response.status_code == 404


def test_admin_created_user_can_log_in_but_is_blocked_from_admin_routes(client, admin_client):
    admin_client.post("/api/v1/users", json=_create_payload())

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "new.user@example.com", "password": "password123"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]

    users_response = client.get(
        "/api/v1/users", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert users_response.status_code == 403
