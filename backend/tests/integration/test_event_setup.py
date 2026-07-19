from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.integration

FUTURE = date.today() + timedelta(days=30)


@pytest.fixture
def event_id(admin_client):
    create = admin_client.post(
        "/api/v1/events",
        json={"name": "Annual Ball", "date": str(FUTURE), "venue": "Grand Hotel"},
    )
    return create.json()["id"]


def test_get_setup_defaults_to_null_prices_before_any_upsert(admin_client, event_id):
    response = admin_client.get(f"/api/v1/events/{event_id}/setup")
    assert response.status_code == 200
    body = response.json()
    assert body["ticket_price_normal"] is None
    assert body["ticket_price_early_bird"] is None
    assert body["lucky_draw_ticket_price"] is None


def test_upsert_setup_creates_then_updates(admin_client, event_id):
    first = admin_client.put(
        f"/api/v1/events/{event_id}/setup",
        json={
            "ticket_price_normal": 500,
            "ticket_price_early_bird": 400,
            "lucky_draw_ticket_price": 50,
        },
    )
    assert first.status_code == 200
    assert first.json()["ticket_price_normal"] == 500

    second = admin_client.put(
        f"/api/v1/events/{event_id}/setup",
        json={
            "ticket_price_normal": 600,
            "ticket_price_early_bird": 450,
            "lucky_draw_ticket_price": 60,
        },
    )
    assert second.status_code == 200
    assert second.json()["ticket_price_normal"] == 600

    # Also reflected on the event itself (Story 14.2's read-only display).
    event = admin_client.get("/api/v1/events").json()
    matching = next(e for e in event if e["id"] == event_id)
    assert matching["ticket_price_normal"] == 600


def test_table_mapping_crud(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/table-mapping",
        json={"table_number": 1, "theme_name": "Gold", "rotary_name": "Table 1"},
    )
    assert create.status_code == 201
    mapping_id = create.json()["id"]

    listing = admin_client.get(f"/api/v1/events/{event_id}/table-mapping")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/table-mapping/{mapping_id}",
        json={"theme_name": "Silver"},
    )
    assert update.status_code == 200
    assert update.json()["theme_name"] == "Silver"

    delete = admin_client.delete(f"/api/v1/events/{event_id}/table-mapping/{mapping_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get(f"/api/v1/events/{event_id}/table-mapping")
    assert listing_after.json() == []


def test_table_mapping_rejects_duplicate_table_number(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/table-mapping", json={"table_number": 1}
    )
    duplicate = admin_client.post(
        f"/api/v1/events/{event_id}/table-mapping", json={"table_number": 1}
    )
    assert duplicate.status_code == 409


@pytest.mark.parametrize("prefix", ["event-cost-categories", "event-sponsor-categories"])
def test_category_crud(admin_client, prefix):
    # Story 14.1's migration seeds default categories (Venue, Catering,
    # Title Sponsor, etc.) — use a name outside that seeded set so this test
    # doesn't collide with pre-existing rows.
    create = admin_client.post(f"/api/v1/{prefix}", json={"name": "Test Category XYZ"})
    assert create.status_code == 201
    category_id = create.json()["id"]

    listing = admin_client.get(f"/api/v1/{prefix}")
    assert listing.status_code == 200
    assert any(item["name"] == "Test Category XYZ" for item in listing.json())

    duplicate = admin_client.post(f"/api/v1/{prefix}", json={"name": "Test Category XYZ"})
    assert duplicate.status_code == 409

    update = admin_client.patch(f"/api/v1/{prefix}/{category_id}", json={"name": "Food & Beverage"})
    assert update.status_code == 200
    assert update.json()["name"] == "Food & Beverage"

    delete = admin_client.delete(f"/api/v1/{prefix}/{category_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get(f"/api/v1/{prefix}")
    assert all(item["id"] != category_id for item in listing_after.json())


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/setup")
    assert response.status_code == 403
