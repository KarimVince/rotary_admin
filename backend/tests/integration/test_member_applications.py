from datetime import date

import pytest

from app.core.email_client import EmailSendError

pytestmark = pytest.mark.integration


def _always_succeeds(**kwargs):
    pass


def _always_fails(**kwargs):
    raise EmailSendError("simulated failure")


def test_create_application_generates_a_pdf(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/member-applications",
        json={"name": "Prospective Member", "email": "prospect@example.com", "phone": "+85212345678"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Prospective Member"
    assert body["email"] == "prospect@example.com"
    assert body["email_sent_at"] is None
    assert body["whatsapp_sent_at"] is None
    assert body["pdf_url"].startswith("/static/applications/")

    stored_files = list((tmp_path / "applications").glob("*.pdf"))
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes()[:4] == b"%PDF"


def test_create_application_with_only_name(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/member-applications", json={"name": "Minimal Prospect"}
    )

    assert response.status_code == 201
    assert response.json()["email"] is None


def test_send_by_email_succeeds(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))
    monkeypatch.setattr("app.api.member_applications.send_email", _always_succeeds)

    application = admin_client.post(
        "/api/v1/member-applications",
        json={"name": "Prospect", "email": "prospect@example.com"},
    ).json()

    response = admin_client.post(
        f"/api/v1/member-applications/{application['id']}/send", json={"channel": "email"}
    )

    assert response.status_code == 200
    assert response.json()["email_sent_at"] is not None


def test_send_by_email_without_email_on_file_returns_422(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))

    application = admin_client.post(
        "/api/v1/member-applications", json={"name": "No Email Prospect"}
    ).json()

    response = admin_client.post(
        f"/api/v1/member-applications/{application['id']}/send", json={"channel": "email"}
    )

    assert response.status_code == 422


def test_send_by_email_failure_returns_502(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))
    monkeypatch.setattr("app.api.member_applications.send_email", _always_fails)

    application = admin_client.post(
        "/api/v1/member-applications",
        json={"name": "Prospect", "email": "prospect@example.com"},
    ).json()

    response = admin_client.post(
        f"/api/v1/member-applications/{application['id']}/send", json={"channel": "email"}
    )

    assert response.status_code == 502
    assert admin_client.get(f"/api/v1/member-applications/{application['id']}").json()[
        "email_sent_at"
    ] is None


def test_mark_sent_via_whatsapp_does_not_call_send_email(admin_client, monkeypatch, tmp_path):
    # Story 8.3: WhatsApp has no real integration yet — this must be a
    # pure DB-flag flip, same convention as fee invoices' manual channel.
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))

    def _fail_if_called(**kwargs):
        raise AssertionError("send_email should not be called for the whatsapp channel")

    monkeypatch.setattr("app.api.member_applications.send_email", _fail_if_called)

    application = admin_client.post(
        "/api/v1/member-applications",
        json={"name": "Prospect", "phone": "+85212345678"},
    ).json()

    response = admin_client.post(
        f"/api/v1/member-applications/{application['id']}/send", json={"channel": "whatsapp"}
    )

    assert response.status_code == 200
    assert response.json()["whatsapp_sent_at"] is not None


def test_download_returns_pdf_with_standardised_filename(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))

    application = admin_client.post(
        "/api/v1/member-applications", json={"name": "Prospect"}
    ).json()
    assert application["download_url"] == (
        f"/api/v1/member-applications/{application['id']}/download"
    )

    response = admin_client.get(application["download_url"])

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    # Story 15.11: one-off form, no rotary-year segment.
    assert response.headers["content-disposition"] == (
        f'attachment; filename="member-application_{date.today().isoformat()}.pdf"'
    )
    assert response.content[:4] == b"%PDF"


def test_download_not_found_returns_404(admin_client):
    response = admin_client.get(
        "/api/v1/member-applications/00000000-0000-0000-0000-000000000000/download"
    )

    assert response.status_code == 404


def test_send_application_not_found_returns_404(admin_client):
    response = admin_client.post(
        "/api/v1/member-applications/00000000-0000-0000-0000-000000000000/send",
        json={"channel": "email"},
    )

    assert response.status_code == 404


def test_non_admin_non_treasurer_cannot_create_application(user_client):
    response = user_client.post("/api/v1/member-applications", json={"name": "Prospect"})

    assert response.status_code == 403


def test_treasurer_cannot_create_application_without_a_grant(treasurer_client):
    # Matches this app's convention (see test_members.py's
    # test_treasurer_cannot_create_member): the "treasurer" User.role does
    # not itself grant matrix access — write still has to come through the
    # permission matrix (a board position or a Default User grant).
    response = treasurer_client.post("/api/v1/member-applications", json={"name": "Prospect"})

    assert response.status_code == 403


def test_user_with_directory_write_grant_can_create_application(
    build_client, make_user, make_app_function, make_permission_matrix_entry, monkeypatch, tmp_path
):
    monkeypatch.setattr("app.api.member_applications.settings.upload_dir", str(tmp_path))
    app_function = make_app_function(key="members.directory", label="Members — Directory")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )
    user = make_user(email="granted@example.com", role="user")

    response = build_client(user).post("/api/v1/member-applications", json={"name": "Prospect"})

    assert response.status_code == 201
