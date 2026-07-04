import pytest

pytestmark = pytest.mark.integration


def test_create_then_list_member_title_round_trip(admin_client):
    create_response = admin_client.post(
        "/api/v1/member-titles", json={"code": "Rtn", "label": "Rotarian", "sort_order": 0}
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["code"] == "Rtn"
    assert created["label"] == "Rotarian"

    list_response = admin_client.get("/api/v1/member-titles")
    assert list_response.status_code == 200
    codes = [title["code"] for title in list_response.json()]
    assert "Rtn" in codes


def test_list_member_titles_requires_authentication(client):
    response = client.get("/api/v1/member-titles")

    assert response.status_code == 401


def test_non_admin_cannot_create_member_title(user_client):
    response = user_client.post(
        "/api/v1/member-titles", json={"code": "PP", "label": "Past President", "sort_order": 1}
    )

    assert response.status_code == 403


def test_treasurer_cannot_create_member_title(treasurer_client):
    response = treasurer_client.post(
        "/api/v1/member-titles", json={"code": "IPP", "label": "Immediate Past President"}
    )

    assert response.status_code == 403


def test_create_member_title_duplicate_code_returns_409(admin_client):
    admin_client.post("/api/v1/member-titles", json={"code": "CP", "label": "Charter President"})

    response = admin_client.post(
        "/api/v1/member-titles", json={"code": "CP", "label": "Duplicate"}
    )

    assert response.status_code == 409


def test_admin_can_update_member_title(admin_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "P", "label": "President"}
    ).json()

    response = admin_client.patch(
        f"/api/v1/member-titles/{created['id']}", json={"label": "Club President"}
    )

    assert response.status_code == 200
    assert response.json()["label"] == "Club President"


def test_update_member_title_duplicate_code_returns_409(admin_client):
    admin_client.post("/api/v1/member-titles", json={"code": "Rtn", "label": "Rotarian"})
    other = admin_client.post(
        "/api/v1/member-titles", json={"code": "PP", "label": "Past President"}
    ).json()

    response = admin_client.patch(f"/api/v1/member-titles/{other['id']}", json={"code": "Rtn"})

    assert response.status_code == 409


def test_update_member_title_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/member-titles/00000000-0000-0000-0000-000000000000", json={"label": "x"}
    )

    assert response.status_code == 404


def test_non_admin_cannot_update_member_title(admin_client, user_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "IPP", "label": "Immediate Past President"}
    ).json()

    response = user_client.patch(
        f"/api/v1/member-titles/{created['id']}", json={"label": "x"}
    )

    assert response.status_code == 403


def test_non_admin_cannot_deactivate_member_title(admin_client, user_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "CP", "label": "Charter President"}
    ).json()

    response = user_client.delete(f"/api/v1/member-titles/{created['id']}")

    assert response.status_code == 403


def test_admin_can_deactivate_member_title(admin_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "P", "label": "President"}
    ).json()

    response = admin_client.delete(f"/api/v1/member-titles/{created['id']}")

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_deactivate_member_title_not_found_returns_404(admin_client):
    response = admin_client.delete("/api/v1/member-titles/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_list_member_titles_excludes_inactive_by_default(admin_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "P", "label": "President"}
    ).json()
    admin_client.delete(f"/api/v1/member-titles/{created['id']}")

    response = admin_client.get("/api/v1/member-titles")

    codes = [title["code"] for title in response.json()]
    assert "P" not in codes


def test_list_member_titles_include_inactive_shows_deactivated(admin_client):
    created = admin_client.post(
        "/api/v1/member-titles", json={"code": "P", "label": "President"}
    ).json()
    admin_client.delete(f"/api/v1/member-titles/{created['id']}")

    response = admin_client.get("/api/v1/member-titles", params={"include_inactive": True})

    codes = [title["code"] for title in response.json()]
    assert "P" in codes


def test_deactivating_title_does_not_break_members_referencing_it(admin_client):
    title = admin_client.post(
        "/api/v1/member-titles", json={"code": "P", "label": "President"}
    ).json()
    member = admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "join_date": "2020-01-15",
            "title_id": title["id"],
        },
    ).json()

    deactivate_response = admin_client.delete(f"/api/v1/member-titles/{title['id']}")
    assert deactivate_response.status_code == 200

    member_response = admin_client.get(f"/api/v1/members/{member['id']}")
    assert member_response.status_code == 200
    assert member_response.json()["title_id"] == title["id"]
