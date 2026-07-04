from datetime import date, timedelta

import pytest

from app.models import MemberTitle

pytestmark = pytest.mark.integration


def _create_payload(**overrides):
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane.doe@example.com",
        "join_date": "2020-01-15",
        "date_of_birth": "1985-06-01",
        "address": "1 Rotary Way",
        "nationality": "France",
        "classification": "Accounting",
    }
    payload.update(overrides)
    return payload


def test_admin_can_create_member(admin_client):
    response = admin_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["first_name"] == "Jane"
    assert body["status"] == "active"
    assert body["date_of_birth"] == "1985-06-01"
    assert body["address"] == "1 Rotary Way"


def test_non_admin_cannot_create_member(user_client):
    response = user_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 403


def test_treasurer_cannot_create_member(treasurer_client):
    response = treasurer_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 403


def test_create_member_duplicate_email_returns_409(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = admin_client.post("/api/v1/members", json=_create_payload(first_name="Other"))

    assert response.status_code == 409


def test_create_member_future_date_of_birth_returns_422(admin_client):
    future_dob = (date.today() + timedelta(days=1)).isoformat()

    response = admin_client.post(
        "/api/v1/members", json=_create_payload(date_of_birth=future_dob)
    )

    assert response.status_code == 422


def test_create_member_leave_before_join_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(join_date="2020-01-15", leave_date="2019-01-01"),
    )

    assert response.status_code == 422


def test_list_members_admin_sees_full_fields(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = admin_client.get("/api/v1/members")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["date_of_birth"] == "1985-06-01"
    assert body[0]["address"] == "1 Rotary Way"


def test_list_members_non_admin_sees_limited_fields(admin_client, user_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = user_client.get("/api/v1/members")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert "date_of_birth" not in body[0]
    assert "address" not in body[0]
    assert body[0]["first_name"] == "Jane"


def test_get_member_non_admin_sees_limited_fields(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.get(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert "date_of_birth" not in body
    assert "address" not in body


def test_get_member_not_found_returns_404(admin_client):
    response = admin_client.get("/api/v1/members/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_list_members_filters_by_status(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload(email="active@example.com"))
    past = admin_client.post(
        "/api/v1/members", json=_create_payload(email="past@example.com")
    ).json()
    admin_client.patch(f"/api/v1/members/{past['id']}", json={"status": "past"})

    response = admin_client.get("/api/v1/members", params={"status": "past"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["email"] == "past@example.com"


def test_list_members_filters_by_nationality_and_classification(admin_client):
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="fr@example.com", nationality="France", classification="Accounting"
        ),
    )
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="uk@example.com", nationality="UK", classification="Law"
        ),
    )

    response = admin_client.get("/api/v1/members", params={"nationality": "France"})
    assert [m["email"] for m in response.json()] == ["fr@example.com"]

    response = admin_client.get("/api/v1/members", params={"classification": "Law"})
    assert [m["email"] for m in response.json()] == ["uk@example.com"]


def test_list_members_filters_by_join_year(admin_client):
    admin_client.post(
        "/api/v1/members", json=_create_payload(email="y2020@example.com", join_date="2020-03-01")
    )
    admin_client.post(
        "/api/v1/members", json=_create_payload(email="y2023@example.com", join_date="2023-07-01")
    )

    response = admin_client.get("/api/v1/members", params={"join_year": 2023})

    assert [m["email"] for m in response.json()] == ["y2023@example.com"]


def test_list_members_filters_by_title(admin_client, db_session):
    title = MemberTitle(code="Rtn", label="Rotarian", sort_order=0)
    db_session.add(title)
    db_session.commit()
    db_session.refresh(title)

    admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="titled@example.com", title_id=str(title.id)),
    )
    admin_client.post("/api/v1/members", json=_create_payload(email="untitled@example.com"))

    response = admin_client.get("/api/v1/members", params={"title_id": str(title.id)})

    assert [m["email"] for m in response.json()] == ["titled@example.com"]


def test_non_admin_cannot_update_member(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.patch(f"/api/v1/members/{created['id']}", json={"phone": "12345"})

    assert response.status_code == 403


def test_admin_can_update_member(admin_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = admin_client.patch(
        f"/api/v1/members/{created['id']}", json={"phone": "555-1234", "profession": "Lawyer"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["phone"] == "555-1234"
    assert body["profession"] == "Lawyer"


def test_update_member_duplicate_email_returns_409(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload(email="first@example.com"))
    second = admin_client.post(
        "/api/v1/members", json=_create_payload(email="second@example.com")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{second['id']}", json={"email": "first@example.com"}
    )

    assert response.status_code == 409


def test_update_member_invalid_dates_returns_422(admin_client):
    created = admin_client.post(
        "/api/v1/members", json=_create_payload(join_date="2020-01-15")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{created['id']}", json={"leave_date": "2019-01-01"}
    )

    assert response.status_code == 422


def test_update_member_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/members/00000000-0000-0000-0000-000000000000", json={"phone": "555"}
    )

    assert response.status_code == 404


def test_non_admin_cannot_delete_member(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.delete(f"/api/v1/members/{created['id']}")

    assert response.status_code == 403


def test_admin_delete_member_soft_deletes(admin_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = admin_client.delete(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "past"
    assert body["leave_date"] is not None

    get_response = admin_client.get(f"/api/v1/members/{created['id']}")
    assert get_response.json()["status"] == "past"


def test_delete_member_not_found_returns_404(admin_client):
    response = admin_client.delete("/api/v1/members/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
