from datetime import date

import pytest

from app.api.ppt_templates import download_template_for_year
from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration

PPTX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)


def test_get_current_template_returns_null_when_none_uploaded(admin_client):
    response = admin_client.get("/api/v1/ppt-templates/current")
    assert response.status_code == 200
    assert response.json() is None


def test_admin_can_upload_ppt_template(admin_client, fake_storage):
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


def test_uploading_again_replaces_the_previous_template(admin_client, fake_storage):
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

    # Only one object stored for the year — the replace (x-upsert) overwrote
    # it in place, no orphan left behind.
    ppt_objects = [key for key in fake_storage if key[0] == "ppt-templates"]
    assert len(ppt_objects) == 1
    assert fake_storage[ppt_objects[0]] == b"second-bytes"


def test_upload_rejects_non_pptx_extension(admin_client, fake_storage):
    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_rejects_oversized_file(admin_client, fake_storage, monkeypatch):
    monkeypatch.setattr("app.api.ppt_templates.MAX_TEMPLATE_BYTES", 10)

    response = admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual.pptx", b"this-is-more-than-ten-bytes", PPTX_CONTENT_TYPE)},
    )

    assert response.status_code == 422


def test_delete_reverts_to_no_template(admin_client, fake_storage):
    admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual.pptx", b"fake-pptx-bytes", PPTX_CONTENT_TYPE)},
    )

    response = admin_client.delete("/api/v1/ppt-templates")
    assert response.status_code == 204

    get_response = admin_client.get("/api/v1/ppt-templates/current")
    assert get_response.json() is None
    assert [key for key in fake_storage if key[0] == "ppt-templates"] == []


def test_delete_with_no_template_returns_404(admin_client, fake_storage):
    response = admin_client.delete("/api/v1/ppt-templates")
    assert response.status_code == 404


def test_download_template_for_year_returns_none_when_absent(fake_storage):
    assert download_template_for_year(2026) is None


def test_download_template_for_year_returns_uploaded_bytes(admin_client, fake_storage):
    admin_client.post(
        "/api/v1/ppt-templates",
        files={"file": ("Annual.pptx", b"fake-pptx-bytes", PPTX_CONTENT_TYPE)},
    )

    result = download_template_for_year(rotary_year(date.today()))
    assert result is not None
    assert result.read() == b"fake-pptx-bytes"


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
