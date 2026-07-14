import pytest

pytestmark = pytest.mark.integration


def test_create_then_list_honorific_round_trip(admin_client):
    create_response = admin_client.post(
        "/api/v1/honorifics", json={"code": "DR", "label": "Dr.", "sort_order": 0}
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["code"] == "DR"
    assert created["label"] == "Dr."

    list_response = admin_client.get("/api/v1/honorifics")
    assert list_response.status_code == 200
    codes = [honorific["code"] for honorific in list_response.json()]
    assert "DR" in codes


def test_list_honorifics_requires_authentication(client):
    response = client.get("/api/v1/honorifics")

    assert response.status_code == 401


def test_non_admin_cannot_create_honorific(user_client):
    response = user_client.post(
        "/api/v1/honorifics", json={"code": "MR", "label": "Mr.", "sort_order": 0}
    )

    assert response.status_code == 403


def test_treasurer_cannot_create_honorific(treasurer_client):
    response = treasurer_client.post("/api/v1/honorifics", json={"code": "MS", "label": "Ms."})

    assert response.status_code == 403


def test_create_honorific_duplicate_code_returns_409(admin_client):
    admin_client.post("/api/v1/honorifics", json={"code": "MRS", "label": "Mrs."})

    response = admin_client.post("/api/v1/honorifics", json={"code": "MRS", "label": "Duplicate"})

    assert response.status_code == 409


def test_admin_can_update_honorific(admin_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "PROF", "label": "Prof"}).json()

    response = admin_client.patch(
        f"/api/v1/honorifics/{created['id']}", json={"label": "Prof."}
    )

    assert response.status_code == 200
    assert response.json()["label"] == "Prof."


def test_update_honorific_duplicate_code_returns_409(admin_client):
    admin_client.post("/api/v1/honorifics", json={"code": "MR", "label": "Mr."})
    other = admin_client.post("/api/v1/honorifics", json={"code": "MS", "label": "Ms."}).json()

    response = admin_client.patch(f"/api/v1/honorifics/{other['id']}", json={"code": "MR"})

    assert response.status_code == 409


def test_update_honorific_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/honorifics/00000000-0000-0000-0000-000000000000", json={"label": "x"}
    )

    assert response.status_code == 404


def test_non_admin_cannot_update_honorific(admin_client, user_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "MISS", "label": "Miss"}).json()

    response = user_client.patch(f"/api/v1/honorifics/{created['id']}", json={"label": "x"})

    assert response.status_code == 403


def test_non_admin_cannot_deactivate_honorific(admin_client, user_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "DR", "label": "Dr."}).json()

    response = user_client.delete(f"/api/v1/honorifics/{created['id']}")

    assert response.status_code == 403


def test_admin_can_deactivate_honorific(admin_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "MR", "label": "Mr."}).json()

    response = admin_client.delete(f"/api/v1/honorifics/{created['id']}")

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_deactivate_honorific_not_found_returns_404(admin_client):
    response = admin_client.delete("/api/v1/honorifics/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_list_honorifics_excludes_inactive_by_default(admin_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "MR", "label": "Mr."}).json()
    admin_client.delete(f"/api/v1/honorifics/{created['id']}")

    response = admin_client.get("/api/v1/honorifics")

    codes = [honorific["code"] for honorific in response.json()]
    assert "MR" not in codes


def test_list_honorifics_include_inactive_shows_deactivated(admin_client):
    created = admin_client.post("/api/v1/honorifics", json={"code": "MR", "label": "Mr."}).json()
    admin_client.delete(f"/api/v1/honorifics/{created['id']}")

    response = admin_client.get("/api/v1/honorifics", params={"include_inactive": True})

    codes = [honorific["code"] for honorific in response.json()]
    assert "MR" in codes


def test_deactivating_honorific_does_not_break_members_referencing_it(admin_client):
    honorific = admin_client.post("/api/v1/honorifics", json={"code": "DR", "label": "Dr."}).json()
    member = admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "join_date": "2020-01-15",
            "honorific_id": honorific["id"],
        },
    ).json()

    deactivate_response = admin_client.delete(f"/api/v1/honorifics/{honorific['id']}")
    assert deactivate_response.status_code == 200

    member_response = admin_client.get(f"/api/v1/members/{member['id']}")
    assert member_response.status_code == 200
    assert member_response.json()["honorific_id"] == honorific["id"]
