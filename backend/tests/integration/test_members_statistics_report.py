import pytest

pytestmark = pytest.mark.integration


def test_report_requires_authentication(client):
    response = client.post("/api/v1/members/statistics/report", params={"format": "pdf"})

    assert response.status_code == 401


def test_report_invalid_format_returns_422(user_client):
    response = user_client.post(
        "/api/v1/members/statistics/report", params={"format": "docx"}
    )

    assert response.status_code == 422


def test_report_missing_format_returns_422(user_client):
    response = user_client.post("/api/v1/members/statistics/report")

    assert response.status_code == 422


def test_any_authenticated_role_can_generate_pdf_report(
    admin_client, treasurer_client, user_client
):
    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "join_date": "2020-01-15",
            "nationality": "France",
            "gender": "Female",
        },
    )

    for authed_client in (admin_client, treasurer_client, user_client):
        response = authed_client.post(
            "/api/v1/members/statistics/report", params={"format": "pdf"}
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert "attachment" in response.headers["content-disposition"]
        assert response.content[:4] == b"%PDF"


def test_generate_pptx_report(admin_client):
    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "join_date": "2020-01-15",
            "nationality": "France",
            "gender": "Female",
        },
    )

    response = admin_client.post("/api/v1/members/statistics/report", params={"format": "pptx"})

    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert "attachment" in response.headers["content-disposition"]
    # PPTX/OOXML files are zip archives — verify the zip magic bytes rather
    # than fully parsing, to keep this a fast smoke test.
    assert response.content[:2] == b"PK"


def test_report_reflects_empty_dataset_without_error(user_client):
    response = user_client.post("/api/v1/members/statistics/report", params={"format": "pdf"})

    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"
