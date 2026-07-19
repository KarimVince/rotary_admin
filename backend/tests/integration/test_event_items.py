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


def test_lot_ref_sequences_are_independent_and_shared_for_lucky_draw(admin_client, event_id):
    auction_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Painting", "item_type": "auction", "value_hkd": 1000},
    )
    assert auction_1.json()["lot_ref"] == "A-1"

    on_stage_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Watch", "item_type": "lucky_draw_on_stage", "value_hkd": 500},
    )
    assert on_stage_1.json()["lot_ref"] == "L-1"

    regular_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Voucher", "item_type": "lucky_draw", "value_hkd": 100},
    )
    # Shares the same L sequence as lucky_draw_on_stage — continues from L-1.
    assert regular_1.json()["lot_ref"] == "L-2"

    auction_2 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Sculpture", "item_type": "auction", "value_hkd": 2000},
    )
    assert auction_2.json()["lot_ref"] == "A-2"


def test_list_sorted_by_type_group_then_value_descending(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Cheap Auction", "item_type": "auction", "value_hkd": 100},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Expensive Auction", "item_type": "auction", "value_hkd": 5000},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "On Stage", "item_type": "lucky_draw_on_stage", "value_hkd": 300},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Regular", "item_type": "lucky_draw", "value_hkd": 900},
    )

    listing = admin_client.get(f"/api/v1/events/{event_id}/items").json()
    names = [i["name"] for i in listing]
    # Auction group first (desc value), then on-stage, then regular —
    # regardless of the fact "Regular" has a higher value than "On Stage".
    assert names == ["Expensive Auction", "Cheap Auction", "On Stage", "Regular"]


def test_update_and_delete_item(admin_client, event_id, make_member):
    contact = make_member(first_name="Rotary", last_name="Contact")
    create = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={
            "name": "Painting",
            "item_type": "auction",
            "value_hkd": 1000,
            "contact_rotary_id": str(contact.id),
        },
    )
    item_id = create.json()["id"]
    assert create.json()["contact_rotary_name"] == "Rotary Contact"

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{item_id}",
        json={"status": "received", "value_sold": 1500},
    )
    assert update.status_code == 200
    assert update.json()["status"] == "received"
    assert update.json()["value_sold"] == 1500
    # lot_ref unaffected by update.
    assert update.json()["lot_ref"] == "A-1"

    delete = admin_client.delete(f"/api/v1/events/{event_id}/items/{item_id}")
    assert delete.status_code == 204


def test_lucky_draw_config_defaults_and_upsert(admin_client, event_id):
    default = admin_client.get(f"/api/v1/events/{event_id}/lucky-draw-config")
    assert default.status_code == 200
    assert default.json()["tickets_sold"] == 0
    assert default.json()["other_donation"] == 0

    first = admin_client.put(
        f"/api/v1/events/{event_id}/lucky-draw-config",
        json={"tickets_sold": 50, "other_donation": 200},
    )
    assert first.status_code == 200
    assert first.json()["tickets_sold"] == 50

    second = admin_client.put(
        f"/api/v1/events/{event_id}/lucky-draw-config",
        json={"tickets_sold": 75, "other_donation": 300},
    )
    assert second.json()["tickets_sold"] == 75
    assert second.json()["other_donation"] == 300


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/items")
    assert response.status_code == 403
