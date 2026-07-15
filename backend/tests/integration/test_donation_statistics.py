from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_ngos_statistics_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="ngos.statistics", label="NGOs & Donations — Statistics")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _seed(admin_client, org_id, amount, donation_date, currency=None):
    payload = {"amount": amount, "donation_date": donation_date}
    if currency is not None:
        payload["currency"] = currency
    return admin_client.post(f"/api/v1/organisations/{org_id}/donations", json=payload)


def _currency_block(body, currency):
    return next(block for block in body["by_currency"] if block["currency"] == currency)


def test_statistics_empty_when_no_donations(admin_client):
    response = admin_client.get("/api/v1/donations/statistics")
    assert response.status_code == 200
    assert response.json()["by_currency"] == []


def test_statistics_aggregates_totals(admin_client, make_organisation):
    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")

    # Rotary year 2024 (2024-07-01 → 2025-06-30)
    _seed(admin_client, org_a.id, 100, "2024-09-01")
    _seed(admin_client, org_b.id, 300, "2025-01-01")
    # Rotary year 2023
    _seed(admin_client, org_a.id, 50, "2023-09-01")

    response = admin_client.get("/api/v1/donations/statistics")
    assert response.status_code == 200
    body = response.json()

    # All seeded without an explicit currency default to HKD.
    hkd = _currency_block(body, "HKD")

    total_by_year = {row["label"]: row["value"] for row in hkd["total_by_rotary_year"]}
    assert total_by_year == {"2023": 50.0, "2024": 400.0}

    # Ordered by total descending: Beta (300) before Alpha (150).
    org_totals = [(row["label"], row["value"]) for row in hkd["total_by_organisation"]]
    assert org_totals == [("Beta", 300.0), ("Alpha", 150.0)]

    orgs_by_year = {row["label"]: row["value"] for row in hkd["organisations_by_rotary_year"]}
    assert orgs_by_year == {"2023": 1, "2024": 2}

    assert hkd["grand_total"] == 450.0


def test_statistics_keeps_currencies_separate(admin_client, make_organisation):
    org = make_organisation()
    _seed(admin_client, org.id, 100, "2024-09-01", currency="HKD")
    _seed(admin_client, org.id, 200, "2024-09-02", currency="USD")

    response = admin_client.get("/api/v1/donations/statistics")
    body = response.json()

    currencies = {block["currency"] for block in body["by_currency"]}
    assert currencies == {"HKD", "USD"}
    assert _currency_block(body, "HKD")["grand_total"] == 100.0
    assert _currency_block(body, "USD")["grand_total"] == 200.0


def test_statistics_requires_authentication(client):
    response = client.get("/api/v1/donations/statistics")
    assert response.status_code == 401


def test_statistics_readable_by_user(user_client):
    response = user_client.get("/api/v1/donations/statistics")
    assert response.status_code == 200


def test_statistics_selected_year_defaults_to_current_rotary_year(admin_client):
    response = admin_client.get("/api/v1/donations/statistics")
    assert response.status_code == 200
    assert response.json()["selected_rotary_year"] == rotary_year(date.today())


def test_statistics_selected_year_query_param(admin_client, make_organisation):
    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")

    _seed(admin_client, org_a.id, 100, "2024-09-01", currency="HKD")
    _seed(admin_client, org_b.id, 200, "2024-09-02", currency="HKD")
    _seed(admin_client, org_a.id, 50, "2023-09-01", currency="HKD")

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()

    assert body["selected_rotary_year"] == 2024
    assert body["selected_year_organisations_count"] == 2
    assert body["selected_year"]["total_hkd"] == 300.0
    assert body["selected_year"]["unconverted_count"] == 0


def test_statistics_all_time_converts_across_currencies(admin_client, make_organisation):
    org = make_organisation()
    _seed(admin_client, org.id, 100, "2024-09-01", currency="HKD")
    _seed(admin_client, org.id, 10, "2024-09-02", currency="USD")

    response = admin_client.get("/api/v1/donations/statistics")
    body = response.json()

    # Seeded rates: HKD self-rate 1.0, USD -> HKD 7.8.
    assert body["all_time"]["total_hkd"] == pytest.approx(100.0 + 10.0 * 7.8)
    assert body["all_time"]["unconverted_count"] == 0


def test_statistics_all_time_organisations_count_is_distinct_across_years(
    admin_client, make_organisation
):
    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")

    _seed(admin_client, org_a.id, 100, "2023-09-01")
    _seed(admin_client, org_a.id, 50, "2024-09-01")
    _seed(admin_client, org_b.id, 200, "2024-09-02")

    response = admin_client.get("/api/v1/donations/statistics")
    body = response.json()

    # Alpha donated in two different years but counts once.
    assert body["all_time_organisations_count"] == 2


def test_statistics_total_by_organisation_selected_year_is_year_scoped(
    admin_client, make_organisation
):
    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")

    _seed(admin_client, org_a.id, 100, "2024-09-01")
    _seed(admin_client, org_b.id, 300, "2024-09-02")
    # Prior year — must not appear in the 2024-scoped breakdown.
    _seed(admin_client, org_a.id, 999, "2023-09-01")

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    hkd = _currency_block(response.json(), "HKD")

    selected_year_totals = {
        row["label"]: row["value"] for row in hkd["total_by_organisation_selected_year"]
    }
    assert selected_year_totals == {"Alpha": 100.0, "Beta": 300.0}
    # The all-time breakdown (unchanged field) still includes the prior year.
    all_time_totals = {row["label"]: row["value"] for row in hkd["total_by_organisation"]}
    assert all_time_totals == {"Alpha": 1099.0, "Beta": 300.0}


def test_statistics_total_by_classification_all_time_ignores_selected_year(
    admin_client, make_organisation, db_session
):
    from app.models import NgoClassification

    classification = NgoClassification(name="Test Health Class")
    db_session.add(classification)
    db_session.commit()
    db_session.refresh(classification)

    org = make_organisation(name="Gamma")
    org.classification_id = classification.id
    db_session.commit()

    _seed(admin_client, org.id, 100, "2024-09-01")
    _seed(admin_client, org.id, 50, "2023-09-01")

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    hkd = _currency_block(response.json(), "HKD")

    all_time_totals = {row["label"]: row["value"] for row in hkd["total_by_classification_all_time"]}
    assert all_time_totals == {"Test Health Class": 150.0}
    # The selected-year breakdown (unchanged field) only covers 2024.
    selected_year_totals = {row["label"]: row["value"] for row in hkd["total_by_classification"]}
    assert selected_year_totals == {"Test Health Class": 100.0}


def test_statistics_reports_unconverted_currencies_without_rate(admin_client, make_organisation):
    org = make_organisation()
    _seed(admin_client, org.id, 100, "2024-09-01", currency="HKD")
    _seed(admin_client, org.id, 50, "2024-09-02", currency="SGD")

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    body = response.json()

    assert body["selected_year"]["total_hkd"] == 100.0
    assert body["selected_year"]["unconverted_count"] == 1
    assert body["selected_year"]["unconverted_currencies"] == ["SGD"]
    # Distinct-organisation count is unaffected by conversion — the org is
    # still "supported" even though one of its donations couldn't convert.
    assert body["selected_year_organisations_count"] == 1


def test_report_requires_authentication(client):
    response = client.post("/api/v1/donations/statistics/report?format=pdf")
    assert response.status_code == 401


def test_generate_pdf_report_with_no_donations(admin_client):
    response = admin_client.post("/api/v1/donations/statistics/report?format=pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"
    assert "ngo-statistics_" in response.headers["content-disposition"]


def test_generate_pptx_report(admin_client, make_organisation):
    org = make_organisation(name="Alpha")
    _seed(admin_client, org.id, 100, "2024-09-01")

    response = admin_client.post(
        "/api/v1/donations/statistics/report", params={"format": "pptx", "rotary_year": 2024}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert response.content[:2] == b"PK"


def test_generate_integral_report_with_donations(admin_client, make_organisation):
    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")
    _seed(admin_client, org_a.id, 100, "2024-09-01")
    _seed(admin_client, org_b.id, 300, "2024-09-02")

    response = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pdf", "type": "integral", "rotary_year": 2024},
    )

    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_use_template_on_pdf_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/donations/statistics/report?format=pdf&use_template=true"
    )
    assert response.status_code == 422


def test_use_template_without_upload_returns_400(admin_client, monkeypatch, tmp_path):
    # Isolated from any real template file that might exist in the ambient
    # local uploads/ dir (e.g. from manual testing) — otherwise this test's
    # result depends on whatever happens to be on disk for the current year.
    monkeypatch.setattr("app.api.ppt_templates.settings.upload_dir", str(tmp_path))

    response = admin_client.post(
        "/api/v1/donations/statistics/report?format=pptx&use_template=true"
    )
    assert response.status_code == 400
