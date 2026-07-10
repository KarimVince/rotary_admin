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
        "organisations_supported": 0,
        "rotary_friends": 0,
        "donations_this_year": 0,
        "fees_collected_this_year": 0,
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
