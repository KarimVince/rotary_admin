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


def test_admin_can_edit_user_name_email_and_member_link(admin_client, make_member):
    member = make_member(first_name="Linked", last_name="Member")
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.patch(
        f"/api/v1/users/{created['id']}",
        json={
            "full_name": "Updated Name",
            "email": "updated.user@example.com",
            "member_id": str(member.id),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Updated Name"
    assert body["email"] == "updated.user@example.com"
    assert body["member_id"] == str(member.id)


def test_admin_can_unlink_member_by_setting_member_id_null(admin_client, make_member):
    member = make_member(first_name="Linked", last_name="Member")
    created = admin_client.post(
        "/api/v1/users", json=_create_payload(member_id=str(member.id))
    ).json()
    assert created["member_id"] == str(member.id)

    response = admin_client.patch(
        f"/api/v1/users/{created['id']}", json={"member_id": None}
    )

    assert response.status_code == 200
    assert response.json()["member_id"] is None


def test_editing_user_email_to_existing_address_returns_409(admin_client):
    admin_client.post("/api/v1/users", json=_create_payload(email="taken@example.com"))
    other = admin_client.post(
        "/api/v1/users", json=_create_payload(email="other@example.com")
    ).json()

    response = admin_client.patch(
        f"/api/v1/users/{other['id']}", json={"email": "taken@example.com"}
    )

    assert response.status_code == 409


def test_admin_cannot_demote_own_role(admin_client, make_user):
    # admin_client is authenticated as the "admin-fixture@example.com" user;
    # fetch that user's id via /auth/me equivalent — list_users and match by email.
    users = admin_client.get("/api/v1/users").json()
    self_user = next(u for u in users if u["email"] == "admin-fixture@example.com")

    response = admin_client.patch(f"/api/v1/users/{self_user['id']}", json={"role": "user"})

    assert response.status_code == 400


def test_admin_cannot_deactivate_own_account(admin_client):
    users = admin_client.get("/api/v1/users").json()
    self_user = next(u for u in users if u["email"] == "admin-fixture@example.com")

    response = admin_client.patch(
        f"/api/v1/users/{self_user['id']}", json={"is_active": False}
    )

    assert response.status_code == 400


def test_admin_can_still_edit_own_name_and_email(admin_client):
    users = admin_client.get("/api/v1/users").json()
    self_user = next(u for u in users if u["email"] == "admin-fixture@example.com")

    response = admin_client.patch(
        f"/api/v1/users/{self_user['id']}", json={"full_name": "New Name For Self"}
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name For Self"


def _always_succeeds(**kwargs):
    return None


def _always_fails(**kwargs):
    from app.core.email_client import EmailSendError

    raise EmailSendError("boom")


def test_admin_can_trigger_password_reset_email(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.users.send_email", _always_succeeds)
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.post(f"/api/v1/users/{created['id']}/reset-password")

    assert response.status_code == 200


def test_password_reset_for_unknown_user_returns_404(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.users.send_email", _always_succeeds)

    response = admin_client.post(
        "/api/v1/users/00000000-0000-0000-0000-000000000000/reset-password"
    )

    assert response.status_code == 404


def test_password_reset_email_failure_returns_502(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.users.send_email", _always_fails)
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.post(f"/api/v1/users/{created['id']}/reset-password")

    assert response.status_code == 502


def test_non_admin_cannot_trigger_password_reset(user_client, admin_client, monkeypatch):
    monkeypatch.setattr("app.api.users.send_email", _always_succeeds)
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = user_client.post(f"/api/v1/users/{created['id']}/reset-password")

    assert response.status_code == 403


def test_admin_can_delete_user(admin_client):
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = admin_client.delete(f"/api/v1/users/{created['id']}")

    assert response.status_code == 204
    remaining_emails = [u["email"] for u in admin_client.get("/api/v1/users").json()]
    assert created["email"] not in remaining_emails


def test_non_admin_cannot_delete_user(user_client, admin_client):
    created = admin_client.post("/api/v1/users", json=_create_payload()).json()

    response = user_client.delete(f"/api/v1/users/{created['id']}")

    assert response.status_code == 403


def test_admin_cannot_delete_own_account(admin_client):
    users = admin_client.get("/api/v1/users").json()
    self_user = next(u for u in users if u["email"] == "admin-fixture@example.com")

    response = admin_client.delete(f"/api/v1/users/{self_user['id']}")

    assert response.status_code == 403


def test_delete_nonexistent_user_returns_404(admin_client):
    response = admin_client.delete("/api/v1/users/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_deleting_user_with_donation_history_returns_409(
    admin_client, make_organisation, db_session
):
    from datetime import date

    from app.models import Donation

    created = admin_client.post("/api/v1/users", json=_create_payload()).json()
    org = make_organisation(name="History Org")
    # Attribute a donation to the newly created user directly via the DB —
    # simplest way to reproduce an FK-referenced user regardless of which
    # endpoint(s) actually set created_by today.
    db_session.add(
        Donation(
            organisation_id=org.id,
            amount=100,
            currency="HKD",
            donation_date=date(2025, 1, 1),
            rotary_year=2024,
            created_by=created["id"],
        )
    )
    db_session.commit()

    response = admin_client.delete(f"/api/v1/users/{created['id']}")

    assert response.status_code == 409
    remaining_emails = [u["email"] for u in admin_client.get("/api/v1/users").json()]
    assert created["email"] in remaining_emails
