import uuid

import pytest
from pydantic import ValidationError

from app.schemas.app_function import AppFunctionRead
from app.schemas.permission_matrix import PermissionMatrixEntryRead

pytestmark = pytest.mark.unit


def _app_function_kwargs():
    return dict(
        id=uuid.uuid4(),
        key="members",
        label="Members",
        module="members",
        parent_id=None,
        display_order=0,
        active=True,
    )


@pytest.mark.parametrize("access_level", ["no_access", "read", "write"])
def test_permission_matrix_entry_accepts_valid_access_levels(access_level):
    entry = PermissionMatrixEntryRead(
        id=uuid.uuid4(),
        board_position_id=uuid.uuid4(),
        app_function_id=uuid.uuid4(),
        access_level=access_level,
        is_default_user=False,
        app_function=AppFunctionRead(**_app_function_kwargs()),
    )
    assert entry.access_level == access_level


def test_permission_matrix_entry_rejects_invalid_access_level():
    with pytest.raises(ValidationError):
        PermissionMatrixEntryRead(
            id=uuid.uuid4(),
            board_position_id=uuid.uuid4(),
            app_function_id=uuid.uuid4(),
            access_level="admin",
            is_default_user=False,
            app_function=AppFunctionRead(**_app_function_kwargs()),
        )


def test_permission_matrix_entry_allows_null_board_position_for_default_user():
    entry = PermissionMatrixEntryRead(
        id=uuid.uuid4(),
        board_position_id=None,
        app_function_id=uuid.uuid4(),
        access_level="read",
        is_default_user=True,
        board_position=None,
        app_function=AppFunctionRead(**_app_function_kwargs()),
    )
    assert entry.board_position_id is None
    assert entry.is_default_user is True
