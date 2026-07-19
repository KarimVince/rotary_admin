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


@pytest.fixture
def with_guests(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/table-mapping",
        json={"table_number": 1, "theme_name": "Gold", "rotary_name": "Table 1 Rotary"},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Smith", "first_name": "John", "table_number": 1},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/guests",
        json={"surname": "Doe", "first_name": "Jane", "table_number": None},
    )
    return event_id


def test_pdf_report_returns_pdf(admin_client, with_guests):
    response = admin_client.get(f"/api/v1/events/{with_guests}/guests/report?format=pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_csv_report_groups_by_table_and_includes_unassigned(admin_client, with_guests):
    response = admin_client.get(f"/api/v1/events/{with_guests}/guests/report?format=csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    text = response.text
    assert "Smith" in text
    assert "Gold" in text
    assert "Table 1 Rotary" in text
    assert "Doe" in text
    # Unassigned guest has no theme/rotary name in its row.
    lines = [line for line in text.splitlines() if "Doe" in line]
    assert len(lines) == 1
    assert lines[0].startswith(",,,")


def test_report_requires_format(admin_client, with_guests):
    response = admin_client.get(f"/api/v1/events/{with_guests}/guests/report")
    assert response.status_code == 422


def test_user_without_access_is_forbidden(user_client, with_guests):
    response = user_client.get(f"/api/v1/events/{with_guests}/guests/report?format=pdf")
    assert response.status_code == 403
