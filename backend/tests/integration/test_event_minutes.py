from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration

PDF_CONTENT_TYPE = "application/pdf"
DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@pytest.fixture(autouse=True)
def _grant_default_minutes_access(make_app_function, make_permission_matrix_entry):
    sheet = make_app_function(key="attendance.sheet", label="Dinner — Attendance Sheet")
    minutes = make_app_function(key="attendance.minutes", label="Dinner — Minutes")
    make_permission_matrix_entry(
        sheet.id, board_position_id=None, access_level="read", is_default_user=True
    )
    make_permission_matrix_entry(
        minutes.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _grant_write(make_app_function, make_permission_matrix_entry, key, board_position_id):
    app_function = make_app_function(key=key)
    make_permission_matrix_entry(app_function.id, board_position_id=board_position_id, access_level="write")


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
    user = make_user(email="secretary-minutes@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.sheet", position.id)
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.minutes", position.id)
    return build_client(user)


@pytest.fixture
def no_access_client(
    build_client,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    # A board position with an explicit no_access override on
    # attendance.minutes but still write on attendance.sheet — so it can
    # reach the event, but should never see its minutes.
    member = make_member(first_name="No", last_name="Access")
    user = make_user(email="no-access-minutes@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Chair Event")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.sheet", position.id)
    minutes = make_app_function(key="attendance.minutes")
    make_permission_matrix_entry(minutes.id, board_position_id=position.id, access_level="no_access")
    return build_client(user)


def _create_event(secretary_client) -> str:
    response = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "Dinner"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_write_user_can_add_text_minutes(secretary_client):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/text",
        json={"content_text": "Meeting opened at 7pm."},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["minutes_type"] == "text"
    assert body["content_text"] == "Meeting opened at 7pm."
    assert body["last_updated_by_name"] is not None


def test_write_user_can_upload_file_minutes(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.pdf", b"fake-pdf-bytes", PDF_CONTENT_TYPE)},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["minutes_type"] == "file"
    assert body["file_original_filename"] == "Minutes.pdf"
    assert body["file_size_bytes"] == len(b"fake-pdf-bytes")

    minutes_objects = [key for key in fake_storage if key[0] == "event-minutes"]
    assert len(minutes_objects) == 1


def test_write_user_can_edit_text_minutes(secretary_client):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/text",
        json={"content_text": "Draft."},
    ).json()

    response = secretary_client.put(
        f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}/text",
        json={"content_text": "Final version."},
    )

    assert response.status_code == 200
    assert response.json()["content_text"] == "Final version."


def test_write_user_can_replace_uploaded_file(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("First.pdf", b"first-bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}/file",
        files={"file": ("Second.docx", b"second-bytes", DOCX_CONTENT_TYPE)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["file_original_filename"] == "Second.docx"

    # The old .pdf object was cleaned up, only the new .docx object remains.
    minutes_objects = [key for key in fake_storage if key[0] == "event-minutes"]
    assert len(minutes_objects) == 1
    assert minutes_objects[0][1].endswith(".docx")


def test_read_only_user_can_view_but_not_edit_or_delete(secretary_client, user_client):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/text",
        json={"content_text": "Visible to read-only users."},
    ).json()

    read_response = user_client.get(f"/api/v1/attendance/events/{event_id}/minutes")
    assert read_response.status_code == 200
    assert len(read_response.json()) == 1

    edit_response = user_client.put(
        f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}/text",
        json={"content_text": "Tampered."},
    )
    assert edit_response.status_code == 403

    delete_response = user_client.delete(f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}")
    assert delete_response.status_code == 403


def test_no_access_user_cannot_view_minutes(secretary_client, no_access_client):
    event_id = _create_event(secretary_client)
    secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/text",
        json={"content_text": "Should be hidden."},
    )

    response = no_access_client.get(f"/api/v1/attendance/events/{event_id}/minutes")
    assert response.status_code == 403


def test_upload_rejects_disallowed_extension(secretary_client):
    event_id = _create_event(secretary_client)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_rejects_oversized_file(secretary_client):
    event_id = _create_event(secretary_client)
    oversized = b"x" * (5 * 1024 * 1024 + 1)

    response = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.pdf", oversized, PDF_CONTENT_TYPE)},
    )

    assert response.status_code == 422


def test_download_returns_file_bytes(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.pdf", b"the-actual-bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.get(
        f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}/download"
    )

    assert response.status_code == 200
    assert response.content == b"the-actual-bytes"


def test_write_user_can_delete_minutes(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.pdf", b"bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.delete(f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}")
    assert response.status_code == 204

    list_response = secretary_client.get(f"/api/v1/attendance/events/{event_id}/minutes")
    assert list_response.json() == []
    assert not any(key[0] == "event-minutes" for key in fake_storage)


def test_editing_a_file_minutes_record_as_text_is_rejected(secretary_client, fake_storage):
    event_id = _create_event(secretary_client)
    created = secretary_client.post(
        f"/api/v1/attendance/events/{event_id}/minutes/file",
        files={"file": ("Minutes.pdf", b"bytes", PDF_CONTENT_TYPE)},
    ).json()

    response = secretary_client.put(
        f"/api/v1/attendance/events/{event_id}/minutes/{created['id']}/text",
        json={"content_text": "Should not work."},
    )

    assert response.status_code == 422
