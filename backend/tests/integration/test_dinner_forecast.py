from datetime import date, timedelta

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_forecast_access(make_app_function, make_permission_matrix_entry):
    forecast = make_app_function(key="attendance.forecast", label="Dinner — Forecast")
    sheet = make_app_function(key="attendance.sheet", label="Dinner — Attendance Sheet")
    make_permission_matrix_entry(
        forecast.id, board_position_id=None, access_level="read", is_default_user=True
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
    user = make_user(email="secretary-forecast@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.forecast", position.id)
    _grant_write(make_app_function, make_permission_matrix_entry, "attendance.sheet", position.id)
    return build_client(user)


FUTURE = date.today() + timedelta(days=30)
PAST = date.today() - timedelta(days=30)
# Same rotary year as FUTURE (unlike PAST, which can land a rotary year
# earlier) — for tests that need one past and one future event to both
# appear together in the same rotary year's report.
RECENT_PAST = date.today() - timedelta(days=1)


def test_user_can_read_but_not_create(user_client, secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    assert create.status_code == 201

    read = user_client.get(f"/api/v1/dinner-forecast/events?rotary_year={rotary_year(FUTURE)}")
    assert read.status_code == 200
    assert len(read.json()) == 1

    denied = user_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Another Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    assert denied.status_code == 403


def test_list_filters_by_multiple_event_types(secretary_client, db_session):
    from app.models import DinnerEventType

    db_session.add(DinnerEventType(name="Gala", sort_order=99))
    db_session.commit()

    for name, event_type in [
        ("Welcome Dinner", "Dinner"),
        ("Area Fellowship", "Fellowship"),
        ("Annual Gala", "Gala"),
    ]:
        secretary_client.post(
            "/api/v1/dinner-forecast/events",
            json={
                "name": name,
                "event_date": str(FUTURE),
                "event_type": event_type,
                "location": "Club House",
            },
        )

    response = secretary_client.get(
        f"/api/v1/dinner-forecast/events?rotary_year={rotary_year(FUTURE)}"
        "&event_type=Dinner&event_type=Fellowship"
    )
    assert response.status_code == 200
    names = {item["name"] for item in response.json()}
    assert names == {"Welcome Dinner", "Area Fellowship"}


def test_report_filters_by_multiple_event_types(secretary_client, db_session):
    from app.models import DinnerEventType

    db_session.add(DinnerEventType(name="Gala", sort_order=99))
    db_session.commit()

    for name, event_type in [
        ("Welcome Dinner", "Dinner"),
        ("Area Fellowship", "Fellowship"),
        ("Annual Gala", "Gala"),
    ]:
        secretary_client.post(
            "/api/v1/dinner-forecast/events",
            json={
                "name": name,
                "event_date": str(FUTURE),
                "event_type": event_type,
                "location": "Club House",
            },
        )

    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=csv"
        "&forecast=true&event_type=Dinner&event_type=Fellowship"
    )
    assert response.status_code == 200
    assert "Welcome Dinner" in response.text
    assert "Area Fellowship" in response.text
    assert "Annual Gala" not in response.text


def test_create_allows_future_dates_and_does_not_seed_records(secretary_client, make_member):
    make_member(first_name="Active", last_name="One", status="active")

    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == rotary_year(FUTURE)
    assert body["attendance_started"] is False

    sheet = secretary_client.get(f"/api/v1/attendance/events/{body['id']}/sheet")
    assert sheet.status_code == 200
    assert sheet.json()["eligible_total"] == 0


def test_create_requires_location(secretary_client):
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={"name": "No Location", "event_date": str(FUTURE), "event_type": "Dinner"},
    )
    assert response.status_code == 422


def test_create_with_free_text_ngo_organisation(secretary_client):
    # Story 15.1 follow-up: NGO/Organisation is free text, not a select from
    # the existing Organisations module — any name can be typed, whether or
    # not it has a record there.
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "NGO Night",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
            "ngo_organisation_name": "Helping Hands (not yet in Organisations)",
        },
    )
    assert response.status_code == 201
    assert response.json()["ngo_organisation_name"] == "Helping Hands (not yet in Organisations)"


def test_create_with_speaker_rotary_contact(secretary_client, make_member):
    contact = make_member(first_name="Contact", last_name="Person")
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Guest Speaker Night",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
            "speaker_rotary_contact_member_id": str(contact.id),
        },
    )
    assert response.status_code == 201
    assert response.json()["speaker_rotary_contact_member_id"] == str(contact.id)


def test_create_defaults_member_only_to_false_and_can_set_true(secretary_client):
    default_response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Open Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    assert default_response.status_code == 201
    assert default_response.json()["member_only"] is False

    flagged_response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Members Only Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
            "member_only": True,
        },
    )
    assert flagged_response.status_code == 201
    assert flagged_response.json()["member_only"] is True


def test_update_event_member_only_flag(secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    event_id = create.json()["id"]

    update = secretary_client.put(
        f"/api/v1/dinner-forecast/events/{event_id}", json={"member_only": True}
    )
    assert update.status_code == 200
    assert update.json()["member_only"] is True


def test_update_event(secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    event_id = create.json()["id"]

    update = secretary_client.put(
        f"/api/v1/dinner-forecast/events/{event_id}",
        json={"location": "New Venue", "speaker_name": "Jane Speaker"},
    )
    assert update.status_code == 200
    body = update.json()
    assert body["location"] == "New Venue"
    assert body["speaker_name"] == "Jane Speaker"


def test_soft_delete_hides_from_list_but_keeps_started_attendance(secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    event_id = create.json()["id"]

    start = secretary_client.post(f"/api/v1/attendance/events/{event_id}/start")
    assert start.status_code == 201

    delete = secretary_client.delete(f"/api/v1/dinner-forecast/events/{event_id}")
    assert delete.status_code == 204

    listing = secretary_client.get(
        f"/api/v1/dinner-forecast/events?rotary_year={rotary_year(FUTURE)}"
    )
    assert event_id not in [item["id"] for item in listing.json()]

    # The already-started attendance sheet is untouched by the soft delete.
    sheet = secretary_client.get(f"/api/v1/attendance/events/{event_id}/sheet")
    assert sheet.status_code == 200


def test_start_attendance_seeds_records_and_is_idempotent_guarded(secretary_client, make_member):
    make_member(first_name="Active", last_name="One", status="active")

    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    event_id = create.json()["id"]

    start = secretary_client.post(f"/api/v1/attendance/events/{event_id}/start")
    assert start.status_code == 201

    sheet = secretary_client.get(f"/api/v1/attendance/events/{event_id}/sheet").json()
    assert sheet["eligible_total"] == 2  # secretary's own member + Active One

    again = secretary_client.post(f"/api/v1/attendance/events/{event_id}/start")
    assert again.status_code == 409


def test_unstarted_only_filter(secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Not Started",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    not_started_id = create.json()["id"]

    started = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Already Started",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    started_id = started.json()["id"]
    secretary_client.post(f"/api/v1/attendance/events/{started_id}/start")

    response = secretary_client.get(
        f"/api/v1/dinner-forecast/events?rotary_year={rotary_year(FUTURE)}&unstarted_only=true"
    )
    ids = [item["id"] for item in response.json()]
    assert not_started_id in ids
    assert started_id not in ids


def test_pdf_report_returns_pdf(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=pdf&forecast=true"
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_csv_report_returns_csv(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=csv&forecast=true"
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "Welcome Dinner" in response.text
    # Forecast view has no attendance data yet — no participation column.
    assert "Participation Rate" not in response.text


def test_csv_report_includes_member_only_column(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Members Only Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
            "member_only": True,
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=csv&forecast=true"
    )
    assert response.status_code == 200
    assert "Member Only" in response.text
    assert "MEMBER ONLY" in response.text


def test_report_defaults_to_showing_both_past_and_future_events(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Recent Past Dinner",
            "event_date": str(RECENT_PAST),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Upcoming Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=csv"
    )
    assert response.status_code == 200
    assert "Recent Past Dinner" in response.text
    assert "Upcoming Dinner" in response.text


def test_forecast_report_excludes_past_events(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Past Dinner",
            "event_date": str(PAST),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Upcoming Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(FUTURE)}&format=csv&forecast=true"
    )
    assert response.status_code == 200
    assert "Upcoming Dinner" in response.text
    assert "Past Dinner" not in response.text


def test_historical_report_includes_participation_rate(secretary_client, make_member):
    member = make_member(status="active")
    created = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Past Dinner",
            "event_date": str(PAST),
            "event_type": "Dinner",
            "location": "Club House",
        },
    ).json()
    secretary_client.post(f"/api/v1/attendance/events/{created['id']}/start")
    secretary_client.patch(
        f"/api/v1/attendance/events/{created['id']}/records/{member.id}",
        json={"present": True},
    )

    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(PAST)}&format=csv"
    )
    assert response.status_code == 200
    assert "Past Dinner" in response.text
    assert "Participation Rate" in response.text
    # secretary_client's own linked member is also eligible and seeded
    # (present=False by default), so this is 1 of 2 attending, not 1 of 1.
    assert "50.0% (1/2)" in response.text


def test_historical_report_shows_no_attendance_recorded_for_unstarted_past_event(
    secretary_client,
):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Never Started Dinner",
            "event_date": str(PAST),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(PAST)}&format=csv"
    )
    assert response.status_code == 200
    assert "No attendance recorded" in response.text


def test_historical_pdf_report_returns_pdf(secretary_client):
    secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Past Dinner",
            "event_date": str(PAST),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    response = secretary_client.get(
        f"/api/v1/dinner-forecast/report?rotary_year={rotary_year(PAST)}&format=pdf"
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_create_with_start_and_end_time(secretary_client):
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Timed Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
            "start_time": "19:00:00",
            "end_time": "21:30:00",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["start_time"] == "19:00:00"
    assert body["end_time"] == "21:30:00"


def test_create_defaults_start_and_end_time_to_null(secretary_client):
    response = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Untimed Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["start_time"] is None
    assert body["end_time"] is None


def test_update_event_start_time(secretary_client):
    create = secretary_client.post(
        "/api/v1/dinner-forecast/events",
        json={
            "name": "Welcome Dinner",
            "event_date": str(FUTURE),
            "event_type": "Dinner",
            "location": "Club House",
        },
    )
    event_id = create.json()["id"]

    update = secretary_client.put(
        f"/api/v1/dinner-forecast/events/{event_id}",
        json={"start_time": "18:30:00", "end_time": "20:00:00"},
    )
    assert update.status_code == 200
    body = update.json()
    assert body["start_time"] == "18:30:00"
    assert body["end_time"] == "20:00:00"
