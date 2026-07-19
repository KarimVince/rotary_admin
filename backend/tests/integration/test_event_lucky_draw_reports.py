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


@pytest.fixture
def with_items(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Painting", "item_type": "auction", "value_hkd": 1000, "donor_sponsor": "Gallery"},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Watch", "item_type": "lucky_draw_on_stage", "value_hkd": 500},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Voucher", "item_type": "lucky_draw", "value_hkd": 100},
    )
    return event_id


def test_programme_report_returns_pdf(admin_client, with_items):
    response = admin_client.get(f"/api/v1/events/{with_items}/items/report/programme")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_results_report_returns_pdf(admin_client, with_items):
    response = admin_client.get(f"/api/v1/events/{with_items}/items/report/results")
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_auction_receipts_report_returns_pdf(admin_client, with_items):
    response = admin_client.get(f"/api/v1/events/{with_items}/items/report/auction-receipts")
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_auction_receipts_report_uses_configured_payment_info(admin_client, with_items):
    admin_client.put(
        f"/api/v1/events/{with_items}/setup",
        json={"bank_account": "123-456-789", "fps_id": "9876543", "payment_deadline": str(FUTURE)},
    )
    response = admin_client.get(f"/api/v1/events/{with_items}/items/report/auction-receipts")
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_auction_receipts_report_400_when_no_auction_items(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Voucher", "item_type": "lucky_draw", "value_hkd": 100},
    )
    response = admin_client.get(f"/api/v1/events/{event_id}/items/report/auction-receipts")
    assert response.status_code == 400


def test_user_without_access_is_forbidden(user_client, with_items):
    response = user_client.get(f"/api/v1/events/{with_items}/items/report/programme")
    assert response.status_code == 403
