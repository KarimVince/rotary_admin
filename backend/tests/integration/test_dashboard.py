import pytest

pytestmark = pytest.mark.integration


def test_dashboard_summary_requires_authentication(client):
    response = client.get("/api/dashboard/summary")

    assert response.status_code == 401


def test_dashboard_summary_returns_zero_counts_when_empty(user_client):
    response = user_client.get("/api/dashboard/summary")

    assert response.status_code == 200
    assert response.json() == {
        "active_members": 0,
        "organisations_supported": 0,
        "rotary_friends": 0,
    }


def test_dashboard_summary_reflects_created_records(
    user_client, make_member, make_organisation, make_rotary_friend
):
    make_member(first_name="Active", last_name="One")
    make_member(first_name="Active", last_name="Two")
    make_organisation(name="Org One")
    make_rotary_friend(first_name="Friend", last_name="One")

    response = user_client.get("/api/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["active_members"] == 2
    assert body["organisations_supported"] == 1
    assert body["rotary_friends"] == 1
