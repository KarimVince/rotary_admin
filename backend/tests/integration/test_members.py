from datetime import date, timedelta

import pytest

from app.core.rotary_year import rotary_year
from app.models import MemberTitle

pytestmark = pytest.mark.integration


@pytest.fixture
def members_directory_function(make_app_function):
    return make_app_function(key="members.directory", label="Members — Directory")


@pytest.fixture(autouse=True)
def _grant_default_directory_read(members_directory_function, make_permission_matrix_entry):
    # Story 12.3: reads are matrix-gated now, so every non-admin client
    # (user_client, treasurer_client, build_client) needs a Default User row
    # to see the members directory at all — matches the 12.10 seed default
    # (Default User = Read on members.directory).
    make_permission_matrix_entry(
        members_directory_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def _grant_directory_write_via_board_position(
    members_directory_function, make_board_position, make_board_position_assignment,
    make_permission_matrix_entry, member_id,
):
    # A board position's matrix entry is independent of the Default User row,
    # and takes precedence for a member holding that position (Story 9.4's
    # resolver ignores the default-user fallback once a position is held).
    position = make_board_position(name="Membership Secretary")
    make_board_position_assignment(
        position.id, member_id, rotary_year=rotary_year(date.today())
    )
    make_permission_matrix_entry(
        members_directory_function.id, board_position_id=position.id, access_level="write"
    )


def _create_payload(**overrides):
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane.doe@example.com",
        "join_date": "2020-01-15",
        "date_of_birth": "1985-06-01",
        "address": "1 Rotary Way",
        "nationality": "France",
        "classification": "Accounting",
    }
    payload.update(overrides)
    return payload


def test_admin_can_create_member(admin_client):
    response = admin_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["first_name"] == "Jane"
    assert body["status"] == "active"
    assert body["date_of_birth"] == "1985-06-01"
    assert body["address"] == "1 Rotary Way"


def test_admin_can_create_member_with_story_8_3_fields(admin_client):
    # "DR" collides with the honorifics migration's own seed data (see
    # d3f8b2a7c1e9) — use a non-colliding code, same fix as test_honorifics.py.
    honorific = admin_client.post(
        "/api/v1/honorifics", json={"code": "ZDR", "label": "Dr."}
    ).json()

    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="applicant@example.com",
            honorific_id=honorific["id"],
            company_name="Acme Corp",
            position="Engineer",
            proposer_name="John Smith",
        ),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["honorific_id"] == honorific["id"]
    assert body["company_name"] == "Acme Corp"
    assert body["position"] == "Engineer"
    assert body["proposer_name"] == "John Smith"


def test_admin_can_create_honorary_member(admin_client):
    # Story 8.14: honorary is no longer a status value — an honorary member
    # is status="active" with is_honorary=True.
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="honorary@example.com", is_honorary=True),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["is_honorary"] is True


def test_create_member_rejects_honorary_status_value(admin_client):
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="rejected@example.com", status="honorary"),
    )

    assert response.status_code == 422


def test_non_admin_cannot_create_member(user_client):
    response = user_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 403


def test_treasurer_cannot_create_member(treasurer_client):
    response = treasurer_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 403


def test_create_member_duplicate_email_returns_409(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = admin_client.post("/api/v1/members", json=_create_payload(first_name="Other"))

    assert response.status_code == 409


def test_create_member_future_date_of_birth_returns_422(admin_client):
    future_dob = (date.today() + timedelta(days=1)).isoformat()

    response = admin_client.post(
        "/api/v1/members", json=_create_payload(date_of_birth=future_dob)
    )

    assert response.status_code == 422


def test_create_member_computes_tenure_fields(admin_client):
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(join_date="2020-01-15", rotarian_since="2010-01-15"),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["rotarian_since"] == "2010-01-15"
    assert body["years_as_rotarian"] > body["years_in_this_club"]


def test_create_member_without_rotarian_since_falls_back_to_join_date(admin_client):
    response = admin_client.post(
        "/api/v1/members", json=_create_payload(join_date="2020-01-15")
    )

    assert response.status_code == 201
    body = response.json()
    assert body["rotarian_since"] is None
    assert body["years_as_rotarian"] == body["years_in_this_club"]


def test_create_member_with_gender(admin_client):
    response = admin_client.post(
        "/api/v1/members", json=_create_payload(email="gender@example.com", gender="Female")
    )

    assert response.status_code == 201
    assert response.json()["gender"] == "Female"


def test_create_member_without_gender_defaults_to_none(admin_client):
    response = admin_client.post("/api/v1/members", json=_create_payload())

    assert response.status_code == 201
    assert response.json()["gender"] is None


def test_create_member_invalid_gender_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members", json=_create_payload(gender="Unspecified")
    )

    assert response.status_code == 422


def test_create_member_invalid_nationality_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members", json=_create_payload(nationality="Chinese")
    )

    assert response.status_code == 422


def test_create_member_valid_nationality_from_fixed_list(admin_client):
    response = admin_client.post(
        "/api/v1/members", json=_create_payload(email="valid-nat@example.com", nationality="Japan")
    )

    assert response.status_code == 201
    assert response.json()["nationality"] == "Japan"


def test_update_member_invalid_nationality_returns_422(admin_client):
    created = admin_client.post(
        "/api/v1/members", json=_create_payload(email="update-nat@example.com")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{created['id']}", json={"nationality": "USA"}
    )

    assert response.status_code == 422


def test_non_admin_sees_gender_in_limited_response(admin_client, user_client):
    created = admin_client.post(
        "/api/v1/members", json=_create_payload(email="ltd-gender@example.com", gender="Male")
    ).json()

    response = user_client.get(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    assert response.json()["gender"] == "Male"


def test_create_member_with_rotarian_id(admin_client):
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="ri1@example.com", rotarian_id="RI-1001"),
    )

    assert response.status_code == 201
    assert response.json()["rotarian_id"] == "RI-1001"


def test_create_member_duplicate_rotarian_id_returns_409(admin_client):
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="ri2@example.com", rotarian_id="RI-2002"),
    )

    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="ri3@example.com", rotarian_id="RI-2002"),
    )

    assert response.status_code == 409


def test_update_member_duplicate_rotarian_id_returns_409(admin_client):
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="ri4@example.com", rotarian_id="RI-4004"),
    )
    second = admin_client.post(
        "/api/v1/members", json=_create_payload(email="ri5@example.com")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{second['id']}", json={"rotarian_id": "RI-4004"}
    )

    assert response.status_code == 409


def test_non_admin_does_not_see_rotarian_id(admin_client, user_client):
    created = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="ri6@example.com", rotarian_id="RI-6006"),
    ).json()

    response = user_client.get(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    assert "rotarian_id" not in response.json()


def test_create_member_leave_before_join_returns_422(admin_client):
    response = admin_client.post(
        "/api/v1/members",
        json=_create_payload(join_date="2020-01-15", leave_date="2019-01-01"),
    )

    assert response.status_code == 422


def test_list_members_admin_sees_full_fields(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = admin_client.get("/api/v1/members")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["date_of_birth"] == "1985-06-01"
    assert body[0]["address"] == "1 Rotary Way"


def test_list_members_non_admin_sees_limited_fields(admin_client, user_client):
    admin_client.post("/api/v1/members", json=_create_payload())

    response = user_client.get("/api/v1/members")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert "date_of_birth" not in body[0]
    assert "address" not in body[0]
    assert body[0]["first_name"] == "Jane"


def test_get_member_non_admin_sees_limited_fields(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.get(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert "date_of_birth" not in body
    assert "address" not in body


def test_get_member_not_found_returns_404(admin_client):
    response = admin_client.get("/api/v1/members/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_list_members_filters_by_status(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload(email="active@example.com"))
    past = admin_client.post(
        "/api/v1/members", json=_create_payload(email="past@example.com")
    ).json()
    admin_client.patch(f"/api/v1/members/{past['id']}", json={"status": "past"})

    response = admin_client.get("/api/v1/members", params={"status": "past"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["email"] == "past@example.com"


def test_list_members_filters_by_active_in_rotary_year(admin_client):
    # Story 8.29: a member active only during a past rotary year (has since
    # left) must still show up when that year is queried, and a member who
    # joined after the queried year ended must not.
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="past-during-year@example.com", join_date="2015-01-01"
        ),
    )
    left = admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="left-before-year@example.com", join_date="2015-01-01"),
    ).json()
    admin_client.patch(
        f"/api/v1/members/{left['id']}", json={"status": "past", "leave_date": "2024-06-01"}
    )
    # rotary_year(2025-08-01) == 2025 (month >= 7), so that date is actually
    # *within* rotary year 2025, not after it — use a date in the following
    # rotary year (2026) to genuinely test "joined after the queried year".
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="joined-after-year@example.com", join_date="2026-08-01"),
    )

    response = admin_client.get("/api/v1/members", params={"active_in_rotary_year": 2025})

    assert response.status_code == 200
    assert [m["email"] for m in response.json()] == ["past-during-year@example.com"]


def test_list_members_filters_by_nationality_and_classification(admin_client):
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="fr@example.com", nationality="France", classification="Accounting"
        ),
    )
    admin_client.post(
        "/api/v1/members",
        json=_create_payload(
            email="uk@example.com", nationality="United Kingdom", classification="Law"
        ),
    )

    response = admin_client.get("/api/v1/members", params={"nationality": "France"})
    assert [m["email"] for m in response.json()] == ["fr@example.com"]

    response = admin_client.get("/api/v1/members", params={"classification": "Law"})
    assert [m["email"] for m in response.json()] == ["uk@example.com"]


def test_list_members_filters_by_join_year(admin_client):
    admin_client.post(
        "/api/v1/members", json=_create_payload(email="y2020@example.com", join_date="2020-03-01")
    )
    admin_client.post(
        "/api/v1/members", json=_create_payload(email="y2023@example.com", join_date="2023-07-01")
    )

    response = admin_client.get("/api/v1/members", params={"join_year": 2023})

    assert [m["email"] for m in response.json()] == ["y2023@example.com"]


def test_list_members_filters_by_title(admin_client, db_session):
    title = MemberTitle(code="Rtn", label="Rotarian", sort_order=0)
    db_session.add(title)
    db_session.commit()
    db_session.refresh(title)

    admin_client.post(
        "/api/v1/members",
        json=_create_payload(email="titled@example.com", title_id=str(title.id)),
    )
    admin_client.post("/api/v1/members", json=_create_payload(email="untitled@example.com"))

    response = admin_client.get("/api/v1/members", params={"title_id": str(title.id)})

    assert [m["email"] for m in response.json()] == ["titled@example.com"]


def test_non_admin_cannot_update_member(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.patch(f"/api/v1/members/{created['id']}", json={"phone": "12345"})

    assert response.status_code == 403


def test_treasurer_cannot_update_member(admin_client, treasurer_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = treasurer_client.patch(
        f"/api/v1/members/{created['id']}", json={"phone": "12345"}
    )

    assert response.status_code == 403


def test_user_with_directory_write_access_can_update_any_member(
    admin_client,
    make_user,
    build_client,
    members_directory_function,
    make_board_position,
    make_board_position_assignment,
    make_permission_matrix_entry,
):
    # Story 12.3 retires the old "self-linked user can edit their own record"
    # bespoke logic in favor of one consistent rule: write access on
    # members.directory, granted via the matrix (e.g. a board position),
    # governs edits — for any member, not just the editor's own record.
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()
    other = admin_client.post(
        "/api/v1/members", json=_create_payload(email="third-party@example.com")
    ).json()
    linked_user = make_user(email="linked@example.com", role="user", member_id=created["id"])
    _grant_directory_write_via_board_position(
        members_directory_function,
        make_board_position,
        make_board_position_assignment,
        make_permission_matrix_entry,
        linked_user.member_id,
    )
    linked_client = build_client(linked_user)

    own_response = linked_client.patch(
        f"/api/v1/members/{created['id']}", json={"phone": "555-0000"}
    )
    other_response = linked_client.patch(
        f"/api/v1/members/{other['id']}", json={"phone": "555-1111"}
    )

    assert own_response.status_code == 200
    assert own_response.json()["phone"] == "555-0000"
    assert other_response.status_code == 200
    assert other_response.json()["phone"] == "555-1111"


def test_user_without_write_access_cannot_update_even_their_own_linked_member_record(
    admin_client, make_user, build_client
):
    # Confirms the old self-link bypass is really gone: being linked to the
    # member record is no longer sufficient on its own — matrix write access
    # is required, same as for any other member.
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()
    linked_user = make_user(email="linked3@example.com", role="user", member_id=created["id"])
    linked_client = build_client(linked_user)

    response = linked_client.patch(
        f"/api/v1/members/{created['id']}", json={"phone": "555-0000"}
    )

    assert response.status_code == 403


def test_admin_can_update_member(admin_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = admin_client.patch(
        f"/api/v1/members/{created['id']}", json={"phone": "555-1234", "profession": "Lawyer"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["phone"] == "555-1234"
    assert body["profession"] == "Lawyer"


def test_update_member_duplicate_email_returns_409(admin_client):
    admin_client.post("/api/v1/members", json=_create_payload(email="first@example.com"))
    second = admin_client.post(
        "/api/v1/members", json=_create_payload(email="second@example.com")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{second['id']}", json={"email": "first@example.com"}
    )

    assert response.status_code == 409


def test_update_member_invalid_dates_returns_422(admin_client):
    created = admin_client.post(
        "/api/v1/members", json=_create_payload(join_date="2020-01-15")
    ).json()

    response = admin_client.patch(
        f"/api/v1/members/{created['id']}", json={"leave_date": "2019-01-01"}
    )

    assert response.status_code == 422


def test_update_member_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/members/00000000-0000-0000-0000-000000000000", json={"phone": "555"}
    )

    assert response.status_code == 404


def test_non_admin_cannot_delete_member(admin_client, user_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = user_client.delete(f"/api/v1/members/{created['id']}")

    assert response.status_code == 403


def test_admin_delete_member_soft_deletes(admin_client):
    created = admin_client.post("/api/v1/members", json=_create_payload()).json()

    response = admin_client.delete(f"/api/v1/members/{created['id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "past"
    assert body["leave_date"] is not None

    get_response = admin_client.get(f"/api/v1/members/{created['id']}")
    assert get_response.json()["status"] == "past"


def test_delete_member_not_found_returns_404(admin_client):
    response = admin_client.delete("/api/v1/members/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_admin_can_upload_member_photo(admin_client, fake_storage):
    response = admin_client.post(
        "/api/v1/members/photo",
        files={"file": ("photo.png", b"fake-png-bytes", "image/png")},
    )

    assert response.status_code == 201
    photo_url = response.json()["photo_url"]
    assert photo_url.startswith("https://fake-supabase.test/")
    assert "/public-assets/members/" in photo_url
    assert photo_url.endswith(".png")
    stored_path = photo_url.rsplit("public-assets/", 1)[-1]
    assert fake_storage[("public-assets", stored_path)] == b"fake-png-bytes"


def test_non_admin_cannot_upload_member_photo(user_client):
    response = user_client.post(
        "/api/v1/members/photo",
        files={"file": ("photo.png", b"fake-png-bytes", "image/png")},
    )

    assert response.status_code == 403


def test_upload_member_photo_rejects_non_image_content_type(admin_client, fake_storage):
    response = admin_client.post(
        "/api/v1/members/photo",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 422


def test_upload_member_photo_rejects_oversized_file(admin_client, fake_storage, monkeypatch):
    monkeypatch.setattr("app.api.members.MAX_PHOTO_BYTES", 10)

    response = admin_client.post(
        "/api/v1/members/photo",
        files={"file": ("photo.png", b"this-is-more-than-ten-bytes", "image/png")},
    )

    assert response.status_code == 422
