import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration

EXPECTED_SUBMENUS = [
    "event.list",
    "event.guests",
    "event.auction",
    "event.costs",
    "event.sponsors",
    "event.summary",
    "event.rundown",
    "event.setup",
]


def test_event_menu_and_submenus_seeded(db_session):
    menu = db_session.execute(
        text("SELECT id, parent_id, active FROM app_functions WHERE key = 'event'")
    ).first()
    assert menu is not None
    assert menu.parent_id is None
    assert menu.active is True

    for key in EXPECTED_SUBMENUS:
        row = db_session.execute(
            text("SELECT parent_id, active FROM app_functions WHERE key = :key"), {"key": key}
        ).first()
        assert row is not None, f"{key} not seeded"
        assert row.parent_id == menu.id
        assert row.active is True
