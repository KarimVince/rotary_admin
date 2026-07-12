from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_attendance_access(make_app_function, make_permission_matrix_entry):
    history = make_app_function(key="attendance.history", label="Dinner — Attendance History")
    sheet = make_app_function(key="attendance.sheet", label="Dinner — Attendance Sheet")
    make_permission_matrix_entry(
        history.id, board_position_id=None, access_level="read", is_default_user=True
    )
    make_permission_matrix_entry(
        sheet.id, board_position_id=None, access_level="read", is_default_user=True
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
    user = make_user(email="secretary@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.sheet", position.id)
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.history", position.id)
    return build_client(user)


def test_user_cannot_create_event(user_client):
    response = user_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    assert response.status_code == 403


def test_secretary_can_create_event_and_seeds_records(secretary_client, make_member):
    # secretary_client's own linked member ("Sec Retary", status=active) is
    # also snapshotted, since event creation snapshots every member — so
    # active count is 2 (Sec Retary + Active One), not 1.
    make_member(first_name="Active", last_name="One", status="active")
    make_member(first_name="Honor", last_name="Ary", is_honorary=True)
    make_member(first_name="Past", last_name="Member", status="past")

    response = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == rotary_year(date.today())

    sheet = secretary_client.get(f"/api/v1/attendance/events/{body['id']}/sheet")
    assert sheet.status_code == 200
    sheet_body = sheet.json()
    assert len(sheet_body["active"]) == 2
    assert len(sheet_body["honorary"]) == 1
    assert len(sheet_body["past"]) == 1
    assert sheet_body["eligible_total"] == 3
    assert sheet_body["present_count"] == 0


def test_create_event_rejects_future_date(secretary_client):
    from datetime import timedelta

    future = date.today() + timedelta(days=1)
    response = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Future Dinner", "event_date": str(future), "event_type": "dinner"},
    )
    assert response.status_code == 422


def test_mark_present_updates_sheet_and_list_stats(secretary_client, make_member):
    member = make_member(status="active")

    create = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    event_id = create.json()["id"]

    patch = secretary_client.patch(
        f"/api/v1/attendance/events/{event_id}/records/{member.id}",
        json={"present": True},
    )
    assert patch.status_code == 200
    assert patch.json()["present"] is True

    listing = secretary_client.get(
        f"/api/v1/attendance/events?rotary_year={rotary_year(date.today())}"
    )
    assert listing.status_code == 200
    row = next(item for item in listing.json() if item["id"] == event_id)
    # eligible_total is 2 (secretary_client's own linked member + the
    # member created above), only the latter was marked present.
    assert row["present_count"] == 1
    assert row["eligible_total"] == 2
    assert row["attendance_percentage"] == 50.0


def test_user_cannot_mark_present(user_client, secretary_client, make_member):
    member = make_member(status="active")
    create = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    event_id = create.json()["id"]

    response = user_client.patch(
        f"/api/v1/attendance/events/{event_id}/records/{member.id}",
        json={"present": True},
    )
    assert response.status_code == 403


def test_past_member_present_counts_toward_present_but_not_eligible_total(
    secretary_client, make_member
):
    active_member = make_member(first_name="Active", last_name="One", status="active")
    past_member = make_member(first_name="Past", last_name="Member", status="past")

    create = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    event_id = create.json()["id"]

    secretary_client.patch(
        f"/api/v1/attendance/events/{event_id}/records/{past_member.id}",
        json={"present": True},
    )

    sheet = secretary_client.get(f"/api/v1/attendance/events/{event_id}/sheet").json()
    # eligible_total is 2 (secretary_client's own linked member + active_member);
    # the past member doesn't count toward it even though marked present.
    assert sheet["eligible_total"] == 2
    assert sheet["present_count"] == 1

    stats = secretary_client.get(
        f"/api/v1/attendance/stats?rotary_year={rotary_year(date.today())}"
    ).json()
    assert stats["total_events"] == 1
    assert stats["average_attendance"] == 1.0


def test_delete_event_cascades_records(secretary_client, make_member):
    member = make_member(status="active")
    create = secretary_client.post(
        "/api/v1/attendance/events",
        json={"name": "Weekly Dinner", "event_date": str(date.today()), "event_type": "dinner"},
    )
    event_id = create.json()["id"]

    delete = secretary_client.delete(f"/api/v1/attendance/events/{event_id}")
    assert delete.status_code == 204

    sheet = secretary_client.get(f"/api/v1/attendance/events/{event_id}/sheet")
    assert sheet.status_code == 404


def test_stats_zero_state_when_no_events(user_client):
    response = user_client.get("/api/v1/attendance/stats?rotary_year=1999")
    assert response.status_code == 200
    body = response.json()
    assert body["total_events"] == 0
    assert body["average_attendance"] is None
    assert body["average_attendance_percentage"] is None
