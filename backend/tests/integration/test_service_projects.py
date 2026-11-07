import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration

PDF = "application/pdf"


@pytest.fixture(autouse=True)
def _grant_default_ngos_read(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="ngos.organisations", label="NGOs & Donations — Organisations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _url(org_id, year=2026, suffix=""):
    return f"/api/v1/organisations/{org_id}/service-projects/{year}{suffix}"


def test_upsert_creates_then_updates_project(admin_client, make_organisation, make_member):
    org = make_organisation()
    member = make_member()

    created = admin_client.put(
        _url(org.id),
        json={"status": "planning", "lead_member_id": str(member.id), "objectives": "Feed 200 families"},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["rotary_year"] == 2026
    assert body["lead_member_name"] == "Jane Doe"
    assert body["objectives"] == "Feed 200 families"
    assert body["documents"] == []

    updated = admin_client.put(
        _url(org.id), json={"status": "completed", "outcome": "Done", "plan": "  "}
    )
    assert updated.status_code == 200
    assert updated.json()["id"] == body["id"]
    assert updated.json()["status"] == "completed"
    assert updated.json()["plan"] is None
    assert updated.json()["lead_member_id"] is None

    listing = admin_client.get(f"/api/v1/organisations/{org.id}/service-projects")
    assert [p["rotary_year"] for p in listing.json()] == [2026]


def test_list_orders_years_newest_first(admin_client, make_organisation):
    org = make_organisation()
    for year in (2024, 2026, 2025):
        admin_client.put(_url(org.id, year), json={})
    listing = admin_client.get(f"/api/v1/organisations/{org.id}/service-projects")
    assert [p["rotary_year"] for p in listing.json()] == [2026, 2025, 2024]


def test_upsert_rejects_bad_status_and_unknown_member(admin_client, make_organisation):
    org = make_organisation()
    assert admin_client.put(_url(org.id), json={"status": "nope"}).status_code == 422
    response = admin_client.put(
        _url(org.id), json={"lead_member_id": "00000000-0000-0000-0000-000000000000"}
    )
    assert response.status_code == 404


def test_upload_creates_project_and_document_roundtrip(admin_client, make_organisation, fake_storage):
    org = make_organisation()
    response = admin_client.post(
        _url(org.id, 2025, "/documents"),
        files={"file": ("Budget.pdf", b"pdf-bytes", PDF)},
        data={"description": "Draft budget"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "planning"
    assert len(body["documents"]) == 1
    document = body["documents"][0]
    assert document["file_original_filename"] == "Budget.pdf"
    assert document["description"] == "Draft budget"
    assert document["file_size_bytes"] == len(b"pdf-bytes")

    stored = [key for key in fake_storage if key[1].startswith(f"ngo-projects/{org.id}/2025/")]
    assert len(stored) == 1 and stored[0][0] == "event-minutes"

    download = admin_client.get(_url(org.id, 2025, f"/documents/{document['id']}/download"))
    assert download.status_code == 200
    assert download.content == b"pdf-bytes"
    assert "Budget.pdf" in download.headers["content-disposition"]

    deleted = admin_client.delete(_url(org.id, 2025, f"/documents/{document['id']}"))
    assert deleted.status_code == 204
    assert not fake_storage
    assert admin_client.get(f"/api/v1/organisations/{org.id}/service-projects").json()[0]["documents"] == []


def test_upload_rejects_unsupported_type_and_oversize(admin_client, make_organisation, fake_storage):
    org = make_organisation()
    bad_type = admin_client.post(
        _url(org.id, suffix="/documents"), files={"file": ("run.exe", b"x", "application/octet-stream")}
    )
    assert bad_type.status_code == 422
    too_big = admin_client.post(
        _url(org.id, suffix="/documents"),
        files={"file": ("big.pdf", b"x" * (10 * 1024 * 1024 + 1), PDF)},
    )
    assert too_big.status_code == 422
    assert not fake_storage
    assert admin_client.get(f"/api/v1/organisations/{org.id}/service-projects").json() == []


def test_delete_project_removes_its_files(admin_client, make_organisation, fake_storage):
    org = make_organisation()
    admin_client.post(_url(org.id, suffix="/documents"), files={"file": ("a.docx", b"a", "x")})
    admin_client.post(_url(org.id, suffix="/documents"), files={"file": ("b.png", b"b", "image/png")})
    assert len(fake_storage) == 2

    assert admin_client.delete(_url(org.id)).status_code == 204
    assert not fake_storage
    assert admin_client.delete(_url(org.id)).status_code == 404


def test_deleting_organisation_cleans_up_project_files(admin_client, make_organisation, fake_storage):
    org = make_organisation()
    admin_client.post(_url(org.id, suffix="/documents"), files={"file": ("a.pdf", b"a", PDF)})
    assert len(fake_storage) == 1
    assert admin_client.delete(f"/api/v1/organisations/{org.id}").status_code == 204
    assert not fake_storage


def test_document_from_other_organisation_is_not_reachable(admin_client, make_organisation, fake_storage):
    org_a = make_organisation(name="A")
    org_b = make_organisation(name="B")
    body = admin_client.post(
        _url(org_a.id, suffix="/documents"), files={"file": ("a.pdf", b"a", PDF)}
    ).json()
    admin_client.put(_url(org_b.id), json={})
    document_id = body["documents"][0]["id"]
    assert admin_client.get(_url(org_b.id, suffix=f"/documents/{document_id}/download")).status_code == 404
    assert admin_client.delete(_url(org_b.id, suffix=f"/documents/{document_id}")).status_code == 404


def test_read_only_user_can_view_but_not_write(admin_client, user_client, make_organisation, fake_storage):
    org = make_organisation()
    body = admin_client.post(
        _url(org.id, suffix="/documents"), files={"file": ("a.pdf", b"a", PDF)}
    ).json()
    document_id = body["documents"][0]["id"]

    assert user_client.get(f"/api/v1/organisations/{org.id}/service-projects").status_code == 200
    assert user_client.get(_url(org.id, suffix=f"/documents/{document_id}/download")).status_code == 200
    assert user_client.put(_url(org.id), json={}).status_code == 403
    assert (
        user_client.post(_url(org.id, suffix="/documents"), files={"file": ("b.pdf", b"b", PDF)}).status_code
        == 403
    )
    assert user_client.delete(_url(org.id, suffix=f"/documents/{document_id}")).status_code == 403


def test_internal_club_project_classification_is_seeded(db_session):
    count = db_session.execute(
        text("SELECT COUNT(*) FROM ngo_classifications WHERE name = 'Internal Club Project'")
    ).scalar()
    assert count == 1
