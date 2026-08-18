from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


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
    user = make_user(email="secretary-important-info@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(
        make_app_function, make_permission_matrix_entry, "admin.important_information", position.id
    )
    return build_client(user)


def test_active_endpoint_returns_null_when_no_message(user_client):
    response = user_client.get("/api/v1/important-information/active")
    assert response.status_code == 200
    assert response.json() is None


def test_regular_user_cannot_manage_messages(user_client):
    create = user_client.post(
        "/api/v1/important-information", json={"title": "Heads up", "text": "Something urgent."}
    )
    assert create.status_code == 403

    listing = user_client.get("/api/v1/important-information")
    assert listing.status_code == 403


def test_write_user_can_create_message_and_it_becomes_active(secretary_client, user_client):
    response = secretary_client.post(
        "/api/v1/important-information",
        json={"title": "AGM this Saturday", "text": "Don't forget the AGM at 10am."},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["created_by_name"] is not None

    # Any authenticated user (not just Write users) sees the active banner.
    active = user_client.get("/api/v1/important-information/active")
    assert active.status_code == 200
    assert active.json()["title"] == "AGM this Saturday"


def test_creating_a_new_message_archives_the_previous_active_one(secretary_client):
    first = secretary_client.post(
        "/api/v1/important-information", json={"title": "First", "text": "First message."}
    ).json()

    second = secretary_client.post(
        "/api/v1/important-information", json={"title": "Second", "text": "Second message."}
    ).json()
    assert second["status"] == "active"

    listing = secretary_client.get("/api/v1/important-information").json()
    statuses = {item["id"]: item["status"] for item in listing}
    assert statuses[first["id"]] == "archived"
    assert statuses[second["id"]] == "active"

    active = secretary_client.get("/api/v1/important-information/active").json()
    assert active["id"] == second["id"]


def test_archived_message_can_be_reactivated_and_archives_current_active(secretary_client):
    first = secretary_client.post(
        "/api/v1/important-information", json={"title": "First", "text": "First message."}
    ).json()
    second = secretary_client.post(
        "/api/v1/important-information", json={"title": "Second", "text": "Second message."}
    ).json()

    reactivate = secretary_client.post(f"/api/v1/important-information/{first['id']}/reactivate")
    assert reactivate.status_code == 200
    assert reactivate.json()["status"] == "active"
    assert reactivate.json()["archived_at"] is None

    listing = {
        item["id"]: item["status"]
        for item in secretary_client.get("/api/v1/important-information").json()
    }
    assert listing[first["id"]] == "active"
    assert listing[second["id"]] == "archived"


def test_reactivating_an_already_active_message_returns_400(secretary_client):
    message = secretary_client.post(
        "/api/v1/important-information", json={"title": "Only", "text": "Only message."}
    ).json()

    response = secretary_client.post(f"/api/v1/important-information/{message['id']}/reactivate")
    assert response.status_code == 400


def test_archived_message_can_be_deleted(secretary_client):
    first = secretary_client.post(
        "/api/v1/important-information", json={"title": "First", "text": "First message."}
    ).json()
    secretary_client.post(
        "/api/v1/important-information", json={"title": "Second", "text": "Second message."}
    )

    response = secretary_client.delete(f"/api/v1/important-information/{first['id']}")
    assert response.status_code == 204

    listing = secretary_client.get("/api/v1/important-information").json()
    assert first["id"] not in [item["id"] for item in listing]


def test_active_message_cannot_be_deleted_directly(secretary_client):
    message = secretary_client.post(
        "/api/v1/important-information", json={"title": "Active", "text": "Still active."}
    ).json()

    response = secretary_client.delete(f"/api/v1/important-information/{message['id']}")
    assert response.status_code == 400


def test_write_user_can_deactivate_the_active_message(secretary_client, user_client):
    message = secretary_client.post(
        "/api/v1/important-information", json={"title": "Active", "text": "Still active."}
    ).json()

    response = secretary_client.post(f"/api/v1/important-information/{message['id']}/deactivate")
    assert response.status_code == 200
    assert response.json()["status"] == "archived"
    assert response.json()["archived_at"] is not None

    active = user_client.get("/api/v1/important-information/active")
    assert active.json() is None


def test_deactivating_an_already_archived_message_returns_400(secretary_client):
    message = secretary_client.post(
        "/api/v1/important-information", json={"title": "Active", "text": "Body."}
    ).json()
    secretary_client.post(f"/api/v1/important-information/{message['id']}/deactivate")

    response = secretary_client.post(f"/api/v1/important-information/{message['id']}/deactivate")
    assert response.status_code == 400


def test_regular_user_cannot_deactivate(secretary_client, user_client):
    message = secretary_client.post(
        "/api/v1/important-information", json={"title": "Active", "text": "Body."}
    ).json()

    response = user_client.post(f"/api/v1/important-information/{message['id']}/deactivate")
    assert response.status_code == 403


def test_title_and_text_length_limits_are_enforced(secretary_client):
    too_long_title = "x" * 151
    response = secretary_client.post(
        "/api/v1/important-information", json={"title": too_long_title, "text": "Body."}
    )
    assert response.status_code == 422

    too_long_text = "x" * 2001
    response = secretary_client.post(
        "/api/v1/important-information", json={"title": "Title", "text": too_long_text}
    )
    assert response.status_code == 422


def test_delete_or_reactivate_unknown_message_returns_404(secretary_client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    assert secretary_client.delete(f"/api/v1/important-information/{fake_id}").status_code == 404
    assert (
        secretary_client.post(f"/api/v1/important-information/{fake_id}/reactivate").status_code
        == 404
    )
