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


def test_summary_computes_all_sections(admin_client, event_id):
    admin_client.put(
        f"/api/v1/events/{event_id}/setup",
        json={"ticket_price_normal": 500, "ticket_price_early_bird": 400, "lucky_draw_ticket_price": 50},
    )
    admin_client.put(
        f"/api/v1/events/{event_id}/lucky-draw-config",
        json={"tickets_sold": 100, "other_donation": 500},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Painting", "item_type": "auction", "value_hkd": 1000},
    )
    item_id = admin_client.get(f"/api/v1/events/{event_id}/items").json()[0]["id"]
    admin_client.patch(f"/api/v1/events/{event_id}/items/{item_id}", json={"value_sold": 2000})

    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "A", "first_name": "A", "early_bird": False},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "B", "first_name": "B", "early_bird": True},
    )

    admin_client.post(
        f"/api/v1/events/{event_id}/sponsors",
        json={"name": "Acme", "category": "Gold", "quantity": 1, "unit_price": 3000},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/costs",
        json={"name": "Flowers", "category": "Decoration", "quantity": 2, "unit_price": 50},
    )

    response = admin_client.get(f"/api/v1/events/{event_id}/summary")
    assert response.status_code == 200
    body = response.json()

    # Fundraising: auction 2000 + lucky draw (50*100=5000) + other donation 500 = 7500
    assert body["auction_total"] == 2000.0
    assert body["lucky_draw_total"] == 5000.0
    assert body["other_donation"] == 500.0
    assert body["total_raised"] == 7500.0

    # Revenue: ticket (500*1 normal + 400*1 early bird = 900) + sponsor (3000) = 3900
    assert body["ticket_revenue"] == 900.0
    assert body["sponsor_revenue"] == 3000.0
    assert body["total_revenue"] == 3900.0

    # Cost: 2*50 = 100
    assert body["total_cost"] == 100.0
    assert body["cost_per_category"] == [{"label": "Decoration", "value": 100.0}]

    # Net operational result: 3900 - 100 = 3800
    assert body["net_operational_result"] == 3800.0

    assert len(body["revenue_breakdown"]) == 3
    assert len(body["result_overview"]) == 3


def test_summary_defaults_to_zero_with_no_data(admin_client, event_id):
    response = admin_client.get(f"/api/v1/events/{event_id}/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["total_raised"] == 0.0
    assert body["total_revenue"] == 0.0
    assert body["net_operational_result"] == 0.0


def test_pdf_and_pptx_reports(admin_client, event_id):
    pdf = admin_client.get(f"/api/v1/events/{event_id}/summary/report?format=pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"

    pptx = admin_client.get(f"/api/v1/events/{event_id}/summary/report?format=pptx")
    assert pptx.status_code == 200
    assert (
        pptx.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/summary")
    assert response.status_code == 403
