from datetime import date

import pytest

from app.core.sender_client import SenderAPIError
from app.models import Member

pytestmark = pytest.mark.integration


def _create_member(admin_client, **overrides):
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com",
        "join_date": "2020-01-15",
    }
    payload.update(overrides)
    return admin_client.post("/api/v1/members", json=payload).json()


def _always_succeeds(**_kwargs):
    return None


def _always_fails(**_kwargs):
    raise SenderAPIError("simulated failure")


def test_non_admin_cannot_send_email(user_client):
    response = user_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 403


def test_treasurer_cannot_send_email(treasurer_client):
    response = treasurer_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 403


def test_requires_a_recipient_selector(admin_client):
    response = admin_client.post(
        "/api/v1/members/email", json={"subject": "Hi", "body": "Hello"}
    )

    assert response.status_code == 422


def test_rejects_both_recipient_selectors(admin_client):
    _create_member(admin_client)

    response = admin_client.post(
        "/api/v1/members/email",
        json={
            "subject": "Hi",
            "body": "Hello",
            "recipient_group": "all",
            "member_ids": ["00000000-0000-0000-0000-000000000000"],
        },
    )

    assert response.status_code == 422


def test_email_all_active_members_succeeds(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)

    _create_member(admin_client, email="a@example.com")
    _create_member(admin_client, email="b@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Newsletter", "body": "<p>Hello</p>", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "sent"
    assert body["recipient_count"] == 2
    assert body["success_count"] == 2
    assert body["failure_count"] == 0


def test_email_active_group_excludes_past_members(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)

    active_member = _create_member(admin_client, email="active@example.com")
    past_member = _create_member(admin_client, email="past@example.com")
    admin_client.delete(f"/api/v1/members/{past_member['id']}")

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Active only", "body": "Hi", "recipient_group": "active"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recipient_count"] == 1
    assert body["success_count"] == 1
    assert active_member["id"]


def test_email_past_group_with_no_past_members_is_a_no_op(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)
    _create_member(admin_client, email="active-only@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "past"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "no_recipients"
    assert body["recipient_count"] == 0


def test_email_explicit_member_ids_ignores_status_filter(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)

    member = _create_member(admin_client, email="target@example.com")
    other = _create_member(admin_client, email="other@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Just you", "body": "Hi", "member_ids": [member["id"]]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["recipient_count"] == 1
    assert other["id"]


def test_email_all_recipients_failing_is_logged_as_failed(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_fails)
    _create_member(admin_client, email="a@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
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
            raise SenderAPIError("simulated failure")

    monkeypatch.setattr("app.api.member_email.send_email", _fail_for_b)
    _create_member(admin_client, email="a@example.com")
    _create_member(admin_client, email="b@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial_failure"
    assert body["success_count"] == 1
    assert body["failure_count"] == 1


def test_email_skips_members_without_an_email_address(admin_client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)

    no_email_member = Member(first_name="No", last_name="Email", join_date=date(2020, 1, 1))
    db_session.add(no_email_member)
    db_session.commit()

    response = admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    assert response.status_code == 200
    assert response.json()["recipient_count"] == 0


def test_admin_can_upload_email_attachment(admin_client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.member_email.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/members/email/attachments",
        files={"file": ("newsletter.pdf", b"fake-pdf-bytes", "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "newsletter.pdf"
    assert body["url"].startswith("http://localhost:8000/static/email-attachments/")
    assert body["url"].endswith(".pdf")


def test_non_admin_cannot_upload_email_attachment(user_client):
    response = user_client.post(
        "/api/v1/members/email/attachments",
        files={"file": ("newsletter.pdf", b"fake-pdf-bytes", "application/pdf")},
    )

    assert response.status_code == 403


def test_upload_email_attachment_rejects_oversized_file(admin_client, tmp_path, monkeypatch):
    monkeypatch.setattr("app.api.member_email.settings.upload_dir", str(tmp_path))
    monkeypatch.setattr("app.api.member_email.settings.max_email_attachment_bytes", 10)

    response = admin_client.post(
        "/api/v1/members/email/attachments",
        files={"file": ("big.pdf", b"this-is-more-than-ten-bytes", "application/pdf")},
    )

    assert response.status_code == 422


def test_email_with_attachments_passes_them_to_sender_and_logs_has_attachments(
    admin_client, monkeypatch
):
    captured = {}

    def _capture(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("app.api.member_email.send_email", _capture)
    _create_member(admin_client, email="a@example.com")

    response = admin_client.post(
        "/api/v1/members/email",
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

    log_response = admin_client.get("/api/v1/members/email-log")
    assert log_response.json()[0]["has_attachments"] is True


def test_email_without_attachments_logs_has_attachments_false(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)
    _create_member(admin_client, email="a@example.com")

    admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Hi", "body": "Hello", "recipient_group": "all"},
    )

    log_response = admin_client.get("/api/v1/members/email-log")
    assert log_response.json()[0]["has_attachments"] is False


def test_non_admin_cannot_view_email_log(user_client):
    response = user_client.get("/api/v1/members/email-log")

    assert response.status_code == 403


def test_email_log_lists_past_sends_most_recent_first(admin_client, monkeypatch):
    monkeypatch.setattr("app.api.member_email.send_email", _always_succeeds)
    _create_member(admin_client, email="a@example.com")

    admin_client.post(
        "/api/v1/members/email",
        json={"subject": "First", "body": "Hi", "recipient_group": "all"},
    )
    admin_client.post(
        "/api/v1/members/email",
        json={"subject": "Second", "body": "Hi", "recipient_group": "all"},
    )

    response = admin_client.get("/api/v1/members/email-log")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["subject"] == "Second"
    assert body[1]["subject"] == "First"
    assert body[0]["recipient_count"] == 1
    assert body[0]["status"] == "sent"
