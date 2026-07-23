import pytest
from sqlalchemy import text

from app.core.rotary_year import rotary_year_bounds, rotary_year_label

pytestmark = pytest.mark.integration


@pytest.fixture
def _grant_default_rotary_years_read(make_app_function, make_permission_matrix_entry):
    # Mirrors production's seed_permission_matrix.py entry (admin.rotary_years
    # defaults to "read" for everyone, unlike the other admin lookup
    # tables) — the seed script itself deliberately never runs against the
    # test DB, so tests exercising the non-admin read path grant it directly.
    app_function = make_app_function(key="admin.rotary_years", label="Rotary Years")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def test_admin_rotary_years_seeded_under_admin_menu(db_session):
    admin_menu = db_session.execute(
        text("SELECT id FROM app_functions WHERE key = 'admin'")
    ).first()
    row = db_session.execute(
        text("SELECT parent_id, active FROM app_functions WHERE key = 'admin.rotary_years'")
    ).first()
    assert row is not None
    assert row.parent_id == admin_menu.id
    assert row.active is True


def test_migration_seeds_a_default_year_range(admin_client):
    # The migration seeds current-2 .. current+1 with exactly one is_current.
    response = admin_client.get("/api/v1/rotary-years")
    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 4
    current_rows = [row for row in body if row["is_current"]]
    assert len(current_rows) == 1


def test_list_rotary_years_includes_computed_label_and_bounds(admin_client):
    response = admin_client.get("/api/v1/rotary-years")
    assert response.status_code == 200
    body = response.json()
    row = body[0]
    start_date, end_date = rotary_year_bounds(row["year"])
    assert row["label"] == rotary_year_label(row["year"])
    assert row["start_date"] == start_date.isoformat()
    assert row["end_date"] == end_date.isoformat()


def test_create_rotary_year(admin_client):
    response = admin_client.post("/api/v1/rotary-years", json={"year": 2040})
    assert response.status_code == 201
    body = response.json()
    assert body["year"] == 2040
    assert body["is_current"] is False
    assert body["label"] == "2040–2041"


def test_create_rotary_year_rejects_duplicate_year(admin_client):
    admin_client.post("/api/v1/rotary-years", json={"year": 2041})
    response = admin_client.post("/api/v1/rotary-years", json={"year": 2041})
    assert response.status_code == 409


def test_create_rotary_year_as_current_unsets_previous_current(admin_client):
    admin_client.post("/api/v1/rotary-years", json={"year": 2042, "is_current": True})

    response = admin_client.get("/api/v1/rotary-years")
    current_rows = [row for row in response.json() if row["is_current"]]
    assert len(current_rows) == 1
    assert current_rows[0]["year"] == 2042


def test_patch_rotary_year_sets_current_and_unsets_others(admin_client):
    first = admin_client.post("/api/v1/rotary-years", json={"year": 2050}).json()
    second = admin_client.post(
        "/api/v1/rotary-years", json={"year": 2051, "is_current": True}
    ).json()

    response = admin_client.patch(f"/api/v1/rotary-years/{first['id']}", json={"is_current": True})
    assert response.status_code == 200
    assert response.json()["is_current"] is True

    refreshed_second = next(
        row
        for row in admin_client.get("/api/v1/rotary-years").json()
        if row["id"] == second["id"]
    )
    assert refreshed_second["is_current"] is False


def test_patch_rotary_year_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/rotary-years/00000000-0000-0000-0000-000000000000", json={"is_current": True}
    )
    assert response.status_code == 404


def test_delete_rotary_year(admin_client):
    created = admin_client.post("/api/v1/rotary-years", json={"year": 2060}).json()
    response = admin_client.delete(f"/api/v1/rotary-years/{created['id']}")
    assert response.status_code == 204

    remaining = admin_client.get("/api/v1/rotary-years").json()
    assert all(row["id"] != created["id"] for row in remaining)


def test_delete_current_rotary_year_is_blocked(admin_client):
    created = admin_client.post(
        "/api/v1/rotary-years", json={"year": 2070, "is_current": True}
    ).json()
    response = admin_client.delete(f"/api/v1/rotary-years/{created['id']}")
    assert response.status_code == 422


def test_non_admin_cannot_create_rotary_year(user_client):
    response = user_client.post("/api/v1/rotary-years", json={"year": 2045})
    assert response.status_code == 403


def test_non_admin_can_list_rotary_years(user_client, _grant_default_rotary_years_read):
    # Story 16.28: unlike other admin lookup tables, GET must be readable
    # by every board position and the default user — every year selector
    # across the app (Member Fees, Finance, Dinner, NGOs, Board) reads
    # from here regardless of that page's own module permission.
    response = user_client.get("/api/v1/rotary-years")
    assert response.status_code == 200


def test_non_admin_cannot_patch_rotary_year(user_client, admin_client):
    created = admin_client.post("/api/v1/rotary-years", json={"year": 2046}).json()
    response = user_client.patch(
        f"/api/v1/rotary-years/{created['id']}", json={"is_current": True}
    )
    assert response.status_code == 403


def test_non_admin_cannot_delete_rotary_year(user_client, admin_client):
    created = admin_client.post("/api/v1/rotary-years", json={"year": 2047}).json()
    response = user_client.delete(f"/api/v1/rotary-years/{created['id']}")
    assert response.status_code == 403
