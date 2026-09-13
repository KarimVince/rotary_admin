import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_ngos_read(make_app_function, make_permission_matrix_entry):
    # Story 12.4: reads are matrix-gated now — matches the 12.10 seed default
    # (Default User = Read on ngos.organisations).
    app_function = make_app_function(key="ngos.organisations", label="NGOs & Donations — Organisations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def test_create_then_get_organisation_round_trip(admin_client):
    create_response = admin_client.post(
        "/api/v1/organisations",
        json={
            "name": "Helping Hands",
            "country": "Morocco",
            "contact_name": "Sara",
            "contact_email": "sara@example.com",
            "first_supported_year": 2019,
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Helping Hands"
    assert created["country"] == "Morocco"

    get_response = admin_client.get(f"/api/v1/organisations/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["contact_email"] == "sara@example.com"


def test_create_organisation_rejects_country_outside_fixed_list(admin_client):
    response = admin_client.post(
        "/api/v1/organisations", json={"name": "Bad Country Org", "country": "Freedonia"}
    )
    assert response.status_code == 422


def test_update_organisation_rejects_country_outside_fixed_list(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.patch(
        f"/api/v1/organisations/{org.id}", json={"country": "Freedonia"}
    )
    assert response.status_code == 422


def test_list_organisations_requires_authentication(client):
    response = client.get("/api/v1/organisations")
    assert response.status_code == 401


def test_user_can_read_organisations(user_client, make_organisation):
    make_organisation(name="Readable Org")
    response = user_client.get("/api/v1/organisations")
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert "Readable Org" in names


def test_non_admin_cannot_create_organisation(user_client):
    response = user_client.post("/api/v1/organisations", json={"name": "Nope"})
    assert response.status_code == 403


def test_treasurer_cannot_create_organisation(treasurer_client):
    response = treasurer_client.post("/api/v1/organisations", json={"name": "Nope"})
    assert response.status_code == 403


def test_search_organisations_by_name(admin_client, make_organisation):
    make_organisation(name="Clean Water Project", country="Chad")
    make_organisation(name="Library Fund", country="France")

    response = admin_client.get("/api/v1/organisations", params={"search": "water"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Clean Water Project"]


def test_search_organisations_by_country(admin_client, make_organisation):
    make_organisation(name="Clean Water Project", country="Chad")
    make_organisation(name="Library Fund", country="France")

    response = admin_client.get("/api/v1/organisations", params={"search": "france"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Library Fund"]


def test_admin_can_update_organisation(admin_client, make_organisation):
    org = make_organisation(name="Old Name")
    response = admin_client.patch(
        f"/api/v1/organisations/{org.id}", json={"name": "New Name", "country": "Spain"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"
    assert body["country"] == "Spain"


def test_update_organisation_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/organisations/00000000-0000-0000-0000-000000000000", json={"name": "x"}
    )
    assert response.status_code == 404


def test_non_admin_cannot_update_organisation(user_client, make_organisation):
    org = make_organisation()
    response = user_client.patch(f"/api/v1/organisations/{org.id}", json={"name": "x"})
    assert response.status_code == 403


def test_admin_can_delete_organisation(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.delete(f"/api/v1/organisations/{org.id}")
    assert response.status_code == 204

    get_response = admin_client.get(f"/api/v1/organisations/{org.id}")
    assert get_response.status_code == 404


def test_non_admin_cannot_delete_organisation(user_client, make_organisation):
    org = make_organisation()
    response = user_client.delete(f"/api/v1/organisations/{org.id}")
    assert response.status_code == 403


def test_delete_organisation_not_found_returns_404(admin_client):
    response = admin_client.delete(
        "/api/v1/organisations/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


def test_admin_can_upload_organisation_logo(admin_client, fake_storage):
    response = admin_client.post(
        "/api/v1/organisations/logo",
        files={"file": ("logo.png", b"fake-png-bytes", "image/png")},
    )

    assert response.status_code == 201
    logo_url = response.json()["logo_url"]
    assert logo_url.startswith("https://fake-supabase.test/")
    assert "/public-assets/organisations/" in logo_url
    assert logo_url.endswith(".png")
    stored_path = logo_url.rsplit("public-assets/", 1)[-1]
    assert fake_storage[("public-assets", stored_path)] == b"fake-png-bytes"


def test_non_admin_cannot_upload_organisation_logo(user_client):
    response = user_client.post(
        "/api/v1/organisations/logo",
        files={"file": ("logo.png", b"fake-png-bytes", "image/png")},
    )

    assert response.status_code == 403


def test_upload_organisation_logo_rejects_non_image_content_type(admin_client, fake_storage):
    response = admin_client.post(
        "/api/v1/organisations/logo",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_organisation_logo_rejects_oversized_file(admin_client, fake_storage, monkeypatch):
    monkeypatch.setattr("app.api.organisations.MAX_LOGO_BYTES", 10)

    response = admin_client.post(
        "/api/v1/organisations/logo",
        files={"file": ("logo.png", b"this-is-more-than-ten-bytes", "image/png")},
    )

    assert response.status_code == 422


def test_organisation_logo_url_persists_via_update(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.patch(
        f"/api/v1/organisations/{org.id}", json={"logo_url": "/static/organisations/abc.png"}
    )
    assert response.status_code == 200
    assert response.json()["logo_url"] == "/static/organisations/abc.png"


def test_list_organisations_without_rotary_year_omits_year_total(
    admin_client, make_organisation
):
    make_organisation(name="No Filter Org")
    response = admin_client.get("/api/v1/organisations")
    assert response.status_code == 200
    assert all(org["year_total"] is None for org in response.json())


def test_rotary_year_filter_only_returns_organisations_with_donations_that_year(
    admin_client, make_organisation
):
    funded = make_organisation(name="Funded This Year")
    make_organisation(name="Unfunded")
    admin_client.post(
        f"/api/v1/organisations/{funded.id}/donations",
        json={"amount": 100.0, "donation_date": "2025-03-01"},  # rotary_year 2024
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Funded This Year"]


def test_rotary_year_filter_computes_year_total_in_hkd(
    admin_client, make_organisation, make_exchange_rate
):
    make_exchange_rate(currency_code="EUR", rate_to_hkd=8.5, rate_to_usd=1.09)
    org = make_organisation(name="Converted Org")
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={
            "amount": 100.0,
            "donation_date": "2025-03-01",
            "currency": "EUR",
            "rotary_year": 2024,
        },
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["year_total"] == pytest.approx(850.0)


def test_rotary_year_filter_excludes_donations_from_other_years(
    admin_client, make_organisation
):
    org = make_organisation(name="Old Donor")
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 50.0, "donation_date": "2020-03-01"},  # rotary_year 2019
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    assert response.json() == []


def test_rotary_year_filter_includes_planned_only_organisations(
    admin_client, make_organisation
):
    # Story 16.35 follow-up — an org with only a *planned* (not-yet-made)
    # donation this year must still appear in the year-filtered list (the
    # NGO Directory needs this to show planned donations), with its
    # planned amount kept in the separate year_total_planned field rather
    # than folded into year_total.
    org = make_organisation(name="Forecast Donor")
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 999.0, "planned": True, "rotary_year": 2024},
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Forecast Donor"
    assert body[0]["year_total"] == 0.0
    assert body[0]["year_total_planned"] == 999.0


def test_rotary_year_filter_keeps_actual_and_planned_totals_separate(
    admin_client, make_organisation
):
    org = make_organisation(name="Mixed Donor")
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 100.0, "donation_date": "2025-03-01"},  # rotary_year 2024
    )
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 500.0, "planned": True, "rotary_year": 2024},
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["year_total"] == 100.0
    assert body[0]["year_total_planned"] == 500.0


# ---------------------------------------------------------------------------
# Year filter includes organisations with service hours (not just donations)
# ---------------------------------------------------------------------------

def test_rotary_year_filter_includes_service_hours_only_org(
    admin_client, make_organisation, make_member
):
    """An org with only service hours (no donations) must appear when filtering by year."""
    org = make_organisation(name="Services Only Org")
    member = make_member()
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json={"member_id": str(member.id), "hours": 5.0, "service_date": "2025-03-01"},
        # rotary_year 2024 derived from date
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Services Only Org"
    assert body[0]["year_service_hours"] == 5.0
    assert body[0]["year_total"] is None or body[0]["year_total"] == 0.0


def test_rotary_year_filter_shows_service_hours_badge_alongside_donation(
    admin_client, make_organisation, make_member
):
    """An org with both a donation and service hours in the same year shows both totals."""
    org = make_organisation(name="Dual Org")
    member = make_member()
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 200.0, "donation_date": "2025-03-01"},  # rotary_year 2024
    )
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json={"member_id": str(member.id), "hours": 3.5, "service_date": "2025-02-15"},
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["year_total"] == 200.0
    assert body[0]["year_service_hours"] == 3.5


def test_rotary_year_filter_separates_planned_and_actual_service_hours(
    admin_client, make_organisation
):
    """Planned service hours appear in year_service_hours_planned, not year_service_hours."""
    org = make_organisation(name="Planned Services Org")
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json={"hours": 10.0, "planned": True, "rotary_year": 2025},
    )

    response = admin_client.get("/api/v1/organisations", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Planned Services Org"
    assert body[0]["year_service_hours"] is None or body[0]["year_service_hours"] == 0.0
    assert body[0]["year_service_hours_planned"] == 10.0
