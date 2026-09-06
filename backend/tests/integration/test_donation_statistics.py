from datetime import date
from io import BytesIO

import httpx
import pytest
from PIL import Image

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


def test_generate_pdf_report_with_organisation_logo_url_set(
    admin_client, make_organisation, monkeypatch
):
    # Story 16.35 redesign — the approved PDF table has no logo column at
    # all (Organisation, Country, Area of focus, Contact, Amount only), but
    # an org's logo is still fetched as part of building its report row
    # (shared with the PPTX path) — confirm that doesn't blow up the PDF
    # even though the PDF itself never uses the bytes.
    org = make_organisation(name="Alpha")
    admin_client.patch(
        f"/api/v1/organisations/{org.id}",
        json={
            "logo_url": "https://proj.supabase.co/storage/v1/object/public/public-assets/organisations/a.png"
        },
    )
    _seed(admin_client, org.id, 100, "2024-09-01")

    png_buf = BytesIO()
    Image.new("RGB", (1, 1)).save(png_buf, format="PNG")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, content=png_buf.getvalue()))

    response = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pdf", "rotary_year": 2024},
    )

    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"


def test_report_type_param_accepted_but_no_longer_changes_output(admin_client, make_organisation, monkeypatch):
    # Story 16.35 redesign — the district-template handoff has no
    # Simplified/Integral distinction (one fixed design covers both); the
    # `type` query param is still accepted so existing frontend calls don't
    # 422, but "simplified" and "integral" now produce byte-identical PDFs
    # for the same data.
    #
    # SOURCE_DATE_EPOCH enables ReportLab's invariant mode so both runs get
    # the same creation timestamp and document fingerprint — without it the
    # two separately-generated PDFs would differ at those bytes.
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "946684800")

    org_a = make_organisation(name="Alpha")
    org_b = make_organisation(name="Beta")
    _seed(admin_client, org_a.id, 100, "2024-09-01")
    _seed(admin_client, org_b.id, 300, "2024-09-02")

    simplified = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pdf", "type": "simplified", "rotary_year": 2024},
    )
    integral = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pdf", "type": "integral", "rotary_year": 2024},
    )

    assert simplified.status_code == 200
    assert integral.status_code == 200
    assert simplified.content == integral.content


def test_generate_pptx_report_with_webp_organisation_logo(
    admin_client, make_organisation, monkeypatch
):
    # Story 16.35 follow-up — real bug: python-pptx's add_picture rejects
    # WEBP outright (its own supported-format list has no WEBP), but Story
    # 16.6's logo upload validation allows WEBP — so a real org logo in
    # that format 500'd PPTX generation once the Organisations slide
    # started embedding logos. Fixed via _pptx_safe_image re-encoding to
    # PNG first.
    org = make_organisation(name="Alpha")
    admin_client.patch(
        f"/api/v1/organisations/{org.id}",
        json={
            "logo_url": "https://proj.supabase.co/storage/v1/object/public/public-assets/organisations/a.webp"
        },
    )
    _seed(admin_client, org.id, 100, "2024-09-01")

    webp_buf = BytesIO()
    Image.new("RGB", (10, 10)).save(webp_buf, format="WEBP")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, content=webp_buf.getvalue()))

    response = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pptx", "rotary_year": 2024},
    )

    assert response.status_code == 200
    assert response.content[:2] == b"PK"


def test_use_template_on_pdf_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/donations/statistics/report?format=pdf&use_template=true"
    )
    assert response.status_code == 422


def test_use_template_pptx_works_without_any_uploaded_template(admin_client, make_organisation):
    # Story 16.35 redesign — real bug fixed: this used to require an
    # admin-uploaded PPT Template file (Story 8.23's `download_template_for_
    # year`) and 400 without one, which is what crashed for the user (their
    # real annual template hit an unrelated python-pptx error once loaded
    # as the base Presentation). The redesign's "template" chrome is a
    # fixed shipped asset instead — no upload needed at all, so this must
    # now succeed with nothing uploaded.
    org = make_organisation(name="Alpha")
    _seed(admin_client, org.id, 100, "2024-09-01")

    response = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pptx", "use_template": "true", "rotary_year": 2024},
    )

    assert response.status_code == 200
    assert response.content[:2] == b"PK"


# Story 16.35 — NGO Module Planned Donations, statistics.


def _seed_planned(admin_client, org_id, amount, rotary_year_value, currency=None):
    payload = {"amount": amount, "planned": True, "rotary_year": rotary_year_value}
    if currency is not None:
        payload["currency"] = currency
    return admin_client.post(f"/api/v1/organisations/{org_id}/donations", json=payload)


def test_statistics_planned_donations_excluded_from_actual_totals(admin_client, make_organisation):
    org = make_organisation()
    _seed(admin_client, org.id, 100, "2024-09-01")
    _seed_planned(admin_client, org.id, 9999, 2024)

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    body = response.json()
    hkd = _currency_block(body, "HKD")

    # The planned 9999 must not leak into any actual-donation total.
    assert hkd["grand_total"] == 100.0
    assert body["selected_year"]["total_hkd"] == 100.0
    assert body["all_time"]["total_hkd"] == 100.0


def test_statistics_planned_by_rotary_year_current_and_future_only(
    admin_client, make_organisation
):
    org = make_organisation()
    current_year = rotary_year(date.today())
    _seed_planned(admin_client, org.id, 200, current_year)
    _seed_planned(admin_client, org.id, 300, current_year + 1)
    # A planned donation for a past year shouldn't appear here either.
    _seed_planned(admin_client, org.id, 999, current_year - 1)

    response = admin_client.get("/api/v1/donations/statistics")
    hkd = _currency_block(response.json(), "HKD")

    planned = {row["label"]: row["value"] for row in hkd["planned_by_rotary_year"]}
    assert planned == {str(current_year): 200.0, str(current_year + 1): 300.0}


def test_statistics_selected_year_planned_total(admin_client, make_organisation):
    org = make_organisation()
    _seed_planned(admin_client, org.id, 400, 2024)
    _seed(admin_client, org.id, 100, "2024-09-01")

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    body = response.json()

    assert body["selected_year_planned"]["total_hkd"] == 400.0
    # Never conflated into the actual total.
    assert body["selected_year"]["total_hkd"] == 100.0


def test_organisations_supported_count_includes_planned_only_orgs(
    admin_client, make_organisation
):
    # Story 16.35 follow-up — the Statistics *page*'s "Organisations
    # supported" figure counts an org supported by either an actual or a
    # planned donation; the older actual-only count (still used by the
    # PPTX/PDF report's own "Reach" figure) stays unchanged alongside it.
    org_actual = make_organisation(name="Actual Donor")
    org_planned = make_organisation(name="Planned-Only Donor")
    _seed(admin_client, org_actual.id, 100, "2024-09-01")
    _seed_planned(admin_client, org_planned.id, 500, 2024)

    response = admin_client.get("/api/v1/donations/statistics", params={"rotary_year": 2024})
    body = response.json()

    assert body["selected_year_organisations_count"] == 1
    assert body["selected_year_organisations_count_with_planned"] == 2
    assert body["all_time_organisations_count"] == 1
    assert body["all_time_organisations_count_with_planned"] == 2


def test_generate_report_with_planned_donations(admin_client, make_organisation):
    org = make_organisation(name="Alpha")
    _seed(admin_client, org.id, 100, "2024-09-01")
    _seed_planned(admin_client, org.id, 500, 2024)

    response = admin_client.post(
        "/api/v1/donations/statistics/report",
        params={"format": "pdf", "rotary_year": 2024},
    )
    assert response.status_code == 200
    assert response.content[:4] == b"%PDF"
