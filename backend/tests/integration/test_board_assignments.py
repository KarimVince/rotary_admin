from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.rotary_year import rotary_year
from app.models import BoardPositionAssignment

pytestmark = pytest.mark.integration

CURRENT_YEAR = rotary_year(date.today())

# Story 12.7: board-view-assignments / board-manage-assignments consolidated
# into the single board.members key.
VIEW_KEY = "board.members"
MANAGE_KEY = "board.members"


def _grant_default_user_access(make_app_function, make_permission_matrix_entry, key, access_level):
    app_function = make_app_function(key=key, label=key)
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level=access_level, is_default_user=True
    )
    return app_function


# --- GET /board/assignments — access gating ---------------------------------


def test_list_assignments_requires_authentication(client):
    response = client.get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    assert response.status_code == 401


def test_list_assignments_forbidden_without_read_access(user_client):
    response = user_client.get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    assert response.status_code == 403


def test_list_assignments_allowed_with_default_user_read_access(
    build_client, make_user, make_app_function, make_permission_matrix_entry
):
    _grant_default_user_access(make_app_function, make_permission_matrix_entry, VIEW_KEY, "read")
    user = make_user(email="viewer@example.com", role="user")

    response = build_client(user).get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    assert response.status_code == 200


def test_admin_can_list_assignments_without_any_matrix_configured(admin_client):
    response = admin_client.get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    assert response.status_code == 200


def test_list_assignments_includes_nested_board_position_and_member(
    admin_client, make_board_position, make_member, make_board_position_assignment
):
    position = make_board_position(name="President")
    member = make_member(first_name="Jane", last_name="Doe")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)

    response = admin_client.get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    assert response.status_code == 200
    entry = response.json()[0]
    assert entry["board_position"]["name"] == "President"
    assert entry["member"]["first_name"] == "Jane"
    assert entry["member"]["last_name"] == "Doe"


def test_list_assignments_includes_member_photo_and_demographics(
    admin_client, make_board_position, make_member, make_board_position_assignment, db_session
):
    position = make_board_position(name="Secretary")
    member = make_member(first_name="Sam", last_name="Lee")
    member.photo_url = "/uploads/members/sam.jpg"
    member.date_of_birth = date(1990, 1, 1)
    member.gender = "Male"
    member.nationality = "Hong Kong"
    db_session.commit()
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)

    response = admin_client.get("/api/v1/board/assignments", params={"year": CURRENT_YEAR})

    entry = response.json()[0]
    assert entry["member"]["photo_url"] == "/uploads/members/sam.jpg"
    assert entry["member"]["date_of_birth"] == "1990-01-01"
    assert entry["member"]["gender"] == "Male"
    assert entry["member"]["nationality"] == "Hong Kong"


# --- POST /board/assignments — access gating --------------------------------


def test_create_assignment_requires_authentication(client, make_board_position, make_member):
    position = make_board_position(name="President")
    member = make_member()

    response = client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member.id)},
    )

    assert response.status_code == 401


def test_create_assignment_forbidden_without_write_access(
    user_client, make_board_position, make_member
):
    position = make_board_position(name="President")
    member = make_member()

    response = user_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member.id)},
    )

    assert response.status_code == 403


def test_create_assignment_forbidden_with_read_only_access(
    build_client, make_user, make_app_function, make_permission_matrix_entry, make_board_position, make_member
):
    _grant_default_user_access(make_app_function, make_permission_matrix_entry, MANAGE_KEY, "read")
    user = make_user(email="reader@example.com", role="user")
    position = make_board_position(name="President")
    member = make_member()

    response = build_client(user).post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member.id)},
    )

    assert response.status_code == 403


def test_create_assignment_allowed_with_default_user_write_access(
    build_client, make_user, make_app_function, make_permission_matrix_entry, make_board_position, make_member
):
    _grant_default_user_access(make_app_function, make_permission_matrix_entry, MANAGE_KEY, "write")
    user = make_user(email="writer@example.com", role="user")
    position = make_board_position(name="President")
    member = make_member()

    response = build_client(user).post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member.id)},
    )

    assert response.status_code == 201


def test_create_assignment_unknown_position_returns_404(admin_client, make_member):
    member = make_member()

    response = admin_client.post(
        "/api/v1/board/assignments",
        json={
            "board_position_id": "00000000-0000-0000-0000-000000000000",
            "member_id": str(member.id),
        },
    )

    assert response.status_code == 404


def test_create_assignment_unknown_member_returns_404(admin_client, make_board_position):
    position = make_board_position(name="President")

    response = admin_client.post(
        "/api/v1/board/assignments",
        json={
            "board_position_id": str(position.id),
            "member_id": "00000000-0000-0000-0000-000000000000",
        },
    )

    assert response.status_code == 404


# --- POST /board/assignments — reassignment behavior -------------------------


def test_create_assignment_sets_rotary_year_and_start_date_to_term_start(
    admin_client, make_board_position, make_member
):
    position = make_board_position(name="President")
    member = make_member()

    response = admin_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member.id)},
    )

    assert response.status_code == 201
    created = response.json()
    assert created["rotary_year"] == CURRENT_YEAR
    # Board terms always start July 1st of the rotary year, regardless of the
    # actual date the assignment is recorded.
    assert created["start_date"] == date(CURRENT_YEAR, 7, 1).isoformat()
    assert created["end_date"] is None


def test_reassigning_a_position_ends_the_prior_holders_row(
    admin_client, make_board_position, make_member
):
    position = make_board_position(name="President")
    member_one = make_member(first_name="Jane")
    member_two = make_member(first_name="John")

    first = admin_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member_one.id)},
    ).json()

    second_response = admin_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(position.id), "member_id": str(member_two.id)},
    )
    assert second_response.status_code == 201
    second = second_response.json()
    assert second["end_date"] is None
    assert second["member"]["first_name"] == "John"

    list_response = admin_client.get(
        "/api/v1/board/assignments", params={"year": CURRENT_YEAR}
    )
    entries = list_response.json()
    assert len(entries) == 2
    ended = next(entry for entry in entries if entry["id"] == first["id"])
    assert ended["end_date"] == date.today().isoformat()


def test_member_can_be_assigned_to_multiple_positions_same_term(
    admin_client, make_board_position, make_member
):
    president = make_board_position(name="President")
    secretary = make_board_position(name="Secretary")
    member = make_member()

    first = admin_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(president.id), "member_id": str(member.id)},
    )
    second = admin_client.post(
        "/api/v1/board/assignments",
        json={"board_position_id": str(secretary.id), "member_id": str(member.id)},
    )

    assert first.status_code == 201
    assert second.status_code == 201


def test_ended_assignment_does_not_block_a_new_active_row_at_db_level(
    db_session, make_board_position, make_member
):
    position = make_board_position(name="President")
    member_one = make_member(first_name="Jane")
    member_two = make_member(first_name="John")

    db_session.add(
        BoardPositionAssignment(
            board_position_id=position.id,
            member_id=member_one.id,
            rotary_year=CURRENT_YEAR,
            start_date=date(CURRENT_YEAR, 7, 1),
            end_date=date.today(),
        )
    )
    db_session.commit()

    db_session.add(
        BoardPositionAssignment(
            board_position_id=position.id,
            member_id=member_two.id,
            rotary_year=CURRENT_YEAR,
            start_date=date.today(),
            end_date=None,
        )
    )
    db_session.commit()  # must not raise


def test_two_active_rows_for_same_position_and_year_still_rejected(
    db_session, make_board_position, make_member
):
    position = make_board_position(name="President")
    member_one = make_member(first_name="Jane")
    member_two = make_member(first_name="John")

    db_session.add(
        BoardPositionAssignment(
            board_position_id=position.id, member_id=member_one.id, rotary_year=CURRENT_YEAR
        )
    )
    db_session.commit()

    db_session.add(
        BoardPositionAssignment(
            board_position_id=position.id, member_id=member_two.id, rotary_year=CURRENT_YEAR
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# --- PATCH /board/assignments/{id} -------------------------------------------


def test_patch_assignment_requires_authentication(client, make_board_position, make_member, make_board_position_assignment):
    position = make_board_position(name="President")
    member = make_member()
    assignment = make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)

    response = client.patch(
        f"/api/v1/board/assignments/{assignment.id}", json={"end_date": date.today().isoformat()}
    )

    assert response.status_code == 401


def test_patch_assignment_forbidden_without_write_access(
    user_client, make_board_position, make_member, make_board_position_assignment
):
    position = make_board_position(name="President")
    member = make_member()
    assignment = make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)

    response = user_client.patch(
        f"/api/v1/board/assignments/{assignment.id}", json={"end_date": date.today().isoformat()}
    )

    assert response.status_code == 403


def test_admin_can_patch_assignment_end_date(
    admin_client, make_board_position, make_member, make_board_position_assignment
):
    position = make_board_position(name="President")
    member = make_member()
    assignment = make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)

    response = admin_client.patch(
        f"/api/v1/board/assignments/{assignment.id}", json={"end_date": "2020-01-01"}
    )

    assert response.status_code == 200
    assert response.json()["end_date"] == "2020-01-01"


def test_patch_assignment_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/board/assignments/00000000-0000-0000-0000-000000000000",
        json={"end_date": "2020-01-01"},
    )

    assert response.status_code == 404
