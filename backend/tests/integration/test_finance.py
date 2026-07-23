import uuid
from datetime import date

import pytest

from app.models import Event, EventItem, EventLuckyDrawConfig, EventSetup

pytestmark = pytest.mark.integration


@pytest.fixture
def _grant_default_finance_fundraising_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="finance.fundraising", label="Fund Raising Results")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _make_event(db_session, *, rotary_year=2025, name="Gala", event_date=None) -> Event:
    event = Event(
        id=uuid.uuid4(),
        name=name,
        date=event_date or date(rotary_year, 9, 1),
        venue="Clubhouse",
        rotary_year=rotary_year,
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def _adhoc_donation(donation_date="2025-03-01", description="Red box collection", amount=100.0, **extra):
    return {"donation_date": donation_date, "description": description, "amount": amount, **extra}


def test_create_adhoc_donation_auto_computes_rotary_year(admin_client):
    response = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation(donation_date="2025-03-01"))
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == 2024
    assert body["amount"] == 100.0
    assert body["created_by"] is not None


def test_create_adhoc_donation_rotary_year_override(admin_client):
    response = admin_client.post(
        "/api/v1/adhoc-donations", json=_adhoc_donation(donation_date="2025-03-01", rotary_year=2030)
    )
    assert response.json()["rotary_year"] == 2030


def test_create_adhoc_donation_rejects_non_positive_amount(admin_client):
    response = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation(amount=0))
    assert response.status_code == 422


def test_non_admin_cannot_create_adhoc_donation(user_client):
    response = user_client.post("/api/v1/adhoc-donations", json=_adhoc_donation())
    assert response.status_code == 403


def test_list_adhoc_donations_filtered_by_rotary_year(admin_client):
    admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation(donation_date="2024-09-01"))
    admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation(donation_date="2023-09-01"))

    response = admin_client.get("/api/v1/adhoc-donations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["rotary_year"] == 2024


def test_user_with_read_grant_can_list_adhoc_donations(
    user_client, admin_client, _grant_default_finance_fundraising_read
):
    admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation())
    response = user_client.get("/api/v1/adhoc-donations")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_patch_adhoc_donation_amount(admin_client):
    created = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation(amount=50)).json()
    response = admin_client.patch(f"/api/v1/adhoc-donations/{created['id']}", json={"amount": 75.5})
    assert response.status_code == 200
    assert response.json()["amount"] == 75.5


def test_patch_adhoc_donation_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/adhoc-donations/00000000-0000-0000-0000-000000000000", json={"amount": 5}
    )
    assert response.status_code == 404


def test_non_admin_cannot_patch_adhoc_donation(user_client, admin_client):
    created = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation()).json()
    response = user_client.patch(f"/api/v1/adhoc-donations/{created['id']}", json={"amount": 5})
    assert response.status_code == 403


def test_admin_can_delete_adhoc_donation(admin_client):
    created = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation()).json()
    response = admin_client.delete(f"/api/v1/adhoc-donations/{created['id']}")
    assert response.status_code == 204
    remaining = admin_client.get("/api/v1/adhoc-donations").json()
    assert remaining == []


def test_non_admin_cannot_delete_adhoc_donation(user_client, admin_client):
    created = admin_client.post("/api/v1/adhoc-donations", json=_adhoc_donation()).json()
    response = user_client.delete(f"/api/v1/adhoc-donations/{created['id']}")
    assert response.status_code == 403


def test_fundraising_summary_returns_zero_when_no_data(admin_client):
    response = admin_client.get("/api/v1/finance/fundraising-summary", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()
    assert body["events"] == []
    assert body["event_fundraising_total"] == 0
    assert body["adhoc_donations_total"] == 0
    assert body["combined_total"] == 0


def test_fundraising_summary_combines_event_and_adhoc_totals(admin_client, db_session):
    event = _make_event(db_session, rotary_year=2025)
    db_session.add(
        EventItem(
            id=uuid.uuid4(),
            event_id=event.id,
            name="Painting",
            item_type="auction",
            value_sold=1200.0,
        )
    )
    db_session.add(EventSetup(id=uuid.uuid4(), event_id=event.id, lucky_draw_ticket_price=50.0))
    db_session.add(
        EventLuckyDrawConfig(
            id=uuid.uuid4(), event_id=event.id, tickets_sold=10, other_donation=100.0
        )
    )
    db_session.commit()

    admin_client.post(
        "/api/v1/adhoc-donations",
        json=_adhoc_donation(donation_date="2025-08-01", amount=200.0, rotary_year=2025),
    )

    response = admin_client.get("/api/v1/finance/fundraising-summary", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()
    assert len(body["events"]) == 1
    row = body["events"][0]
    assert row["auction_total"] == 1200.0
    # 10 tickets * 50 price = 500, + 100 other_donation
    assert row["lucky_draw_total"] == 500.0
    assert row["other_donation_total"] == 100.0
    assert row["total"] == 1800.0
    assert body["event_fundraising_total"] == 1800.0
    assert body["adhoc_donations_total"] == 200.0
    assert body["combined_total"] == 2000.0


def test_fundraising_summary_omits_events_with_no_income(admin_client, db_session):
    _make_event(db_session, rotary_year=2025, name="No income yet")

    response = admin_client.get("/api/v1/finance/fundraising-summary", params={"rotary_year": 2025})
    assert response.status_code == 200
    assert response.json()["events"] == []


def test_fundraising_summary_filters_by_rotary_year(admin_client, db_session):
    event_this_year = _make_event(db_session, rotary_year=2025, name="This year gala")
    db_session.add(
        EventItem(
            id=uuid.uuid4(),
            event_id=event_this_year.id,
            name="Vase",
            item_type="auction",
            value_sold=300.0,
        )
    )
    event_last_year = _make_event(db_session, rotary_year=2024, name="Last year gala")
    db_session.add(
        EventItem(
            id=uuid.uuid4(),
            event_id=event_last_year.id,
            name="Watch",
            item_type="auction",
            value_sold=900.0,
        )
    )
    db_session.commit()

    response = admin_client.get("/api/v1/finance/fundraising-summary", params={"rotary_year": 2025})
    body = response.json()
    assert len(body["events"]) == 1
    assert body["events"][0]["event_name"] == "This year gala"
    assert body["event_fundraising_total"] == 300.0
