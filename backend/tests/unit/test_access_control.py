from datetime import date

import pytest

from app.core.access_control import clear_access_cache, get_access
from app.core.rotary_year import rotary_year
from app.models import PermissionMatrix

pytestmark = pytest.mark.unit

CURRENT_YEAR = rotary_year(date.today())


def test_admin_bypasses_matrix_lookup(db_session, make_user, make_app_function):
    admin = make_user(email="admin@example.com", role="admin")
    app_function = make_app_function(key="donations")

    assert get_access(db_session, admin, app_function.key) == "write"


def test_admin_bypasses_matrix_lookup_for_unknown_function_key(db_session, make_user):
    admin = make_user(email="admin2@example.com", role="admin")

    assert get_access(db_session, admin, "does-not-exist") == "write"


def test_user_with_one_position_write_access(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u1@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Treasurer")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="member-fees")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")

    assert get_access(db_session, user, "member-fees") == "write"


def test_user_with_one_position_read_only(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u2@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="read")

    assert get_access(db_session, user, "donations") == "read"


def test_user_with_one_position_no_access(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u3@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=position.id, access_level="no_access"
    )

    assert get_access(db_session, user, "donations") == "no_access"


def test_user_with_multiple_positions_most_permissive_wins(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u4@example.com", role="user", member_id=member.id)
    secretary = make_board_position(name="Secretary")
    treasurer = make_board_position(name="Treasurer")
    make_board_position_assignment(secretary.id, member.id, rotary_year=CURRENT_YEAR)
    make_board_position_assignment(treasurer.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(app_function.id, board_position_id=secretary.id, access_level="read")
    make_permission_matrix_entry(app_function.id, board_position_id=treasurer.id, access_level="write")

    assert get_access(db_session, user, "donations") == "write"


def test_user_with_no_board_position_uses_default_user_row(
    db_session, make_user, make_member, make_app_function, make_permission_matrix_entry
):
    member = make_member()
    user = make_user(email="u5@example.com", role="user", member_id=member.id)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )

    assert get_access(db_session, user, "donations") == "read"


def test_user_with_no_member_linked_uses_default_user_row(
    db_session, make_user, make_app_function, make_permission_matrix_entry
):
    user = make_user(email="u6@example.com", role="user", member_id=None)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )

    assert get_access(db_session, user, "donations") == "write"


def test_user_with_deactivated_position_only_treated_as_no_position(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u7@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary", active=False)
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="donations")
    # A deactivated position's matrix entry must not apply, even if it would grant write.
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )

    assert get_access(db_session, user, "donations") == "read"


def test_position_held_in_a_different_rotary_year_is_not_counted(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u8@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR - 1)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="no_access", is_default_user=True
    )

    assert get_access(db_session, user, "donations") == "no_access"


def test_get_access_result_is_cached_until_cleared(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    member = make_member()
    user = make_user(email="u9@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Secretary")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    app_function = make_app_function(key="donations")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="read")

    assert get_access(db_session, user, "donations") == "read"

    entry = (
        db_session.query(PermissionMatrix)
        .filter(PermissionMatrix.app_function_id == app_function.id)
        .one()
    )
    entry.access_level = "write"
    db_session.commit()

    # Still cached from the first lookup.
    assert get_access(db_session, user, "donations") == "read"

    clear_access_cache()

    assert get_access(db_session, user, "donations") == "write"


def test_get_access_resolves_submenu_independently_of_parent_menu_hierarchy(
    db_session,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    # Story 12.1: get_access() is unchanged by the Menu/Submenu hierarchy —
    # the parent-child constraint is a write-time guarantee (enforced by the
    # matrix upsert endpoint), not something the read-time resolver computes.
    # A submenu's access is looked up purely by its own function key.
    member = make_member()
    user = make_user(email="u10@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Treasurer")
    make_board_position_assignment(position.id, member.id, rotary_year=CURRENT_YEAR)
    menu = make_app_function(key="fees", label="Member Fees")
    submenu = make_app_function(key="fees.run", label="Member Fees — Run", parent_id=menu.id)
    make_permission_matrix_entry(menu.id, board_position_id=position.id, access_level="write")
    make_permission_matrix_entry(submenu.id, board_position_id=position.id, access_level="read")

    assert get_access(db_session, user, "fees") == "write"
    assert get_access(db_session, user, "fees.run") == "read"
