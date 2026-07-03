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
