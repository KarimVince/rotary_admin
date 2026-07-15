import pytest

pytestmark = pytest.mark.integration


def test_statistics_requires_authentication(client):
    response = client.get("/api/v1/rotary-friends/statistics")
    assert response.status_code == 401


def test_statistics_empty_when_no_friends(admin_client):
    response = admin_client.get("/api/v1/rotary-friends/statistics")
    assert response.status_code == 200
    body = response.json()
    assert body["total_friends"] == 0
    assert body["by_source"] == []
    assert body["by_tag"] == []
    assert body["contactability"] == []


def test_statistics_aggregates_source_and_tag(admin_client):
    admin_client.post(
        "/api/v1/rotary-friends",
        json={
            "first_name": "Sara",
            "last_name": "Nguyen",
            "email": "sara@example.com",
            "tags": "donor, alumni",
            "source": "Gala 2024",
        },
    )
    admin_client.post(
        "/api/v1/rotary-friends",
        json={
            "first_name": "Jamie",
            "last_name": "Lee",
            "email": "jamie@example.com",
            "tags": "donor",
            "source": "Gala 2024",
        },
    )

    response = admin_client.get("/api/v1/rotary-friends/statistics")
    body = response.json()

    assert body["total_friends"] == 2
    by_source = {row["label"]: row["value"] for row in body["by_source"]}
    assert by_source == {"Gala 2024": 2}
    by_tag = {row["label"]: row["value"] for row in body["by_tag"]}
    assert by_tag == {"donor": 2, "alumni": 1}


def test_report_requires_authentication(client):
    response = client.post("/api/v1/rotary-friends/statistics/report?format=pdf")
    assert response.status_code == 401


def test_generate_pdf_report(admin_client):
    admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Sara", "last_name": "Nguyen", "email": "sara@example.com"},
    )

    response = admin_client.post("/api/v1/rotary-friends/statistics/report?format=pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"
    assert "friends-statistics_" in response.headers["content-disposition"]


def test_generate_pptx_report(admin_client):
    response = admin_client.post("/api/v1/rotary-friends/statistics/report?format=pptx")

    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert response.content[:2] == b"PK"


def test_generate_integral_report_includes_detail(admin_client):
    admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Sara", "last_name": "Nguyen", "email": "sara@example.com"},
    )

    response = admin_client.post(
        "/api/v1/rotary-friends/statistics/report?format=pdf&type=integral"
    )

    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_use_template_on_pdf_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends/statistics/report?format=pdf&use_template=true"
    )
    assert response.status_code == 422


def test_use_template_without_upload_returns_400(admin_client, monkeypatch, tmp_path):
    # Isolated from any real template file that might exist in the ambient
    # local uploads/ dir (e.g. from manual testing) — otherwise this test's
    # result depends on whatever happens to be on disk for the current year.
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/rotary-friends/statistics/report?format=pptx&use_template=true"
    )
    assert response.status_code == 400


def test_statistics_contactability_breakdown(admin_client):
    admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Email", "last_name": "Only", "email": "e@example.com"},
    )
    admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Whats", "last_name": "Only", "whatsapp": "+85298765432"},
    )
    admin_client.post(
        "/api/v1/rotary-friends",
        json={
            "first_name": "Both",
            "last_name": "Channels",
            "email": "both@example.com",
            "whatsapp": "+85298765433",
        },
    )

    response = admin_client.get("/api/v1/rotary-friends/statistics")
    body = response.json()

    contactability = {row["label"]: row["value"] for row in body["contactability"]}
    assert contactability == {"Email only": 1, "WhatsApp only": 1, "Both": 1}
