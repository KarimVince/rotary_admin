from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.integration

FUTURE = date.today() + timedelta(days=30)


@pytest.fixture
def event_id(admin_client):
    create = admin_client.post(
        "/api/v1/events",
        json={"name": "Gala", "date": str(FUTURE), "venue": "Grand Hotel"},
    )
    return create.json()["id"]


def test_create_computes_total(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme Corp", "category": "Gold", "quantity": 1, "unit_price": 5000},
    )
    assert create.status_code == 201
    assert create.json()["total_cost"] == 5000.0


def test_update_recomputes_total(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme Corp", "category": "Gold", "quantity": 1, "unit_price": 5000},
    )
    sponsor_id = create.json()["id"]

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/sponsors/{sponsor_id}", json={"quantity": 2}
    )
    assert update.status_code == 200
    assert update.json()["total_cost"] == 10000.0


def test_list_and_delete(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme Corp", "category": "Gold", "quantity": 1, "unit_price": 5000},
    )
    sponsor_id = create.json()["id"]

    listing = admin_client.get(f"/api/v1/events/{event_id}/sponsors")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    delete = admin_client.delete(f"/api/v1/events/{event_id}/sponsors/{sponsor_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get(f"/api/v1/events/{event_id}/sponsors")
    assert listing_after.json() == []


def test_report_pdf_and_csv(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme Corp", "category": "Gold", "quantity": 1, "unit_price": 5000},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Beta Ltd", "category": "Silver", "quantity": 2, "unit_price": 1000},
    )

    pdf = admin_client.get(f"/api/v1/events/{event_id}/sponsors/report?format=pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"

    csv_response = admin_client.get(f"/api/v1/events/{event_id}/sponsors/report?format=csv")
    assert csv_response.status_code == 200
    text = csv_response.text
    assert "Acme Corp" in text
    assert "Beta Ltd" in text


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/sponsors")
    assert response.status_code == 403
