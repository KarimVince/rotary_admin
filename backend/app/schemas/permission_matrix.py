import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.app_function import AppFunctionRead
from app.schemas.board_position import BoardPositionRead

AccessLevel = Literal["no_access", "read", "write"]


class PermissionMatrixEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    board_position_id: uuid.UUID | None
    app_function_id: uuid.UUID
    access_level: AccessLevel
    is_default_user: bool
    board_position: BoardPositionRead | None = None
    app_function: AppFunctionRead


class PermissionMatrixCellUpsert(BaseModel):
    app_function_id: uuid.UUID
    # None means this cell is the fixed "Default User" column.
    board_position_id: uuid.UUID | None = None
    access_level: AccessLevel


class PermissionMatrixCellUpsertResult(BaseModel):
    entry: PermissionMatrixEntryRead
    # Submenu cells auto-clamped down because a menu-level cell was just
    # lowered below them, in the same transaction as the requested change.
    cascaded: list[PermissionMatrixEntryRead] = []
