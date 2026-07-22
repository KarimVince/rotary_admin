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
        "fees_collected_this_year": 0,
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


def test_dashboard_summary_sums_current_rotary_year_paid_fees(
    user_client, make_member, make_member_fee
):
    from datetime import date

    from app.core.rotary_year import rotary_year

    this_year = rotary_year(date.today())
    prior_year = this_year - 2

    member = make_member()
    make_member_fee(member_id=member.id, rotary_year=this_year, amount_due=500, is_paid=True)
    # Unpaid fee this year must NOT be counted.
    make_member_fee(
        member_id=make_member(first_name="Unpaid").id,
        rotary_year=this_year,
        amount_due=600,
        is_paid=False,
    )
    # Paid fee from a prior rotary year must NOT be counted.
    make_member_fee(
        member_id=make_member(first_name="Prior").id,
        rotary_year=prior_year,
        amount_due=999,
        is_paid=True,
    )

    response = user_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    assert response.json()["fees_collected_this_year"] == 500


def test_dashboard_fees_collected_matches_fees_module_when_amount_paid_differs(
    user_client, admin_client, make_member, make_member_fee
):
    # Story 15.10 regression: the dashboard card used to sum amount_due for
    # paid fees, ignoring amount_paid overrides (e.g. a prorated fee, or
    # Story 8.29's zero-amount fee-exempt member) — diverging from the Fees
    # module's own total_collected. Both must now agree.
    from datetime import date

    from app.core.rotary_year import rotary_year

    this_year = rotary_year(date.today())

    prorated_member = make_member(first_name="Prorated")
    make_member_fee(
        member_id=prorated_member.id,
        rotary_year=this_year,
        amount_due=500,
        amount_paid=250,
        is_paid=True,
    )
    exempt_member = make_member(first_name="Exempt")
    make_member_fee(
        member_id=exempt_member.id,
        rotary_year=this_year,
        amount_due=500,
        amount_paid=0,
        is_paid=True,
    )

    dashboard_response = user_client.get("/api/v1/dashboard/summary")
    fees_response = admin_client.get(
        "/api/v1/member-fees/statistics", params={"rotary_year": this_year}
    )

    assert dashboard_response.status_code == 200
    assert fees_response.status_code == 200
    assert dashboard_response.json()["fees_collected_this_year"] == 250
    assert fees_response.json()["total_collected"] == 250
    assert (
        dashboard_response.json()["fees_collected_this_year"]
        == fees_response.json()["total_collected"]
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
