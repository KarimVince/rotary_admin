import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_statistics_read(make_app_function, make_permission_matrix_entry):
    # Story 12.3: the report endpoint shares members.statistics gating.
    app_function = make_app_function(key="members.statistics", label="Members — Statistics")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


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


def test_integral_pdf_report_generates_successfully(admin_client):
    # Story 8.13 (scoped to Members for this story): Integral adds a detail
    # table section on top of Simplified — just verify it still produces a
    # valid PDF, since asserting on rendered table content isn't practical
    # here (reportlab's Table/Paragraph flowables aren't easily introspected
    # after doc.build()).
    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pdf", "type": "integral"},
    )
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_integral_pptx_report_generates_successfully(admin_client):
    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pptx", "type": "integral"},
    )
    assert response.status_code == 200
    assert response.content[:2] == b"PK"


def test_invalid_report_type_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pdf", "type": "extravagant"},
    )
    assert response.status_code == 422


def test_use_template_without_upload_returns_400(admin_client):
    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pptx", "use_template": "true"},
    )
    assert response.status_code == 400


def test_use_template_with_pdf_format_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pdf", "use_template": "true"},
    )
    assert response.status_code == 422


def test_use_template_generates_pptx_from_uploaded_template(admin_client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))
    # A python-pptx-readable template needs to actually be a valid .pptx —
    # build a minimal real one rather than faking bytes, since build_pptx_report
    # opens it with Presentation(path).
    from pptx import Presentation

    real_template = tmp_path / "seed-template.pptx"
    Presentation().save(str(real_template))
    admin_client.post(
        "/api/v1/ppt-templates",
        files={
            "file": (
                "Annual.pptx",
                real_template.read_bytes(),
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )
        },
    )

    response = admin_client.post(
        "/api/v1/members/statistics/report",
        params={"format": "pptx", "use_template": "true"},
    )
    assert response.status_code == 200
    assert response.content[:2] == b"PK"
