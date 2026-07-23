import uuid
from datetime import date

import pytest

from app.models import Event, EventCost

pytestmark = pytest.mark.integration


def _make_event(db_session, *, rotary_year=2025, name="Gala") -> Event:
    event = Event(
        id=uuid.uuid4(), name=name, date=date(rotary_year, 9, 1), venue="Clubhouse", rotary_year=rotary_year
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def test_finance_summary_returns_zero_when_no_data(admin_client):
    response = admin_client.get("/api/v1/finance/summary", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()
    assert body["rotary_year"] == 2025
    assert body["total_donations"] == 0
    assert body["total_fundraising"] == 0
    assert body["total_charity"] == 0
    assert body["fees_collected"] == 0
    assert body["total_revenue"] == 0
    assert body["total_expenses"] == 0
    assert body["net_balance"] == 0


def test_finance_summary_combines_all_modules(
    admin_client, db_session, make_organisation, make_member, make_member_fee
):
    # Donations (17.2)
    org = make_organisation()
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 1000, "donation_date": "2025-08-01", "currency": "HKD"},
    )

    # Fund raising — ad hoc donation (17.3)
    admin_client.post(
        "/api/v1/adhoc-donations",
        json={"donation_date": "2025-08-01", "description": "Red box", "amount": 200},
    )

    # Member fees (17.4/17.5 auto revenue row)
    member = make_member()
    make_member_fee(member.id, rotary_year=2025, amount_due=500, is_paid=True)

    # Operational manual entry + event cost auto row (17.5)
    revenue_category = admin_client.post(
        "/api/v1/finance-categories", json={"name": "Grants", "type": "revenue"}
    ).json()
    admin_client.post(
        "/api/v1/operational-entries",
        json={
            "type": "revenue",
            "category_id": revenue_category["id"],
            "amount": 300,
            "entry_date": "2025-08-01",
        },
    )
    event = _make_event(db_session, rotary_year=2025)
    db_session.add(
        EventCost(id=uuid.uuid4(), event_id=event.id, name="Venue", quantity=1, unit_price=400, total_cost=400)
    )
    db_session.commit()

    response = admin_client.get("/api/v1/finance/summary", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()

    assert body["total_donations"] == 1000
    assert body["total_fundraising"] == 200
    assert body["total_charity"] == 1200

    assert body["fees_collected"] == 500
    # total_revenue = 500 (fees, auto) + 300 (manual grant) = 800
    assert body["total_revenue"] == 800
    assert body["total_expenses"] == 400
    assert body["net_balance"] == 400


def test_finance_summary_defaults_to_current_rotary_year(admin_client):
    response = admin_client.get("/api/v1/finance/summary")
    assert response.status_code == 200
    assert response.json()["rotary_year"] is not None


def test_non_admin_without_grant_cannot_read_finance_summary(user_client):
    response = user_client.get("/api/v1/finance/summary")
    assert response.status_code == 403
