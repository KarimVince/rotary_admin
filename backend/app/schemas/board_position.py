import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BoardPositionCreate(BaseModel):
    name: str
    description: str | None = None
    display_order: int = 0
    at_the_board: bool = False


class BoardPositionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    display_order: int | None = None
    active: bool | None = None
    at_the_board: bool | None = None


class BoardPositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    display_order: int
    active: bool
    at_the_board: bool
    created_at: datetime
