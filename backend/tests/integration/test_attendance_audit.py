from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration

PDF_CONTENT_TYPE = "application/pdf"


@pytest.fixture(autouse=True)
def _grant_default_sheet_access(make_app_function, make_permission_matrix_entry):
    sheet = make_app_function(key="attendance.sheet", label="Dinner — Attendance Sheet")
    make_permission_matrix_entry(
        sheet.id, board_position_id=None, access_level="read", is_default_user=True
    )


@pytest.fixture
def secretary_client(
    build_client,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member(first_name="Sec", last_name="Retary")
    user = make_user(email="secretary-audit@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    app_function = make_app_function(key="attendance.sheet")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")
    return build_client(user)


def _create_event(secretary_client) -> str:
    response = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "Dinner"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_write_user_can_upload_completed_sheet(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.pdf", b"fake-pdf-bytes", PDF_CONTENT_TYPE)},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["file_original_filename"] == "Completed.pdf"
    assert body["file_size_bytes"] == len(b"fake-pdf-bytes")
    assert body["uploaded_by_name"] is not None

    # Stored in the shared event-minutes bucket, under the audit/ prefix.
    audit_objects = [key for key in fake_storage if key[0] == "event-minutes" and key[1].startswith("audit/")]
    assert len(audit_objects) == 1


def test_multiple_uploads_are_kept_as_separate_audit_records(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("First.pdf", b"first-bytes", PDF_CONTENT_TYPE)},
    )
    secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Second.pdf", b"second-bytes", PDF_CONTENT_TYPE)},
    )

    response = secretary_client.get(f"/api/v1/attendance/events/{event_id}/audit")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_read_only_user_can_view_but_not_upload_or_delete(secretary_client, user_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.pdf", b"bytes", PDF_CONTENT_TYPE)},
    ).json()

    read_response = user_client.get(f"/api/v1/attendance/events/{event_id}/audit")
    assert read_response.status_code == 200
    assert len(read_response.json()) == 1

    upload_response = user_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Second.pdf", b"bytes", PDF_CONTENT_TYPE)},
    )
    assert upload_response.status_code == 403

    delete_response = user_client.delete(f"/api/v1/attendance/events/{event_id}/audit/{created['id']}")
    assert delete_response.status_code == 403


def test_upload_rejects_disallowed_extension(secretary_client):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_accepts_scanned_image(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Scan.jpg", b"fake-jpg-bytes", "image/jpeg")},
    )

    assert response.status_code == 201
    assert response.json()["file_content_type"] == "image/jpeg"


def test_upload_rejects_oversized_file(secretary_client):
    event_id = _create_event(secretary_client)
    oversized = b"x" * (10 * 1024 * 1024 + 1)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.pdf", oversized, PDF_CONTENT_TYPE)},
    )

    assert response.status_code == 422


def test_download_returns_file_bytes(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.pdf", b"the-actual-bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.get(
        f"/api/v1/attendance/events/{event_id}/audit/{created['id']}/download"
    )

    assert response.status_code == 200
    assert response.content == b"the-actual-bytes"


def test_write_user_can_delete_audit_record(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/audit",
        files={"file": ("Completed.pdf", b"bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.delete(f"/api/v1/attendance/events/{event_id}/audit/{created['id']}")
    assert response.status_code == 204

    list_response = secretary_client.get(f"/api/v1/attendance/events/{event_id}/audit")
    assert list_response.json() == []
    assert not any(key[0] == "event-minutes" and key[1].startswith("audit/") for key in fake_storage)
