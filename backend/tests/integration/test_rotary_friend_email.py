import pytest

from app.core.email_client import EmailSendError

pytestmark = pytest.mark.integration


def _create_friend(admin_client, **overrides):
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com",
    }
    payload.update(overrides)
    return admin_client.post("/api/v1/rotary-friends", json=payload).json()


def _always_succeeds(**_kwargs):
    return None


def _always_fails(**_kwargs):
    raise EmailSendError("simulated failure")


def _grant_send_email_access(make_app_function, make_permission_matrix_entry, access_level):
    app_function = make_app_function(
        key="friends.send_message", label="Friends of Rotary — Send Message"
    )
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level=access_level, is_default_user=True
    )


def test_non_admin_cannot_send_email(user_client):
    response = user_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )
    assert response.status_code == 403


def test_treasurer_cannot_send_email(treasurer_client):
    response = treasurer_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )
    assert response.status_code == 403


def test_user_with_write_access_can_send_email(
    user_client, make_app_function, make_permission_matrix_entry, monkeypatch
):
    _grant_send_email_access(make_app_function, make_permission_matrix_entry, "write")
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)

    response = user_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )
    assert response.status_code == 200


def test_user_with_read_only_access_cannot_send_email(
    user_client, make_app_function, make_permission_matrix_entry
):
    _grant_send_email_access(make_app_function, make_permission_matrix_entry, "read")

    response = user_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )
    assert response.status_code == 403


def test_user_with_read_only_access_can_view_email_log(
    user_client, make_app_function, make_permission_matrix_entry
):
    _grant_send_email_access(make_app_function, make_permission_matrix_entry, "read")

    response = user_client.get("/api/v1/rotary-friends/email-log")
    assert response.status_code == 200


def test_requires_a_recipient_selector(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends/email", json={"subject": "Hi", "body": "Hello"}
    )
    assert response.status_code == 422


def test_rejects_multiple_recipient_selectors(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={
            "subject": "Hi",
            "body": "Hello",
            "recipient_group": "all",
            "tag": "donor",
        },
    )
    assert response.status_code == 422


def test_email_all_friends_succeeds(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)

    _create_friend(admin_client, email="a@example.com")
    _create_friend(admin_client, email="b@example.com")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Newsletter", "body": "<p>Hello</p>", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "sent"
    assert body["recipient_count"] == 2
    assert body["success_count"] == 2
    assert body["failure_count"] == 0
    assert body["skipped_no_email_count"] == 0


def test_email_by_tag_only_matches_friends_with_that_tag(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)

    _create_friend(admin_client, email="donor@example.com", tags="donor, alumni")
    _create_friend(admin_client, email="sponsor@example.com", tags="sponsor")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Donor update", "body": "Hi", "tag": "donor"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recipient_count"] == 1
    assert body["success_count"] == 1


def test_email_explicit_friend_ids_ignores_tag(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)

    target = _create_friend(admin_client, email="target@example.com", tags="sponsor")
    other = _create_friend(admin_client, email="other@example.com", tags="sponsor")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Just you", "body": "Hi", "friend_ids": [target["id"]]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recipient_count"] == 1
    assert other["id"]


def test_email_skips_whatsapp_only_friends_and_reports_them(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)

    _create_friend(admin_client, email="has-email@example.com")
    admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Whats", "last_name": "App", "whatsapp": "+85298765432"},
    )

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recipient_count"] == 1
    assert body["skipped_no_email_count"] == 1


def test_email_all_recipients_failing_is_logged_as_failed(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_fails)
    _create_friend(admin_client, email="a@example.com")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["success_count"] == 0
    assert body["failure_count"] == 1


def test_partial_failure_is_logged_distinctly(admin_client, monkeypatch):
    def _fail_for_b(*, to_email, **_kwargs):
        if to_email == "b@example.com":
            raise EmailSendError("simulated failure")

    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _fail_for_b)
    _create_friend(admin_client, email="a@example.com")
    _create_friend(admin_client, email="b@example.com")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial_failure"
    assert body["success_count"] == 1
    assert body["failure_count"] == 1


def test_email_with_attachments_passes_them_to_sender_and_logs_has_attachments(
    admin_client, monkeypatch
):
    captured = {}

    def _capture(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _capture)
    _create_friend(admin_client, email="a@example.com")

    response = admin_client.post(
        "/api/v1/rotary-friends/email",
        json={
            "subject": "Newsletter",
            "body": "<p>Hello</p>",
            "recipient_group": "all",
            "attachments": [
                {"filename": "newsletter.pdf", "url": "http://localhost:8000/static/x.pdf"}
            ],
        },
    )

    assert response.status_code == 200
    assert captured["attachments"] == {"newsletter.pdf": "http://localhost:8000/static/x.pdf"}

    log_response = admin_client.get("/api/v1/rotary-friends/email-log")
    assert log_response.json()[0]["has_attachments"] is True


def test_email_without_attachments_logs_has_attachments_false(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)
    _create_friend(admin_client, email="a@example.com")

    admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    log_response = admin_client.get("/api/v1/rotary-friends/email-log")
    assert log_response.json()[0]["has_attachments"] is False


def test_non_admin_cannot_view_email_log(user_client):
    response = user_client.get("/api/v1/rotary-friends/email-log")
    assert response.status_code == 403


def test_email_log_only_shows_rotary_friends_source_module(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.rotary_friend_email.send_email", _always_succeeds)
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)

    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "member@example.com",
            "join_date": "2020-01-15",
        },
    )
    admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Member send", "body": "Hi", "recipient_group": "all"},
    )

    _create_friend(admin_client, email="friend@example.com")
    admin_client.post(
        "/api/v1/rotary-friends/email",
        json={"subject": "Friend send", "body": "Hi", "recipient_group": "all"},
    )

    response = admin_client.get("/api/v1/rotary-friends/email-log")

    assert response.status_code == 200
    subjects = [entry["subject"] for entry in response.json()]
    assert subjects == ["Friend send"]
