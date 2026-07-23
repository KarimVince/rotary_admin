import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration

EXPECTED_SUBMENUS = [
    "finance.summary",
    "finance.donations",
    "finance.fundraising",
    "finance.operational",
]


def test_admin_finance_categories_seeded_under_admin_menu(db_session):
    admin_menu = db_session.execute(
        text("SELECT id FROM app_functions WHERE key = 'admin'")
    ).first()
    row = db_session.execute(
        text("SELECT parent_id, active FROM app_functions WHERE key = 'admin.finance_categories'")
    ).first()
    assert row is not None
    assert row.parent_id == admin_menu.id
    assert row.active is True


def test_finance_menu_and_submenus_seeded(db_session):
    menu = db_session.execute(
        text("SELECT id, parent_id, active FROM app_functions WHERE key = 'finance'")
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
