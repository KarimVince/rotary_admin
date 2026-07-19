from datetime import date, timedelta

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration

FUTURE = date.today() + timedelta(days=30)
PAST = date(2020, 1, 15)


def test_admin_can_create_list_update_delete_event(admin_client, make_member):
    chair = make_member(first_name="Chair", last_name="Person")

    create = admin_client.post(
        "/api/v1/events",
        json={
            "name": "Annual Ball",
            "date": str(FUTURE),
            "hour": "19:30:00",
            "venue": "Grand Hotel",
            "oc_chair_member_id": str(chair.id),
            "theme": "Masquerade",
        },
    )
    assert create.status_code == 201
    body = create.json()
    assert body["rotary_year"] == rotary_year(FUTURE)
    assert body["oc_chair_member_name"] == "Chair Person"
    assert body["ticket_price_normal"] is None
    event_id = body["id"]

    listing = admin_client.get("/api/v1/events")
    assert listing.status_code == 200
    assert any(item["id"] == event_id for item in listing.json())

    update = admin_client.patch(
        f"/api/v1/events/{event_id}", json={"venue": "New Venue", "theme": "Retro"}
    )
    assert update.status_code == 200
    assert update.json()["venue"] == "New Venue"
    assert update.json()["theme"] == "Retro"

    delete = admin_client.delete(f"/api/v1/events/{event_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get("/api/v1/events")
    assert all(item["id"] != event_id for item in listing_after.json())


def test_create_requires_name_and_date(admin_client):
    response = admin_client.post(
        "/api/v1/events",
        json={"venue": "Grand Hotel"},
    )
    assert response.status_code == 422


def test_update_date_recomputes_rotary_year(admin_client):
    create = admin_client.post(
        "/api/v1/events",
        json={"name": "Ball", "date": str(FUTURE), "venue": "Grand Hotel"},
    )
    event_id = create.json()["id"]

    update = admin_client.patch(f"/api/v1/events/{event_id}", json={"date": str(PAST)})
    assert update.status_code == 200
    assert update.json()["rotary_year"] == rotary_year(PAST)


def test_user_without_access_is_forbidden(user_client):
    response = user_client.get("/api/v1/events")
    assert response.status_code == 403


def test_get_unknown_event_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/events/00000000-0000-0000-0000-000000000000", json={"venue": "X"}
    )
    assert response.status_code == 404


def test_list_includes_guest_sponsor_and_net_proceeds_aggregates(admin_client):
    create = admin_client.post(
        "/api/v1/events",
        json={"name": "Aggregates Ball", "date": str(FUTURE), "venue": "Grand Hotel"},
    )
    event_id = create.json()["id"]

    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Smith", "first_name": "John"},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Doe", "first_name": "Jane"},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme Corp", "category": "Gold", "quantity": 1, "unit_price": 5000},
    )

    listing = admin_client.get("/api/v1/events")
    assert listing.status_code == 200
    item = next(row for row in listing.json() if row["id"] == event_id)
    assert item["guest_count"] == 2
    assert item["sponsor_count"] == 1
    # Sponsor revenue (5000) with no costs/tickets/guests-paid → net proceeds == sponsor revenue.
    assert item["net_proceeds"] == 5000.0
