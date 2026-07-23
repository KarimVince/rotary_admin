import pytest

pytestmark = pytest.mark.integration


def test_dashboard_summary_requires_authentication(client):
    response = client.get("/api/v1/dashboard/summary")

    assert response.status_code == 401


def test_dashboard_summary_returns_zero_counts_when_empty(user_client):
    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    assert response.json() == {
        "active_members": 0,
        "honorary_members": 0,
        "organisations_supported": 0,
        "rotary_friends": 0,
        "donations_this_year": 0,
        "total_funds_raised_this_year": 0,
        "service_hours_this_year": 0,
    }


def test_dashboard_summary_reflects_created_records(
    user_client, make_member, make_organisation, make_rotary_friend
):
    make_member(first_name="Active", last_name="One")
    make_member(first_name="Active", last_name="Two")
    make_organisation(name="Org One")
    make_rotary_friend(first_name="Friend", last_name="One")

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["active_members"] == 2
    assert body["organisations_supported"] == 1
    assert body["rotary_friends"] == 1


def test_dashboard_summary_counts_honorary_members_separately(user_client, make_member):
    make_member(first_name="Regular", last_name="Active", is_honorary=False)
    make_member(first_name="Honorary", last_name="One", is_honorary=True)
    make_member(first_name="Honorary", last_name="Two", is_honorary=True)
    make_member(first_name="Past", last_name="Member", status="past")

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["active_members"] == 3
    assert body["honorary_members"] == 2


def test_dashboard_summary_sums_current_rotary_year_donations(
    user_client, admin_client, make_organisation
):
    from datetime import date

    from app.core.rotary_year import rotary_year

    org = make_organisation(name="Donee")
    # A donation dated today falls in the current rotary year.
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 120.5, "donation_date": date.today().isoformat()},
    )
    # A donation from a prior rotary year must NOT be counted.
    prior_year = rotary_year(date.today()) - 2
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 999, "donation_date": f"{prior_year}-09-01"},
    )

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    assert response.json()["donations_this_year"] == 120.5


def test_dashboard_summary_sums_current_rotary_year_ad_hoc_donations(
    user_client, admin_client
):
    from datetime import date

    from app.core.rotary_year import rotary_year

    this_year = rotary_year(date.today())
    prior_year = this_year - 2

    admin_client.post(
        "/api/v1/adhoc-donations",
        json={
            "donation_date": date.today().isoformat(),
            "description": "Red box",
            "amount": 150,
        },
    )
    # An ad hoc donation from a prior rotary year must NOT be counted.
    admin_client.post(
        "/api/v1/adhoc-donations",
        json={"donation_date": f"{prior_year}-09-01", "description": "Old", "amount": 999},
    )

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    assert response.json()["total_funds_raised_this_year"] == 150


def test_dashboard_total_funds_raised_matches_finance_fundraising_summary(
    user_client, admin_client
):
    # Story 16.26: the dashboard card is sourced from the same
    # `_compute_fundraising_summary` helper as the Finance module's own
    # Fund Raising Results page (Story 17.3) — the two must never diverge.
    from datetime import date

    from app.core.rotary_year import rotary_year

    this_year = rotary_year(date.today())

    admin_client.post(
        "/api/v1/adhoc-donations",
        json={"donation_date": date.today().isoformat(), "description": "Dinner", "amount": 300},
    )

    dashboard_response = user_client.get("/api/v1/dashboard/summary")
    fundraising_response = admin_client.get(
        "/api/v1/finance/fundraising-summary", params={"rotary_year": this_year}
    )

    assert dashboard_response.status_code == 200
    assert fundraising_response.status_code == 200
    assert dashboard_response.json()["total_funds_raised_this_year"] == 300
    assert fundraising_response.json()["combined_total"] == 300
    assert (
        dashboard_response.json()["total_funds_raised_this_year"]
        == fundraising_response.json()["combined_total"]
    )


def test_dashboard_summary_sums_current_rotary_year_service_hours(
    user_client, admin_client, make_organisation, make_member
):
    from datetime import date

    from app.core.rotary_year import rotary_year

    org = make_organisation(name="Volunteer Org")
    member = make_member()
    # A service hours entry dated today falls in the current rotary year.
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json={"member_id": str(member.id), "hours": 3.5, "service_date": date.today().isoformat()},
    )
    # An entry from a prior rotary year must NOT be counted.
    prior_year = rotary_year(date.today()) - 2
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json={"member_id": str(member.id), "hours": 100, "service_date": f"{prior_year}-09-01"},
    )

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    assert response.json()["service_hours_this_year"] == 3.5
