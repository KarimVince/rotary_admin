from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_forecast_access(make_app_function, make_permission_matrix_entry):
    forecast = make_app_function(key="attendance.forecast", label="Dinner — Forecast")
    make_permission_matrix_entry(
        forecast.id, board_position_id=None, access_level="read", is_default_user=True
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
    user = make_user(email="secretary-event-types@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "admin.dinner_event_types", position.id)
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.forecast", position.id)
    return build_client(user)


def test_user_cannot_create_type(user_client):
    response = user_client.post("/api/v1/dinner-event-types", json={"name": "Gala"})
    assert response.status_code == 403


def test_list_shows_seeded_defaults(secretary_client):
    response = secretary_client.get("/api/v1/dinner-event-types")
    assert response.status_code == 200
    names = [t["name"] for t in response.json()]
    assert names == ["Dinner", "Fellowship"]


def test_any_user_can_list_types_for_chip_rendering(user_client):
    # Story 16.10: the Dinner Events page renders type chips for every
    # viewer, not just Secretary/President/President Elect — listing must
    # not require admin.dinner_event_types itself.
    response = user_client.get("/api/v1/dinner-event-types")
    assert response.status_code == 200
    names = [t["name"] for t in response.json()]
    assert names == ["Dinner", "Fellowship"]


def test_create_type_appears_in_list(secretary_client):
    response = secretary_client.post(
        "/api/v1/dinner-event-types",
        json={"name": "Gala", "color_bg": "#fdf0da", "color_text": "#b8760f"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Gala"
    assert body["event_count"] == 0

    listing = secretary_client.get("/api/v1/dinner-event-types").json()
    assert "Gala" in [t["name"] for t in listing]


def test_create_duplicate_name_returns_409(secretary_client):
    secretary_client.post("/api/v1/dinner-event-types", json={"name": "District Training"})
    response = secretary_client.post(
        "/api/v1/dinner-event-types", json={"name": "District Training"}
    )
    assert response.status_code == 409


def test_reorder_persists_sort_order(secretary_client):
    gala = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Gala"}).json()
    social = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Social"}).json()

    response = secretary_client.patch(
        "/api/v1/dinner-event-types/reorder",
        json={"items": [{"id": social["id"], "sort_order": 0}, {"id": gala["id"], "sort_order": 1}]},
    )
    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names.index("Social") < names.index("Gala")


def test_new_type_immediately_usable_on_a_dinner_event(secretary_client):
    gala = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Gala"}).json()

    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Charity Gala",
            "event_date": str(date.today()),
            "event_type": gala["name"],
            "location": "Grand Hotel",
        },
    )
    assert response.status_code == 201
    assert response.json()["event_type"] == "Gala"


def test_create_dinner_event_rejects_unknown_type(secretary_client):
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Mystery Event",
            "event_date": str(date.today()),
            "event_type": "NotARealType",
            "location": "Somewhere",
        },
    )
    assert response.status_code == 422


def test_delete_blocked_when_type_in_use(secretary_client):
    gala = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Gala"}).json()
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Charity Gala",
            "event_date": str(date.today()),
            "event_type": "Gala",
            "location": "Grand Hotel",
        },
    )

    response = secretary_client.delete(f"/api/v1/dinner-event-types/{gala['id']}")
    assert response.status_code == 409

    listing = secretary_client.get("/api/v1/dinner-event-types").json()
    row = next(t for t in listing if t["id"] == gala["id"])
    assert row["event_count"] == 1


def test_delete_unused_type_succeeds(secretary_client):
    social = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Social"}).json()
    response = secretary_client.delete(f"/api/v1/dinner-event-types/{social['id']}")
    assert response.status_code == 204


def test_rename_repoints_existing_events(secretary_client):
    gala = secretary_client.post("/api/v1/dinner-event-types", json={"name": "Gala"}).json()
    created = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Charity Gala",
            "event_date": str(date.today()),
            "event_type": "Gala",
            "location": "Grand Hotel",
        },
    ).json()

    rename = secretary_client.patch(
        f"/api/v1/dinner-event-types/{gala['id']}", json={"name": "Grand Gala"}
    )
    assert rename.status_code == 200

    events = secretary_client.get(
        f"/api/v1/dinner-forecast/events?rotary_year={rotary_year(date.today())}"
    ).json()
    row = next(e for e in events if e["id"] == created["id"])
    assert row["event_type"] == "Grand Gala"
