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


def test_default_rundown_seeded_on_event_creation(event_id, admin_client):
    listing = admin_client.get(f"/api/v1/events/{event_id}/rundown")
    assert listing.status_code == 200
    rows = listing.json()
    assert len(rows) == 19
    assert rows[0]["time"] == "Before 7:30 PM"
    assert rows[0]["activity"] == "Welcoming guests - Cocktail"
    assert rows[0]["highlight"] is False
    assert rows[1]["highlight"] is True
    # sort_order preserved in ascending order matching the template.
    assert [r["sort_order"] for r in rows] == list(range(19))


def test_create_edit_delete_row(admin_client, event_id):
    create = admin_client.post(
        f"/api/v1/events/{event_id}/rundown",
        json={"time": "6:00 PM", "activity": "Doors open", "highlight": False},
    )
    assert create.status_code == 201
    row_id = create.json()["id"]
    # New row appended after the 19 default rows.
    assert create.json()["sort_order"] == 19

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/rundown/{row_id}", json={"highlight": True}
    )
    assert update.status_code == 200
    assert update.json()["highlight"] is True

    delete = admin_client.delete(f"/api/v1/events/{event_id}/rundown/{row_id}")
    assert delete.status_code == 204


def test_reorder_persists(admin_client, event_id):
    rows = admin_client.get(f"/api/v1/events/{event_id}/rundown").json()
    first_id = rows[0]["id"]
    second_id = rows[1]["id"]

    reorder = admin_client.patch(
        f"/api/v1/events/{event_id}/rundown/reorder",
        json={"items": [{"id": first_id, "sort_order": 1}, {"id": second_id, "sort_order": 0}]},
    )
    assert reorder.status_code == 200

    after = admin_client.get(f"/api/v1/events/{event_id}/rundown").json()
    assert after[0]["id"] == second_id
    assert after[1]["id"] == first_id


def test_pdf_and_csv_reports(admin_client, event_id):
    pdf = admin_client.get(f"/api/v1/events/{event_id}/rundown/report?format=pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"

    csv_response = admin_client.get(f"/api/v1/events/{event_id}/rundown/report?format=csv")
    assert csv_response.status_code == 200
    text = csv_response.text
    assert "Welcoming guests - Cocktail" in text
    assert "Sort Order,Time,Activity,Highlight" in text


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/rundown")
    assert response.status_code == 403
