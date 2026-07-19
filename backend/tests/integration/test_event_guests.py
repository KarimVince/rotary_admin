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


def test_create_list_update_delete_guest(admin_client, event_id, make_member):
    contact = make_member(first_name="Contact", last_name="Rotarian")

    create = admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={
            "title": "Mr",
            "surname": "Smith",
            "first_name": "John",
            "contact_rotarian_id": str(contact.id),
            "early_bird": True,
            "table_number": 1,
        },
    )
    assert create.status_code == 201
    body = create.json()
    assert body["contact_rotarian_name"] == "Contact Rotarian"
    assert body["payment_status"] == "not_paid"
    guest_id = body["id"]

    listing = admin_client.get(f"/api/v1/events/{event_id}/guests")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/guests/{guest_id}", json={"payment_status": "paid"}
    )
    assert update.status_code == 200
    assert update.json()["payment_status"] == "paid"

    delete = admin_client.delete(f"/api/v1/events/{event_id}/guests/{guest_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get(f"/api/v1/events/{event_id}/guests")
    assert listing_after.json() == []


def test_create_requires_surname_and_first_name(admin_client, event_id):
    response = admin_client.post(f"/api/v1/events/{event_id}/guests", json={})
    assert response.status_code == 422


def test_list_sorted_by_table_number_then_surname(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Zeta", "first_name": "A", "table_number": 1},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Alpha", "first_name": "B", "table_number": 1},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Beta", "first_name": "C", "table_number": None},
    )

    listing = admin_client.get(f"/api/v1/events/{event_id}/guests").json()
    surnames = [g["surname"] for g in listing]
    assert surnames == ["Alpha", "Zeta", "Beta"]


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/guests")
    assert response.status_code == 403


def test_update_unknown_guest_returns_404(admin_client, event_id):
    response = admin_client.patch(
        f"/api/v1/events/{event_id}/guests/00000000-0000-0000-0000-000000000000",
        json={"payment_status": "paid"},
    )
    assert response.status_code == 404
