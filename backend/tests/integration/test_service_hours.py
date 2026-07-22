import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_ngos_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="ngos.organisations", label="NGOs & Donations — Organisations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _service_hour(member_id, hours=3.0, service_date="2025-03-01", **extra):
    return {"member_id": str(member_id), "hours": hours, "service_date": service_date, **extra}


def test_create_service_hour_auto_computes_rotary_year(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    # 2025-03-01 falls in the 2024-07-01 → 2025-06-30 window → rotary_year 2024.
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2025-03-01"),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["rotary_year"] == 2024
    assert body["hours"] == 3.0
    assert body["member_id"] == str(member.id)
    assert body["member_name"] == "Jane Doe"
    assert body["created_by"] is not None


def test_create_service_hour_july_first_is_new_rotary_year(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2025-07-01"),
    )
    assert response.json()["rotary_year"] == 2025


def test_create_service_hour_rotary_year_override(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2025-03-01", rotary_year=2030),
    )
    assert response.json()["rotary_year"] == 2030


def test_create_service_hour_rejects_non_positive_hours(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id, hours=0)
    )
    assert response.status_code == 422


def test_create_service_hour_on_missing_organisation_returns_404(admin_client, make_member):
    member = make_member()
    response = admin_client.post(
        "/api/v1/organisations/00000000-0000-0000-0000-000000000000/service-hours",
        json=_service_hour(member.id),
    )
    assert response.status_code == 404


def test_create_service_hour_on_missing_member_returns_404(admin_client, make_organisation):
    org = make_organisation()
    response = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour("00000000-0000-0000-0000-000000000000"),
    )
    assert response.status_code == 404


def test_non_admin_cannot_create_service_hour(user_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    response = user_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id)
    )
    assert response.status_code == 403


def test_list_organisation_service_hours_ordered_desc(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2023-09-01"),
    )
    admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2024-09-01"),
    )

    response = admin_client.get(f"/api/v1/organisations/{org.id}/service-hours")
    assert response.status_code == 200
    years = [row["rotary_year"] for row in response.json()]
    assert years == [2024, 2023]


def test_user_can_read_organisation_service_hours(user_client, admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    admin_client.post(f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id))
    response = user_client.get(f"/api/v1/organisations/{org.id}/service-hours")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_service_hours_filtered_by_rotary_year(admin_client, make_organisation, make_member):
    org_a = make_organisation(name="Org A")
    org_b = make_organisation(name="Org B")
    member = make_member()
    admin_client.post(
        f"/api/v1/organisations/{org_a.id}/service-hours",
        json=_service_hour(member.id, service_date="2024-09-01"),
    )
    admin_client.post(
        f"/api/v1/organisations/{org_b.id}/service-hours",
        json=_service_hour(member.id, service_date="2024-10-01"),
    )
    admin_client.post(
        f"/api/v1/organisations/{org_a.id}/service-hours",
        json=_service_hour(member.id, service_date="2023-09-01"),
    )

    response = admin_client.get("/api/v1/service-hours", params={"rotary_year": 2024})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(row["rotary_year"] == 2024 for row in body)


def test_patch_service_hour_hours(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id, hours=2)
    ).json()

    response = admin_client.patch(f"/api/v1/service-hours/{created['id']}", json={"hours": 5.5})
    assert response.status_code == 200
    assert response.json()["hours"] == 5.5


def test_patch_service_hour_date_recomputes_rotary_year(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours",
        json=_service_hour(member.id, service_date="2025-03-01"),
    ).json()
    assert created["rotary_year"] == 2024

    response = admin_client.patch(
        f"/api/v1/service-hours/{created['id']}", json={"service_date": "2025-08-01"}
    )
    assert response.status_code == 200
    assert response.json()["rotary_year"] == 2025


def test_patch_service_hour_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/service-hours/00000000-0000-0000-0000-000000000000", json={"hours": 5}
    )
    assert response.status_code == 404


def test_non_admin_cannot_patch_service_hour(user_client, admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id)
    ).json()
    response = user_client.patch(f"/api/v1/service-hours/{created['id']}", json={"hours": 5})
    assert response.status_code == 403


def test_admin_can_delete_service_hour(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id)
    ).json()

    response = admin_client.delete(f"/api/v1/service-hours/{created['id']}")
    assert response.status_code == 204

    remaining = admin_client.get(f"/api/v1/organisations/{org.id}/service-hours").json()
    assert remaining == []


def test_non_admin_cannot_delete_service_hour(user_client, admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    created = admin_client.post(
        f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id)
    ).json()
    response = user_client.delete(f"/api/v1/service-hours/{created['id']}")
    assert response.status_code == 403


def test_deleting_organisation_cascades_to_service_hours(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()
    admin_client.post(f"/api/v1/organisations/{org.id}/service-hours", json=_service_hour(member.id))

    admin_client.delete(f"/api/v1/organisations/{org.id}")

    response = admin_client.get("/api/v1/service-hours")
    assert response.status_code == 200
    assert response.json() == []
