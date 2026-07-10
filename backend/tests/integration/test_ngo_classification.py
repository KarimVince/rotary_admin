from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_ngos_read(make_app_function, make_permission_matrix_entry):
    organisations = make_app_function(
        key="ngos.organisations", label="NGOs & Donations — Organisations"
    )
    statistics = make_app_function(key="ngos.statistics", label="NGOs & Donations — Statistics")
    make_permission_matrix_entry(
        organisations.id, board_position_id=None, access_level="read", is_default_user=True
    )
    make_permission_matrix_entry(
        statistics.id, board_position_id=None, access_level="read", is_default_user=True
    )


@pytest.fixture
def secretary_client(
    build_client,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member(first_name="Sec", last_name="Retary")
    user = make_user(email="secretary-ngo@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    app_function = make_app_function(key="admin.ngo_classifications")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")
    return build_client(user)


# --- CRUD / RBAC on ngo_classifications --------------------------------------


def test_user_cannot_create_classification(user_client):
    response = user_client.post("/api/v1/ngo-classifications", json={"name": "Health"})
    assert response.status_code == 403


def test_secretary_can_create_and_list_classification(secretary_client):
    response = secretary_client.post(
        "/api/v1/ngo-classifications", json={"name": "Test Health Class"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Test Health Class"
    assert body["organisation_count"] == 0

    listing = secretary_client.get("/api/v1/ngo-classifications")
    assert listing.status_code == 200
    names = [c["name"] for c in listing.json()]
    assert "Test Health Class" in names


def test_create_classification_duplicate_name_returns_409(secretary_client):
    secretary_client.post("/api/v1/ngo-classifications", json={"name": "Test Youth Class"})
    response = secretary_client.post(
        "/api/v1/ngo-classifications", json={"name": "Test Youth Class"}
    )
    assert response.status_code == 409


def test_reorder_persists_positions(secretary_client):
    first = secretary_client.post("/api/v1/ngo-classifications", json={"name": "First"}).json()
    second = secretary_client.post("/api/v1/ngo-classifications", json={"name": "Second"}).json()

    response = secretary_client.patch(
        "/api/v1/ngo-classifications/reorder",
        json={"items": [{"id": second["id"], "position": 0}, {"id": first["id"], "position": 1}]},
    )
    assert response.status_code == 200
    ordered_names = [item["name"] for item in response.json()]
    assert ordered_names.index("Second") < ordered_names.index("First")


def test_delete_classification_sets_organisation_null(secretary_client, admin_client):
    classification = secretary_client.post(
        "/api/v1/ngo-classifications", json={"name": "Environment"}
    ).json()

    org = admin_client.post(
        "/api/v1/organisations",
        json={"name": "Green Org", "classification_id": classification["id"]},
    ).json()
    assert org["classification_id"] == classification["id"]

    delete_response = secretary_client.delete(
        f"/api/v1/ngo-classifications/{classification['id']}"
    )
    assert delete_response.status_code == 204

    refreshed = admin_client.get(f"/api/v1/organisations/{org['id']}").json()
    assert refreshed["classification_id"] is None


def test_list_shows_organisation_count(secretary_client, admin_client):
    classification = secretary_client.post(
        "/api/v1/ngo-classifications", json={"name": "Poverty Alleviation"}
    ).json()
    admin_client.post(
        "/api/v1/organisations",
        json={"name": "Org A", "classification_id": classification["id"]},
    )
    admin_client.post(
        "/api/v1/organisations",
        json={"name": "Org B", "classification_id": classification["id"]},
    )

    listing = secretary_client.get("/api/v1/ngo-classifications").json()
    row = next(c for c in listing if c["id"] == classification["id"])
    assert row["organisation_count"] == 2


# --- Organisation integration -------------------------------------------------


def test_create_organisation_rejects_unknown_classification(admin_client):
    import uuid

    response = admin_client.post(
        "/api/v1/organisations",
        json={"name": "Bad Classification Org", "classification_id": str(uuid.uuid4())},
    )
    assert response.status_code == 422


def test_organisation_optional_classification(admin_client):
    response = admin_client.post("/api/v1/organisations", json={"name": "No Classification Org"})
    assert response.status_code == 201
    assert response.json()["classification_id"] is None


def test_list_organisations_filters_by_classification(admin_client, secretary_client):
    classification = secretary_client.post(
        "/api/v1/ngo-classifications", json={"name": "Test Arts Class"}
    ).json()
    admin_client.post(
        "/api/v1/organisations",
        json={"name": "Classified Org", "classification_id": classification["id"]},
    )
    admin_client.post("/api/v1/organisations", json={"name": "Unclassified Org"})

    response = admin_client.get(
        f"/api/v1/organisations?classification_id={classification['id']}"
    )
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Classified Org"]


# --- Donation statistics breakdown -------------------------------------------


def test_donation_statistics_breaks_down_by_classification(admin_client):
    classification = admin_client.post(
        "/api/v1/ngo-classifications", json={"name": "Test Tech Class"}
    ).json()
    classified_org = admin_client.post(
        "/api/v1/organisations",
        json={"name": "Tech Org", "classification_id": classification["id"]},
    ).json()
    unclassified_org = admin_client.post(
        "/api/v1/organisations", json={"name": "Plain Org"}
    ).json()

    year = rotary_year(date.today())
    admin_client.post(
        f"/api/v1/organisations/{classified_org['id']}/donations",
        json={"amount": 100, "donation_date": str(date.today()), "currency": "HKD"},
    )
    admin_client.post(
        f"/api/v1/organisations/{unclassified_org['id']}/donations",
        json={"amount": 50, "donation_date": str(date.today()), "currency": "HKD"},
    )

    response = admin_client.get(f"/api/v1/donations/statistics?rotary_year={year}")
    assert response.status_code == 200
    hkd_block = next(b for b in response.json()["by_currency"] if b["currency"] == "HKD")
    by_label = {row["label"]: row["value"] for row in hkd_block["total_by_classification"]}
    assert by_label["Test Tech Class"] == 100.0
    assert by_label["Unclassified"] == 50.0


def test_donation_statistics_classification_filter_scopes_totals(admin_client):
    classification = admin_client.post(
        "/api/v1/ngo-classifications", json={"name": "Test Animal Class"}
    ).json()
    classified_org = admin_client.post(
        "/api/v1/organisations",
        json={"name": "Animal Org", "classification_id": classification["id"]},
    ).json()
    unclassified_org = admin_client.post(
        "/api/v1/organisations", json={"name": "Other Org"}
    ).json()

    admin_client.post(
        f"/api/v1/organisations/{classified_org['id']}/donations",
        json={"amount": 100, "donation_date": str(date.today()), "currency": "HKD"},
    )
    admin_client.post(
        f"/api/v1/organisations/{unclassified_org['id']}/donations",
        json={"amount": 999, "donation_date": str(date.today()), "currency": "HKD"},
    )

    response = admin_client.get(
        f"/api/v1/donations/statistics?classification_id={classification['id']}"
    )
    assert response.status_code == 200
    body = response.json()
    hkd_block = next(b for b in body["by_currency"] if b["currency"] == "HKD")
    assert hkd_block["grand_total"] == 100.0
    assert body["all_time"]["total_hkd"] == 100.0
