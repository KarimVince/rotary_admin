import pytest

pytestmark = pytest.mark.integration


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
