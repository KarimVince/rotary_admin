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
    user = make_user(email="secretary-connlog@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "admin.connection_log", position.id)
    return build_client(user)


def test_login_records_a_connection_log_entry(client, make_user, secretary_client):
    make_user(email="tracked@example.com", password="password123")

    login = client.post(
        "/api/v1/auth/login", json={"email": "tracked@example.com", "password": "password123"}
    )
    assert login.status_code == 200

    listing = secretary_client.get("/api/v1/connection-logs")
    assert listing.status_code == 200
    entries = [e for e in listing.json() if e["user_email"] == "tracked@example.com"]
    assert len(entries) == 1
    assert entries[0]["user_full_name"] == "Test User"


def test_failed_login_does_not_record_a_connection_log(client, make_user, secretary_client):
    make_user(email="wontlogin@example.com", password="password123")

    client.post(
        "/api/v1/auth/login", json={"email": "wontlogin@example.com", "password": "wrong-password"}
    )

    listing = secretary_client.get("/api/v1/connection-logs")
    entries = [e for e in listing.json() if e["user_email"] == "wontlogin@example.com"]
    assert entries == []


def test_regular_user_cannot_view_connection_logs(user_client):
    response = user_client.get("/api/v1/connection-logs")
    assert response.status_code == 403

    stats = user_client.get("/api/v1/connection-logs/stats")
    assert stats.status_code == 403


def test_connection_log_can_be_filtered_by_user(client, make_user, secretary_client):
    user_a = make_user(email="a-conn@example.com", password="password123")
    make_user(email="b-conn@example.com", password="password123")
    client.post("/api/v1/auth/login", json={"email": "a-conn@example.com", "password": "password123"})
    client.post("/api/v1/auth/login", json={"email": "b-conn@example.com", "password": "password123"})

    response = secretary_client.get(f"/api/v1/connection-logs?user_id={user_a.id}")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["user_email"] == "a-conn@example.com"


def test_stats_include_trend_most_active_and_last_login(client, make_user, secretary_client):
    make_user(email="stats-user@example.com", password="password123", full_name="Stats User")
    client.post(
        "/api/v1/auth/login", json={"email": "stats-user@example.com", "password": "password123"}
    )
    client.post(
        "/api/v1/auth/login", json={"email": "stats-user@example.com", "password": "password123"}
    )

    response = secretary_client.get("/api/v1/connection-logs/stats")
    assert response.status_code == 200
    body = response.json()

    assert sum(point["count"] for point in body["trend"]) >= 2

    most_active_entry = next(
        (u for u in body["most_active"] if u["email"] == "stats-user@example.com"), None
    )
    assert most_active_entry is not None
    assert most_active_entry["login_count"] == 2

    last_login_entry = next(
        (u for u in body["last_login"] if u["email"] == "stats-user@example.com"), None
    )
    assert last_login_entry is not None
    assert last_login_entry["last_login_at"] is not None


def test_stats_last_login_includes_users_who_never_logged_in(make_user, secretary_client):
    make_user(email="never-logged-in@example.com", password="password123")

    response = secretary_client.get("/api/v1/connection-logs/stats")
    assert response.status_code == 200
    entry = next(
        (u for u in response.json()["last_login"] if u["email"] == "never-logged-in@example.com"),
        None,
    )
    assert entry is not None
    assert entry["last_login_at"] is None
