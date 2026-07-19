from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.rotary_year import rotary_year
from app.models import BoardPositionAssignment, PermissionMatrix

pytestmark = pytest.mark.integration

CURRENT_YEAR = rotary_year(date.today())


# --- GET /board/positions ---------------------------------------------------


def test_list_board_positions_requires_authentication(client):
    response = client.get("/api/v1/board/positions")

    assert response.status_code == 401


def test_list_board_positions_returns_active_only_by_default(
    admin_client, make_board_position
):
    make_board_position(name="Test President", active=True)
    make_board_position(name="Retired Role", active=False)

    response = admin_client.get("/api/v1/board/positions")

    assert response.status_code == 200
    names = [position["name"] for position in response.json()]
    assert "Test President" in names
    assert "Retired Role" not in names


def test_list_board_positions_include_inactive_shows_all(admin_client, make_board_position):
    make_board_position(name="Test President", active=True)
    make_board_position(name="Retired Role", active=False)

    response = admin_client.get("/api/v1/board/positions", params={"include_inactive": True})

    names = [position["name"] for position in response.json()]
    assert "Test President" in names
    assert "Retired Role" in names


def test_list_board_positions_ordered_by_display_order(admin_client, make_board_position):
    make_board_position(name="Test Secretary", display_order=2)
    make_board_position(name="Test President", display_order=1)

    response = admin_client.get("/api/v1/board/positions")

    names = [position["name"] for position in response.json()]
    assert names.index("Test President") < names.index("Test Secretary")


# --- POST /board/positions ---------------------------------------------------


def test_admin_can_create_board_position(admin_client):
    response = admin_client.post(
        "/api/v1/board/positions",
        json={"name": "Test President", "description": "Club president", "display_order": 1},
    )

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Test President"
    assert created["active"] is True


def test_non_admin_cannot_create_board_position(user_client):
    response = user_client.post("/api/v1/board/positions", json={"name": "Test President"})

    assert response.status_code == 403


def test_create_board_position_requires_authentication(client):
    response = client.post("/api/v1/board/positions", json={"name": "Test President"})

    assert response.status_code == 401


def test_create_board_position_duplicate_name_returns_409(admin_client):
    admin_client.post("/api/v1/board/positions", json={"name": "Test Treasurer"})

    response = admin_client.post("/api/v1/board/positions", json={"name": "Test Treasurer"})

    assert response.status_code == 409


def test_create_board_position_duplicate_name_case_insensitive_returns_409(admin_client):
    admin_client.post("/api/v1/board/positions", json={"name": "Test Secretary"})

    response = admin_client.post("/api/v1/board/positions", json={"name": "TEST SECRETARY"})

    assert response.status_code == 409


# --- Story 16.7: at_the_board flag -------------------------------------------


def test_create_board_position_at_the_board_defaults_to_false(admin_client):
    response = admin_client.post("/api/v1/board/positions", json={"name": "Chair Raffle"})

    assert response.status_code == 201
    assert response.json()["at_the_board"] is False


def test_create_board_position_at_the_board_can_be_set_true(admin_client):
    response = admin_client.post(
        "/api/v1/board/positions", json={"name": "Chair Raffle", "at_the_board": True}
    )

    assert response.status_code == 201
    assert response.json()["at_the_board"] is True


@pytest.mark.parametrize("name", ["President", "Treasurer", "Secretary"])
def test_create_board_position_forces_at_the_board_true_for_locked_positions(
    admin_client, name
):
    response = admin_client.post(
        "/api/v1/board/positions", json={"name": name, "at_the_board": False}
    )

    assert response.status_code == 201
    assert response.json()["at_the_board"] is True


@pytest.mark.parametrize("name", ["president", "TREASURER", " Secretary "])
def test_create_board_position_locked_match_is_case_and_whitespace_insensitive(
    admin_client, name
):
    response = admin_client.post(
        "/api/v1/board/positions", json={"name": name, "at_the_board": False}
    )

    assert response.status_code == 201
    assert response.json()["at_the_board"] is True


def test_update_board_position_cannot_unset_at_the_board_for_locked_position(admin_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "President"}).json()

    response = admin_client.patch(
        f"/api/v1/board/positions/{created['id']}", json={"at_the_board": False}
    )

    assert response.status_code == 200
    assert response.json()["at_the_board"] is True


def test_update_board_position_can_toggle_at_the_board_for_non_locked_position(admin_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Chair Raffle"}).json()
    assert created["at_the_board"] is False

    response = admin_client.patch(
        f"/api/v1/board/positions/{created['id']}", json={"at_the_board": True}
    )

    assert response.status_code == 200
    assert response.json()["at_the_board"] is True


# --- PATCH /board/positions/{id} --------------------------------------------


def test_admin_can_update_board_position(admin_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()

    response = admin_client.patch(
        f"/api/v1/board/positions/{created['id']}", json={"description": "Updated"}
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated"


def test_update_board_position_duplicate_name_returns_409(admin_client):
    admin_client.post("/api/v1/board/positions", json={"name": "Test President"})
    other = admin_client.post("/api/v1/board/positions", json={"name": "Test Secretary"}).json()

    response = admin_client.patch(
        f"/api/v1/board/positions/{other['id']}", json={"name": "Test President"}
    )

    assert response.status_code == 409


def test_update_board_position_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/board/positions/00000000-0000-0000-0000-000000000000", json={"name": "x"}
    )

    assert response.status_code == 404


def test_non_admin_cannot_update_board_position(admin_client, user_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()

    response = user_client.patch(
        f"/api/v1/board/positions/{created['id']}", json={"description": "x"}
    )

    assert response.status_code == 403


def test_update_board_position_reorders_display_order(admin_client):
    created = admin_client.post(
        "/api/v1/board/positions", json={"name": "Test President", "display_order": 1}
    ).json()

    response = admin_client.patch(
        f"/api/v1/board/positions/{created['id']}", json={"display_order": 5}
    )

    assert response.status_code == 200
    assert response.json()["display_order"] == 5


# --- DELETE /board/positions/{id} (soft-delete) -----------------------------


def test_admin_can_deactivate_board_position(admin_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()

    response = admin_client.delete(f"/api/v1/board/positions/{created['id']}")

    assert response.status_code == 200
    assert response.json()["active"] is False


def test_non_admin_cannot_deactivate_board_position(admin_client, user_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()

    response = user_client.delete(f"/api/v1/board/positions/{created['id']}")

    assert response.status_code == 403


def test_deactivate_board_position_not_found_returns_404(admin_client):
    response = admin_client.delete("/api/v1/board/positions/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404


def test_deactivating_board_position_does_not_break_historical_assignments(
    admin_client, make_member, make_board_position_assignment
):
    position = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()
    member = make_member()
    make_board_position_assignment(position["id"], member.id, rotary_year=2025)

    deactivate_response = admin_client.delete(f"/api/v1/board/positions/{position['id']}")
    assert deactivate_response.status_code == 200

    assignments_response = admin_client.get("/api/v1/board/assignments", params={"year": 2025})
    assert assignments_response.status_code == 200
    assert len(assignments_response.json()) == 1


def test_deactivated_board_position_excluded_from_default_list(admin_client):
    created = admin_client.post("/api/v1/board/positions", json={"name": "Test President"}).json()
    admin_client.delete(f"/api/v1/board/positions/{created['id']}")

    response = admin_client.get("/api/v1/board/positions")

    names = [position["name"] for position in response.json()]
    assert "Test President" not in names


# --- GET /board/assignments -------------------------------------------------


def test_list_board_position_assignments_requires_authentication(client):
    response = client.get("/api/v1/board/assignments", params={"year": 2025})

    assert response.status_code == 401


def test_list_board_position_assignments_requires_year_query_param(admin_client):
    response = admin_client.get("/api/v1/board/assignments")

    assert response.status_code == 422


def test_list_board_position_assignments_filters_by_year(
    admin_client, make_board_position, make_member, make_board_position_assignment
):
    position = make_board_position(name="Test President")
    member = make_member()
    make_board_position_assignment(position.id, member.id, rotary_year=2024)
    make_board_position_assignment(position.id, member.id, rotary_year=2025)

    response = admin_client.get("/api/v1/board/assignments", params={"year": 2025})

    assert response.status_code == 200
    years = [assignment["rotary_year"] for assignment in response.json()]
    assert years == [2025]


def test_member_can_hold_multiple_positions_same_year(
    admin_client, make_board_position, make_member, make_board_position_assignment
):
    president = make_board_position(name="Test President")
    secretary = make_board_position(name="Test Secretary")
    member = make_member()
    make_board_position_assignment(president.id, member.id, rotary_year=2025)
    make_board_position_assignment(secretary.id, member.id, rotary_year=2025)

    response = admin_client.get("/api/v1/board/assignments", params={"year": 2025})

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_unique_constraint_one_assignment_per_position_per_year(
    db_session, make_board_position, make_member, make_board_position_assignment
):
    position = make_board_position(name="Test President")
    member_one = make_member(first_name="Jane")
    member_two = make_member(first_name="John")
    make_board_position_assignment(position.id, member_one.id, rotary_year=2025)

    db_session.add(
        BoardPositionAssignment(
            board_position_id=position.id, member_id=member_two.id, rotary_year=2025
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# --- GET /board/permissions/matrix ------------------------------------------


def test_get_permission_matrix_requires_authentication(client):
    response = client.get("/api/v1/board/permissions/matrix")

    assert response.status_code == 401


def test_get_permission_matrix_returns_entries_with_nested_data(
    admin_client, make_board_position, make_app_function, make_permission_matrix_entry
):
    position = make_board_position(name="Test Treasurer")
    app_function = make_app_function(key="member-fees", label="Member Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=position.id, access_level="write"
    )

    response = admin_client.get("/api/v1/board/permissions/matrix")

    assert response.status_code == 200
    entries = response.json()
    assert len(entries) == 1
    entry = entries[0]
    assert entry["access_level"] == "write"
    assert entry["is_default_user"] is False
    assert entry["board_position"]["name"] == "Test Treasurer"
    assert entry["app_function"]["key"] == "member-fees"


def test_get_permission_matrix_default_user_entry_has_null_board_position(
    admin_client, make_app_function, make_permission_matrix_entry
):
    app_function = make_app_function(key="donations", label="Donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )

    response = admin_client.get("/api/v1/board/permissions/matrix")

    entries = response.json()
    assert len(entries) == 1
    assert entries[0]["board_position_id"] is None
    assert entries[0]["board_position"] is None
    assert entries[0]["is_default_user"] is True


def test_permission_matrix_unique_constraint_per_position_and_function(
    db_session, make_board_position, make_app_function, make_permission_matrix_entry
):
    position = make_board_position(name="Test Treasurer")
    app_function = make_app_function(key="member-fees", label="Member Fees")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="read")

    db_session.add(
        PermissionMatrix(
            board_position_id=position.id,
            app_function_id=app_function.id,
            access_level="write",
            is_default_user=False,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_permission_matrix_unique_constraint_default_user_per_function(
    db_session, make_app_function, make_permission_matrix_entry
):
    app_function = make_app_function(key="donations", label="Donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )

    db_session.add(
        PermissionMatrix(
            board_position_id=None,
            app_function_id=app_function.id,
            access_level="write",
            is_default_user=True,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_permission_matrix_check_constraint_default_user_requires_null_board_position(
    db_session, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    app_function = make_app_function(key="donations", label="Donations")

    db_session.add(
        PermissionMatrix(
            board_position_id=position.id,
            app_function_id=app_function.id,
            access_level="read",
            is_default_user=True,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_permission_matrix_check_constraint_non_default_requires_board_position(
    db_session, make_app_function
):
    app_function = make_app_function(key="donations", label="Donations")

    db_session.add(
        PermissionMatrix(
            board_position_id=None,
            app_function_id=app_function.id,
            access_level="read",
            is_default_user=False,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# --- GET /board/app-functions ------------------------------------------------


def test_list_app_functions_requires_authentication(client):
    response = client.get("/api/v1/board/app-functions")

    assert response.status_code == 401


def test_list_app_functions_returns_active_only_by_default(admin_client, make_app_function):
    make_app_function(key="members", label="Members", active=True)
    make_app_function(key="retired-module", label="Retired Module", active=False)

    response = admin_client.get("/api/v1/board/app-functions")

    assert response.status_code == 200
    keys = [fn["key"] for fn in response.json()]
    assert "members" in keys
    assert "retired-module" not in keys


def test_list_app_functions_include_inactive_shows_all(admin_client, make_app_function):
    make_app_function(key="members", label="Members", active=True)
    make_app_function(key="retired-module", label="Retired Module", active=False)

    response = admin_client.get("/api/v1/board/app-functions", params={"include_inactive": True})

    keys = [fn["key"] for fn in response.json()]
    assert "members" in keys
    assert "retired-module" in keys


def test_list_app_functions_ordered_by_display_order(admin_client, make_app_function):
    make_app_function(key="second", label="Second", display_order=2)
    make_app_function(key="first", label="First", display_order=1)

    response = admin_client.get("/api/v1/board/app-functions")

    keys = [fn["key"] for fn in response.json()]
    assert keys.index("first") < keys.index("second")


# --- PUT /board/permissions/matrix/cell --------------------------------------


def test_admin_can_create_new_matrix_cell(admin_client, make_board_position, make_app_function):
    position = make_board_position(name="Test Treasurer")
    app_function = make_app_function(key="member-fees", label="Member Fees")

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": str(position.id),
            "access_level": "write",
        },
    )

    assert response.status_code == 200
    entry = response.json()["entry"]
    assert entry["access_level"] == "write"
    assert entry["is_default_user"] is False
    assert entry["board_position"]["name"] == "Test Treasurer"
    assert response.json()["cascaded"] == []


def test_admin_can_update_existing_matrix_cell(
    admin_client, make_board_position, make_app_function, make_permission_matrix_entry
):
    position = make_board_position(name="Test Treasurer")
    app_function = make_app_function(key="member-fees", label="Member Fees")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="read")

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": str(position.id),
            "access_level": "write",
        },
    )

    assert response.status_code == 200
    assert response.json()["entry"]["access_level"] == "write"

    list_response = admin_client.get("/api/v1/board/permissions/matrix")
    assert len(list_response.json()) == 1


def test_admin_can_upsert_default_user_matrix_cell(admin_client, make_app_function):
    app_function = make_app_function(key="donations", label="Donations")

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": None,
            "access_level": "read",
        },
    )

    assert response.status_code == 200
    entry = response.json()["entry"]
    assert entry["is_default_user"] is True
    assert entry["board_position_id"] is None
    assert entry["board_position"] is None


# --- PUT /board/permissions/matrix/cell — Menu/Submenu hierarchy (Story 12.1) ---


def test_submenu_cell_rejected_when_it_exceeds_parent_menu_level(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    submenu = make_app_function(key="fees.run", label="Member Fees — Run", parent_id=menu.id)
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "read"},
    )

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(submenu.id),
            "board_position_id": str(position.id),
            "access_level": "write",
        },
    )

    assert response.status_code == 400


def test_submenu_cell_rejected_when_parent_menu_has_no_row(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    submenu = make_app_function(key="fees.run", label="Member Fees — Run", parent_id=menu.id)

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(submenu.id),
            "board_position_id": str(position.id),
            "access_level": "read",
        },
    )

    assert response.status_code == 400


def test_submenu_cell_accepted_when_it_matches_parent_menu_level(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    submenu = make_app_function(key="fees.run", label="Member Fees — Run", parent_id=menu.id)
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "write"},
    )

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(submenu.id),
            "board_position_id": str(position.id),
            "access_level": "write",
        },
    )

    assert response.status_code == 200


def test_lowering_menu_cascades_clamp_onto_submenus_above_new_level(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    tracking = make_app_function(key="fees.tracking", label="Member Fees — Tracking", parent_id=menu.id)
    run = make_app_function(key="fees.run", label="Member Fees — Run", parent_id=menu.id)
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "write"},
    )
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(tracking.id), "board_position_id": str(position.id), "access_level": "write"},
    )
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(run.id), "board_position_id": str(position.id), "access_level": "read"},
    )

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "read"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["entry"]["access_level"] == "read"
    cascaded_keys = {entry["app_function"]["key"]: entry["access_level"] for entry in body["cascaded"]}
    # tracking was at "write" (above the new "read" menu level) so it's clamped down.
    assert cascaded_keys == {"fees.tracking": "read"}


def test_lowering_menu_with_no_submenus_configured_does_not_error(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "write"},
    )

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "no_access"},
    )

    assert response.status_code == 200
    assert response.json()["cascaded"] == []


def test_lowering_menu_does_not_touch_submenus_already_at_or_below_new_level(
    admin_client, make_board_position, make_app_function
):
    position = make_board_position(name="Test Treasurer")
    menu = make_app_function(key="fees", label="Member Fees")
    settings_fn = make_app_function(key="fees.settings", label="Member Fees — Settings", parent_id=menu.id)
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "write"},
    )
    admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(settings_fn.id), "board_position_id": str(position.id), "access_level": "read"},
    )

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={"app_function_id": str(menu.id), "board_position_id": str(position.id), "access_level": "read"},
    )

    assert response.status_code == 200
    assert response.json()["cascaded"] == []


def test_non_admin_cannot_upsert_matrix_cell(user_client, make_app_function):
    app_function = make_app_function(key="donations", label="Donations")

    response = user_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": None,
            "access_level": "read",
        },
    )

    assert response.status_code == 403


def test_upsert_matrix_cell_requires_authentication(client, make_app_function):
    app_function = make_app_function(key="donations", label="Donations")

    response = client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": None,
            "access_level": "read",
        },
    )

    assert response.status_code == 401


def test_upsert_matrix_cell_unknown_app_function_returns_404(admin_client):
    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": "00000000-0000-0000-0000-000000000000",
            "board_position_id": None,
            "access_level": "read",
        },
    )

    assert response.status_code == 404


def test_upsert_matrix_cell_unknown_board_position_returns_404(admin_client, make_app_function):
    app_function = make_app_function(key="donations", label="Donations")

    response = admin_client.put(
        "/api/v1/board/permissions/matrix/cell",
        json={
            "app_function_id": str(app_function.id),
            "board_position_id": "00000000-0000-0000-0000-000000000000",
            "access_level": "write",
        },
    )

    assert response.status_code == 404


# --- GET /board/permissions/me -----------------------------------------------


def test_get_my_permissions_requires_authentication(client):
    response = client.get("/api/v1/board/permissions/me")

    assert response.status_code == 401


def test_admin_resolves_write_for_every_active_function(admin_client, make_app_function):
    # Story 12.1/12.10 seed a real 22-row Menu/Submenu tree that's always
    # present, so this only asserts on the two test-only keys it adds rather
    # than the full permissions map.
    make_app_function(key="donations", label="Donations")
    make_app_function(key="member-fees", label="Member Fees")

    response = admin_client.get("/api/v1/board/permissions/me")

    assert response.status_code == 200
    permissions = response.json()
    assert permissions["donations"] == "write"
    assert permissions["member-fees"] == "write"
    assert all(level == "write" for level in permissions.values())


def test_admin_permissions_exclude_inactive_functions(admin_client, make_app_function):
    make_app_function(key="donations", label="Donations", active=True)
    make_app_function(key="retired", label="Retired", active=False)

    response = admin_client.get("/api/v1/board/permissions/me")

    assert "retired" not in response.json()


def test_user_permissions_resolved_from_held_board_position(
    build_client,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="board-user@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Test Treasurer")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="member-fees", label="Member Fees")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")

    response = build_client(user).get("/api/v1/board/permissions/me")

    assert response.status_code == 200
    assert response.json()["member-fees"] == "write"


def test_user_permissions_fall_back_to_default_user_row(
    build_client, make_user, make_app_function, make_permission_matrix_entry
):
    user = make_user(email="plain-user@example.com", role="user", member_id=None)
    app_function = make_app_function(key="donations", label="Donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )

    response = build_client(user).get("/api/v1/board/permissions/me")

    assert response.status_code == 200
    assert response.json()["donations"] == "read"
