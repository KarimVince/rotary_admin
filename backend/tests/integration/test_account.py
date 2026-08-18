import pytest

pytestmark = pytest.mark.integration


def _login(client, email, password):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_user_can_change_own_password(client, make_user, monkeypatch):
    make_user(email="pw-change@example.com", password="old-password123")
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: None)
    token = _login(client, "pw-change@example.com", "old-password123")

    response = client.put(
        "/api/v1/account/password",
        json={"current_password": "old-password123", "new_password": "new-password123"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 200

    old_login = client.post(
        "/api/v1/auth/login", json={"email": "pw-change@example.com", "password": "old-password123"}
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login", json={"email": "pw-change@example.com", "password": "new-password123"}
    )
    assert new_login.status_code == 200


def test_change_password_requires_correct_current_password(client, make_user):
    make_user(email="pw-wrong@example.com", password="old-password123")
    token = _login(client, "pw-wrong@example.com", "old-password123")

    response = client.put(
        "/api/v1/account/password",
        json={"current_password": "wrong-password", "new_password": "new-password123"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 400


def test_change_password_sends_notice_and_invalidates_sessions(client, make_user, monkeypatch):
    make_user(email="pw-notice@example.com", password="old-password123")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "pw-notice@example.com", "password": "old-password123"},
    )
    access_token = login_response.json()["access_token"]
    refresh_token = login_response.json()["refresh_token"]

    notices = []
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: notices.append(kwargs))

    response = client.put(
        "/api/v1/account/password",
        json={"current_password": "old-password123", "new_password": "new-password123"},
        headers=_auth_headers(access_token),
    )
    assert response.status_code == 200
    assert len(notices) == 1
    assert notices[0]["to_email"] == "pw-notice@example.com"

    refresh_response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 401


def test_unauthenticated_request_is_rejected(client):
    response = client.put(
        "/api/v1/account/password",
        json={"current_password": "whatever", "new_password": "new-password123"},
    )
    assert response.status_code == 401


def test_user_can_request_email_change(client, make_user, monkeypatch):
    make_user(email="email-change@example.com", password="password123")
    sent = {}
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: sent.update(kwargs))
    monkeypatch.setattr("app.api.account.generate_refresh_token", lambda: "email-change-token")
    token = _login(client, "email-change@example.com", "password123")

    response = client.post(
        "/api/v1/account/email/request",
        json={"new_email": "new-address@example.com", "current_password": "password123"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 200
    assert sent["to_email"] == "new-address@example.com"
    assert "email-change-token" in sent["html_body"]

    # Email is NOT changed yet — only after confirmation.
    me_response = client.get("/api/v1/auth/me", headers=_auth_headers(token))
    assert me_response.json()["email"] == "email-change@example.com"


def test_email_change_requires_correct_current_password(client, make_user):
    make_user(email="email-wrongpw@example.com", password="password123")
    token = _login(client, "email-wrongpw@example.com", "password123")

    response = client.post(
        "/api/v1/account/email/request",
        json={"new_email": "new-address@example.com", "current_password": "wrong"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 400


def test_email_change_rejects_email_already_in_use(client, make_user):
    make_user(email="taken@example.com", password="password123")
    make_user(email="requester@example.com", password="password123")
    token = _login(client, "requester@example.com", "password123")

    response = client.post(
        "/api/v1/account/email/request",
        json={"new_email": "taken@example.com", "current_password": "password123"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 409


def test_email_change_confirm_updates_email_and_notifies_old_address(client, make_user, monkeypatch):
    make_user(email="old-address@example.com", password="password123")
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: None)
    monkeypatch.setattr("app.api.account.generate_refresh_token", lambda: "confirm-me-token")
    token = _login(client, "old-address@example.com", "password123")

    client.post(
        "/api/v1/account/email/request",
        json={"new_email": "new-address2@example.com", "current_password": "password123"},
        headers=_auth_headers(token),
    )

    notices = []
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: notices.append(kwargs))

    confirm_response = client.post(
        "/api/v1/account/email/confirm", json={"token": "confirm-me-token"}
    )
    assert confirm_response.status_code == 200

    assert len(notices) == 1
    assert notices[0]["to_email"] == "old-address@example.com"

    login_with_new_email = client.post(
        "/api/v1/auth/login",
        json={"email": "new-address2@example.com", "password": "password123"},
    )
    assert login_with_new_email.status_code == 200


def test_email_change_confirm_token_is_single_use(client, make_user, monkeypatch):
    make_user(email="single-use@example.com", password="password123")
    monkeypatch.setattr("app.api.account.send_email", lambda **kwargs: None)
    monkeypatch.setattr("app.api.account.generate_refresh_token", lambda: "single-use-email-token")
    token = _login(client, "single-use@example.com", "password123")

    client.post(
        "/api/v1/account/email/request",
        json={"new_email": "brand-new@example.com", "current_password": "password123"},
        headers=_auth_headers(token),
    )

    first = client.post(
        "/api/v1/account/email/confirm", json={"token": "single-use-email-token"}
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/account/email/confirm", json={"token": "single-use-email-token"}
    )
    assert second.status_code == 400


def test_email_change_confirm_with_unknown_token_returns_400(client):
    response = client.post("/api/v1/account/email/confirm", json={"token": "not-a-real-token"})
    assert response.status_code == 400
