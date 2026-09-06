import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_ngos_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="ngos.organisations", label="NGOs & Donations — Organisations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _donation(amount=100.0, donation_date="2025-03-01", **extra):
    return {"amount": amount, "donation_date": donation_date, **extra}


def test_create_donation_auto_computes_rotary_year(admin_client, make_organisation):
    org = make_organisation()
    # 2025-03-01 falls in the 2024-07-01 → 2025-06-30 window → rotary_year 2024.
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(donation_date="2025-03-01")
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == 2024
    assert body["amount"] == 100.0
    assert body["currency"] == "HKD"
    assert body["created_by"] is not None


def test_create_donation_july_first_is_new_rotary_year(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(donation_date="2025-07-01")
    )
    assert response.json()["rotary_year"] == 2025


def test_create_donation_rotary_year_override(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json=_donation(donation_date="2025-03-01", rotary_year=2030),
    )
    assert response.json()["rotary_year"] == 2030


def test_create_donation_accepts_valid_currency(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(currency="usd")
    )
    assert response.status_code == 201
    assert response.json()["currency"] == "USD"


def test_create_donation_rejects_unsupported_currency(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(currency="XXX")
    )
    assert response.status_code == 422


def test_create_donation_on_missing_organisation_returns_404(admin_client):
    response = admin_client.post(
        "/api/v1/organisations/00000000-0000-0000-0000-000000000000/donations",
        json=_donation(),
    )
    assert response.status_code == 404


def test_create_donation_rejects_non_positive_amount(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(amount=0)
    )
    assert response.status_code == 422


def test_non_admin_cannot_create_donation(user_client, make_organisation):
    org = make_organisation()
    response = user_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    )
    assert response.status_code == 403


def test_list_organisation_donations_multi_year(admin_client, make_organisation):
    org = make_organisation()
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(donation_date="2023-09-01")
    )
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(donation_date="2024-09-01")
    )

    response = admin_client.get(f"/api/v1/organisations/{org.id}/donations")
    assert response.status_code == 200
    years = [d["rotary_year"] for d in response.json()]
    # Ordered most-recent rotary year first.
    assert years == [2024, 2023]


def test_user_can_read_organisation_donations(user_client, admin_client, make_organisation):
    org = make_organisation()
    admin_client.post(f"/api/v1/organisations/{org.id}/donations", json=_donation())
    response = user_client.get(f"/api/v1/organisations/{org.id}/donations")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_donations_filtered_by_rotary_year(admin_client, make_organisation):
    org_a = make_organisation(name="Org A")
    org_b = make_organisation(name="Org B")
    admin_client.post(
        f"/api/v1/organisations/{org_a.id}/donations", json=_donation(donation_date="2024-09-01")
    )
    admin_client.post(
        f"/api/v1/organisations/{org_b.id}/donations", json=_donation(donation_date="2024-10-01")
    )
    admin_client.post(
        f"/api/v1/organisations/{org_a.id}/donations", json=_donation(donation_date="2023-09-01")
    )

    response = admin_client.get("/api/v1/donations", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(d["rotary_year"] == 2024 for d in body)


def test_patch_donation_amount(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(amount=100)
    ).json()

    response = admin_client.patch(
        f"/api/v1/donations/{created['id']}", json={"amount": 250.5}
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 250.5


def test_patch_donation_date_recomputes_rotary_year(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation(donation_date="2025-03-01")
    ).json()
    assert created["rotary_year"] == 2024

    response = admin_client.patch(
        f"/api/v1/donations/{created['id']}", json={"donation_date": "2025-08-01"}
    )
    assert response.status_code == 200
    assert response.json()["rotary_year"] == 2025


def test_patch_donation_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/donations/00000000-0000-0000-0000-000000000000", json={"amount": 5}
    )
    assert response.status_code == 404


def test_non_admin_cannot_patch_donation(user_client, admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    ).json()
    response = user_client.patch(f"/api/v1/donations/{created['id']}", json={"amount": 5})
    assert response.status_code == 403


def test_admin_can_delete_donation(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    ).json()

    response = admin_client.delete(f"/api/v1/donations/{created['id']}")
    assert response.status_code == 204

    remaining = admin_client.get(f"/api/v1/organisations/{org.id}/donations").json()
    assert remaining == []


def test_non_admin_cannot_delete_donation(user_client, admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    ).json()
    response = user_client.delete(f"/api/v1/donations/{created['id']}")
    assert response.status_code == 403


def test_deleting_organisation_cascades_to_donations(admin_client, make_organisation):
    org = make_organisation()
    admin_client.post(f"/api/v1/organisations/{org.id}/donations", json=_donation())

    admin_client.delete(f"/api/v1/organisations/{org.id}")

    response = admin_client.get("/api/v1/donations")
    assert response.status_code == 200
    assert response.json() == []


# Story 16.35 — NGO Module Planned Donations.


def test_create_planned_donation_requires_rotary_year_not_date(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 500, "planned": True, "rotary_year": 2026},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["planned"] is True
    assert body["donation_date"] is None
    assert body["rotary_year"] == 2026


def test_create_planned_donation_without_rotary_year_rejected(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json={"amount": 500, "planned": True}
    )
    assert response.status_code == 422


def test_create_actual_donation_without_date_rejected(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json={"amount": 500, "planned": False}
    )
    assert response.status_code == 422


def test_create_planned_donation_ignores_supplied_date(admin_client, make_organisation):
    # A stray donation_date alongside planned=True is dropped, not stored —
    # a planned donation is scoped by rotary_year only.
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={
            "amount": 500,
            "planned": True,
            "rotary_year": 2026,
            "donation_date": "2026-03-01",
        },
    )
    assert response.status_code == 201
    assert response.json()["donation_date"] is None


def test_convert_planned_donation_to_actual_in_place(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 500, "planned": True, "rotary_year": 2026},
    ).json()

    response = admin_client.patch(
        f"/api/v1/donations/{created['id']}",
        json={"planned": False, "donation_date": "2026-08-01"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["planned"] is False
    assert body["donation_date"] == "2026-08-01"
    assert body["rotary_year"] == 2026

    # Still exactly one record — no separate row was created.
    remaining = admin_client.get(f"/api/v1/organisations/{org.id}/donations").json()
    assert len(remaining) == 1


def test_patch_actual_donation_to_planned_clears_date(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    ).json()

    response = admin_client.patch(
        f"/api/v1/donations/{created['id']}", json={"planned": True}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["planned"] is True
    assert body["donation_date"] is None


def test_patch_cannot_clear_date_on_actual_donation(admin_client, make_organisation):
    org = make_organisation()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/donations", json=_donation()
    ).json()

    response = admin_client.patch(
        f"/api/v1/donations/{created['id']}", json={"donation_date": None}
    )
    assert response.status_code == 422


def test_list_donations_includes_planned(admin_client, make_organisation):
    org = make_organisation()
    admin_client.post(f"/api/v1/organisations/{org.id}/donations", json=_donation())
    admin_client.post(
        f"/api/v1/organisations/{org.id}/donations",
        json={"amount": 500, "planned": True, "rotary_year": 2030},
    )

    response = admin_client.get(f"/api/v1/organisations/{org.id}/donations")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert {d["planned"] for d in body} == {True, False}
