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


def test_create_computes_total_cost(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Flowers", "category": "Decoration", "quantity": 3, "unit_price": 50},
    )
    assert create.status_code == 201
    assert create.json()["total_cost"] == 150.0


def test_update_recomputes_total_cost(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Flowers", "category": "Decoration", "quantity": 3, "unit_price": 50},
    )
    cost_id = create.json()["id"]

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/costs/{cost_id}", json={"quantity": 5}
    )
    assert update.status_code == 200
    assert update.json()["total_cost"] == 250.0


def test_list_and_delete(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Flowers", "category": "Decoration", "quantity": 1, "unit_price": 100},
    )
    cost_id = create.json()["id"]

    listing = admin_client.get(f"/api/v1/events/{event_id}/costs")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    delete = admin_client.delete(f"/api/v1/events/{event_id}/costs/{cost_id}")
    assert delete.status_code == 204

    listing_after = admin_client.get(f"/api/v1/events/{event_id}/costs")
    assert listing_after.json() == []


def test_report_pdf_and_csv(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Flowers", "category": "Decoration", "quantity": 2, "unit_price": 50},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Catering Staff", "category": "Catering", "quantity": 4, "unit_price": 200},
    )

    pdf = admin_client.get(f"/api/v1/events/{event_id}/costs/report?format=pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"

    csv_response = admin_client.get(f"/api/v1/events/{event_id}/costs/report?format=csv")
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    text = csv_response.text
    assert "Flowers" in text
    assert "Catering Staff" in text
    assert "Decoration" in text


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/costs")
    assert response.status_code == 403
