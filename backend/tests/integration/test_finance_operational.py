import uuid
from datetime import date

import pytest

from app.models import Event, EventCost, EventGuest, EventSetup, EventSponsor, MemberFee

pytestmark = pytest.mark.integration


@pytest.fixture
def _grant_default_finance_operational_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="finance.operational", label="Club Operational Tracking")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


@pytest.fixture
def _grant_default_finance_categories_read(make_app_function, make_permission_matrix_entry):
    # Mirrors production's seed_permission_matrix.py entry: read is granted
    # to President/Secretary/Treasurer (not admin-role-only), since the
    # Club Operational Tracking entry form needs the category list for
    # anyone who can reach that page. The seed script itself deliberately
    # never runs against the test DB, so this test grants it directly.
    app_function = make_app_function(key="admin.finance_categories", label="Finance Categories")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _make_category(admin_client, name="Fundraising Dinner", category_type="revenue"):
    response = admin_client.post(
        "/api/v1/finance-categories", json={"name": name, "type": category_type}
    )
    assert response.status_code == 201
    return response.json()


def _entry(category_id, entry_type="revenue", amount=100.0, entry_date="2025-03-01", **extra):
    return {
        "type": entry_type,
        "category_id": category_id,
        "amount": amount,
        "entry_date": entry_date,
        **extra,
    }


def _make_event(db_session, *, rotary_year=2025, name="Gala") -> Event:
    event = Event(
        id=uuid.uuid4(), name=name, date=date(rotary_year, 9, 1), venue="Clubhouse", rotary_year=rotary_year
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


# --- Finance categories (admin lookup table) ---


def test_admin_can_create_finance_category(admin_client):
    category = _make_category(admin_client, name="Sponsorship", category_type="revenue")
    assert category["type"] == "revenue"
    assert category["is_active"] is True


def test_create_finance_category_rejects_duplicate_name(admin_client):
    _make_category(admin_client, name="Rent")
    response = admin_client.post(
        "/api/v1/finance-categories", json={"name": "Rent", "type": "cost"}
    )
    assert response.status_code == 409


def test_non_admin_cannot_create_finance_category(user_client):
    response = user_client.post(
        "/api/v1/finance-categories", json={"name": "Rent", "type": "cost"}
    )
    assert response.status_code == 403


def test_non_admin_with_read_grant_can_list_finance_categories(
    user_client, admin_client, _grant_default_finance_categories_read
):
    _make_category(admin_client, name="District Fees", category_type="cost")
    response = user_client.get("/api/v1/finance-categories")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_non_admin_without_grant_cannot_list_finance_categories(user_client):
    response = user_client.get("/api/v1/finance-categories")
    assert response.status_code == 403


def test_delete_finance_category_hard_deletes(admin_client):
    category = _make_category(admin_client, name="Utilities", category_type="cost")
    response = admin_client.delete(f"/api/v1/finance-categories/{category['id']}")
    assert response.status_code == 204

    listed = admin_client.get("/api/v1/finance-categories").json()
    assert all(row["id"] != category["id"] for row in listed)


def test_delete_finance_category_blocked_when_used_by_operational_entry(admin_client):
    category = _make_category(admin_client, name="Sponsorship Income", category_type="revenue")
    admin_client.post("/api/v1/operational-entries", json=_entry(category["id"]))

    response = admin_client.delete(f"/api/v1/finance-categories/{category['id']}")
    assert response.status_code == 422

    listed = admin_client.get("/api/v1/finance-categories").json()
    assert any(row["id"] == category["id"] for row in listed)


def test_update_finance_category_type(admin_client):
    category = _make_category(admin_client, name="Flexible Category", category_type="revenue")
    response = admin_client.patch(
        f"/api/v1/finance-categories/{category['id']}", json={"type": "cost"}
    )
    assert response.status_code == 200
    assert response.json()["type"] == "cost"


def test_non_admin_cannot_delete_finance_category(user_client, admin_client):
    category = _make_category(admin_client, name="Printing Costs", category_type="cost")
    response = user_client.delete(f"/api/v1/finance-categories/{category['id']}")
    assert response.status_code == 403


# --- Operational entries ---


def test_create_operational_entry_auto_computes_rotary_year(admin_client):
    category = _make_category(admin_client, name="Donations Income", category_type="revenue")
    response = admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(category["id"], entry_date="2025-03-01"),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == 2024
    assert body["source"] == "manual"


def test_create_operational_entry_rejects_mismatched_category_type(admin_client):
    cost_category = _make_category(admin_client, name="Printing", category_type="cost")
    response = admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(cost_category["id"], entry_type="revenue"),
    )
    assert response.status_code == 422


def test_non_admin_cannot_create_operational_entry(user_client, admin_client):
    category = _make_category(admin_client, name="Merch Sales", category_type="revenue")
    response = user_client.post(
        "/api/v1/operational-entries", json=_entry(category["id"])
    )
    assert response.status_code == 403


def test_list_operational_entries_filtered_by_type_and_year(admin_client):
    revenue_cat = _make_category(admin_client, name="Ticket Sales", category_type="revenue")
    cost_cat = _make_category(admin_client, name="Venue Rental", category_type="cost")
    admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(revenue_cat["id"], entry_type="revenue", entry_date="2024-09-01"),
    )
    admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(cost_cat["id"], entry_type="cost", entry_date="2024-09-01"),
    )
    admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(revenue_cat["id"], entry_type="revenue", entry_date="2023-09-01"),
    )

    response = admin_client.get(
        "/api/v1/operational-entries", params={"rotary_year": 2024, "type": "revenue"}
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["type"] == "revenue"
    assert body[0]["rotary_year"] == 2024


def test_user_with_read_grant_can_list_operational_entries(
    user_client, admin_client, _grant_default_finance_operational_read
):
    category = _make_category(admin_client, name="Interest Income", category_type="revenue")
    admin_client.post("/api/v1/operational-entries", json=_entry(category["id"]))
    response = user_client.get("/api/v1/operational-entries")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_patch_operational_entry_amount(admin_client):
    category = _make_category(admin_client, name="Grants", category_type="revenue")
    created = admin_client.post(
        "/api/v1/operational-entries", json=_entry(category["id"], amount=50)
    ).json()
    response = admin_client.patch(
        f"/api/v1/operational-entries/{created['id']}", json={"amount": 75.5}
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 75.5


def test_patch_operational_entry_rejects_mismatched_category_type(admin_client):
    revenue_cat = _make_category(admin_client, name="Ad Revenue", category_type="revenue")
    cost_cat = _make_category(admin_client, name="Insurance", category_type="cost")
    created = admin_client.post(
        "/api/v1/operational-entries", json=_entry(revenue_cat["id"], entry_type="revenue")
    ).json()

    response = admin_client.patch(
        f"/api/v1/operational-entries/{created['id']}", json={"category_id": cost_cat["id"]}
    )
    assert response.status_code == 422


def test_admin_can_delete_operational_entry(admin_client):
    category = _make_category(admin_client, name="Bank Interest", category_type="revenue")
    created = admin_client.post(
        "/api/v1/operational-entries", json=_entry(category["id"])
    ).json()
    response = admin_client.delete(f"/api/v1/operational-entries/{created['id']}")
    assert response.status_code == 204
    remaining = admin_client.get("/api/v1/operational-entries").json()
    assert remaining == []


def test_non_admin_cannot_delete_operational_entry(user_client, admin_client):
    category = _make_category(admin_client, name="Consulting Fees", category_type="revenue")
    created = admin_client.post(
        "/api/v1/operational-entries", json=_entry(category["id"])
    ).json()
    response = user_client.delete(f"/api/v1/operational-entries/{created['id']}")
    assert response.status_code == 403


# --- Operational summary (manual + auto Member Fees / Event cost rows) ---


def test_operational_summary_returns_zero_when_no_data(admin_client):
    response = admin_client.get(
        "/api/v1/finance/operational-summary", params={"rotary_year": 2025}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["revenue"] == []
    assert body["cost"] == []
    assert body["total_revenue"] == 0
    assert body["total_cost"] == 0


def test_operational_summary_includes_manual_entries(admin_client):
    revenue_cat = _make_category(admin_client, name="Raffle", category_type="revenue")
    cost_cat = _make_category(admin_client, name="Supplies", category_type="cost")
    admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(revenue_cat["id"], entry_type="revenue", amount=300, entry_date="2025-08-01"),
    )
    admin_client.post(
        "/api/v1/operational-entries",
        json=_entry(cost_cat["id"], entry_type="cost", amount=120, entry_date="2025-08-01"),
    )

    response = admin_client.get(
        "/api/v1/finance/operational-summary", params={"rotary_year": 2025}
    )
    body = response.json()
    assert len(body["revenue"]) == 1
    assert body["revenue"][0]["editable"] is True
    assert body["revenue"][0]["category_name"] == "Raffle"
    assert body["total_revenue"] == 300
    assert len(body["cost"]) == 1
    assert body["total_cost"] == 120


def test_operational_summary_includes_auto_member_fees_revenue_row(
    admin_client, db_session, make_member_fee, make_member
):
    member = make_member()
    make_member_fee(member.id, rotary_year=2025, amount_due=500, is_paid=True)

    response = admin_client.get(
        "/api/v1/finance/operational-summary", params={"rotary_year": 2025}
    )
    body = response.json()
    fee_rows = [row for row in body["revenue"] if row["source"] == "member_fees"]
    assert len(fee_rows) == 1
    assert fee_rows[0]["editable"] is False
    assert fee_rows[0]["category_name"] == "Member Fees"
    assert fee_rows[0]["amount"] == 500
    assert body["total_revenue"] == 500


def test_operational_summary_includes_auto_event_cost_row(admin_client, db_session):
    event = _make_event(db_session, rotary_year=2025, name="Charity Ball")
    db_session.add(
        EventCost(id=uuid.uuid4(), event_id=event.id, name="Venue", quantity=1, unit_price=800, total_cost=800)
    )
    db_session.add(
        EventCost(id=uuid.uuid4(), event_id=event.id, name="Catering", quantity=1, unit_price=400, total_cost=400)
    )
    db_session.commit()

    response = admin_client.get(
        "/api/v1/finance/operational-summary", params={"rotary_year": 2025}
    )
    body = response.json()
    event_rows = [row for row in body["cost"] if row["source"] == "event"]
    assert len(event_rows) == 1
    assert event_rows[0]["editable"] is False
    assert event_rows[0]["category_name"] == "Charity Ball"
    assert event_rows[0]["amount"] == 1200
    assert body["total_cost"] == 1200


def test_operational_summary_includes_event_ticket_and_sponsor_revenue_alongside_cost(
    admin_client, db_session
):
    # Bug fix regression: an event's ticket + sponsor revenue must show up
    # as its own Revenue row alongside its cost row — not just the cost,
    # which used to make every event look like a pure loss to club
    # operations with no offsetting income.
    event = _make_event(db_session, rotary_year=2025, name="Gala Ball")
    db_session.add(
        EventSetup(id=uuid.uuid4(), event_id=event.id, ticket_price_normal=500)
    )
    db_session.add(
        EventGuest(id=uuid.uuid4(), event_id=event.id, surname="Doe", first_name="Jane")
    )
    db_session.add(
        EventGuest(id=uuid.uuid4(), event_id=event.id, surname="Smith", first_name="John")
    )
    db_session.add(
        EventSponsor(
            id=uuid.uuid4(), event_id=event.id, name="Acme Corp", quantity=1, unit_price=3000, total_cost=3000
        )
    )
    db_session.add(
        EventCost(id=uuid.uuid4(), event_id=event.id, name="Venue", quantity=1, unit_price=800, total_cost=800)
    )
    db_session.commit()

    response = admin_client.get(
        "/api/v1/finance/operational-summary", params={"rotary_year": 2025}
    )
    body = response.json()

    revenue_rows = [row for row in body["revenue"] if row["source"] == "event"]
    assert len(revenue_rows) == 1
    assert revenue_rows[0]["category_name"] == "Gala Ball"
    # 2 guests * 500 ticket price + 3000 sponsor = 4000
    assert revenue_rows[0]["amount"] == 4000
    assert revenue_rows[0]["editable"] is False

    cost_rows = [row for row in body["cost"] if row["source"] == "event"]
    assert len(cost_rows) == 1
    assert cost_rows[0]["amount"] == 800

    assert body["total_revenue"] == 4000
    assert body["total_cost"] == 800
