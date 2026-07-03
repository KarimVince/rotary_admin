import pytest

pytestmark = pytest.mark.integration


def test_login_success_returns_tokens_and_no_cookies(client, make_user):
    make_user(email="login@example.com", password="password123", role="admin")

    response = client.post(
        "/api/v1/auth/login", json={"email": "login@example.com", "password": "password123"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]
    assert response.cookies == {}


def test_login_wrong_password_returns_401(client, make_user):
    make_user(email="login2@example.com", password="password123")

    response = client.post(
        "/api/v1/auth/login", json={"email": "login2@example.com", "password": "wrong-password"}
    )

    assert response.status_code == 401


def test_login_unknown_email_returns_401(client):
    response = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever"}
    )

    assert response.status_code == 401


def test_login_inactive_user_returns_401(client, make_user):
    make_user(email="inactive@example.com", password="password123", is_active=False)

    response = client.post(
        "/api/v1/auth/login", json={"email": "inactive@example.com", "password": "password123"}
    )

    assert response.status_code == 401


def test_me_returns_current_user_for_valid_token(client, make_user):
    make_user(email="me@example.com", password="password123", full_name="Me Example")
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "me@example.com", "password": "password123"}
    )
    access_token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "me@example.com"
    assert body["full_name"] == "Me Example"


def test_me_without_token_returns_401(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


def test_me_with_garbage_token_returns_401(client):
    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401


def test_refresh_issues_new_tokens(client, make_user):
    make_user(email="refresh@example.com", password="password123")
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "refresh@example.com", "password": "password123"}
    )
    old_refresh_token = login_response.json()["refresh_token"]

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh_token})

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"] != old_refresh_token


def test_refresh_token_is_single_use(client, make_user):
    make_user(email="rotate@example.com", password="password123")
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "rotate@example.com", "password": "password123"}
    )
    refresh_token = login_response.json()["refresh_token"]

    first_use = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert first_use.status_code == 200

    second_use = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert second_use.status_code == 401


def test_refresh_with_invalid_token_returns_401(client):
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-real-token"})

    assert response.status_code == 401


def test_protected_route_rejects_missing_and_invalid_tokens(client):
    no_token_response = client.get("/api/v1/member-titles")
    assert no_token_response.status_code == 401

    invalid_token_response = client.get(
        "/api/v1/member-titles", headers={"Authorization": "Bearer garbage"}
    )
    assert invalid_token_response.status_code == 401
