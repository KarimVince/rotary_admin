import pytest

pytestmark = pytest.mark.integration

PPTX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)


def test_get_current_template_returns_null_when_none_uploaded(admin_client):
    response = admin_client.get("/api/v1/ppt-templates/current")
    assert response.status_code == 200
    assert response.json() is None


def test_admin_can_upload_ppt_template(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual2026.pptx", b"fake-pptx-bytes", PPTX_CONTENT_TYPE)},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["original_filename"] == "Annual2026.pptx"
    assert body["uploaded_by_name"] is not None

    get_response = admin_client.get("/api/v1/ppt-templates/current")
    assert get_response.status_code == 200
    assert get_response.json()["original_filename"] == "Annual2026.pptx"


def test_uploading_again_replaces_the_previous_template(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))

    admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("First.pptx", b"first-bytes", PPTX_CONTENT_TYPE)},
    )
    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Second.pptx", b"second-bytes", PPTX_CONTENT_TYPE)},
    )

    assert response.status_code == 201
    assert response.json()["original_filename"] == "Second.pptx"

    get_response = admin_client.get("/api/v1/ppt-templates/current")
    assert get_response.json()["original_filename"] == "Second.pptx"

    # Only one file on disk for the year — the replace overwrote it in place.
    stored_files = list((tmp_path / "ppt-templates").glob("*.pptx"))
    assert len(stored_files) == 1
    assert stored_files[0].read_bytes() == b"second-bytes"


def test_upload_rejects_non_pptx_extension(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_rejects_oversized_file(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))
    monkeypatch.setattr("app.api.ppt_templates.MAX_TEMPLATE_BYTES", 10)

    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual.pptx", b"this-is-more-than-ten-bytes", PPTX_CONTENT_TYPE)},
    )

    assert response.status_code == 422


def test_delete_reverts_to_no_template(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))
    admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual.pptx", b"fake-pptx-bytes", PPTX_CONTENT_TYPE)},
    )

    response = admin_client.delete("/api/v1/ppt-templates")
    assert response.status_code == 204

    get_response = admin_client.get("/api/v1/ppt-templates/current")
    assert get_response.json() is None
    assert list((tmp_path / "ppt-templates").glob("*.pptx")) == []


def test_delete_with_no_template_returns_404(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))
    response = admin_client.delete("/api/v1/ppt-templates")
    assert response.status_code == 404


def test_non_admin_cannot_view_or_upload_template(user_client):
    assert user_client.get("/api/v1/ppt-templates/current").status_code == 403
    assert (
        user_client.post(
            "/api/v1/ppt-templates",
            files={"file": ("Annual.pptx", b"bytes", PPTX_CONTENT_TYPE)},
        ).status_code
        == 403
    )
    assert user_client.delete("/api/v1/ppt-templates").status_code == 403
