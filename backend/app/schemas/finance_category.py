import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class FinanceCategoryCreate(BaseModel):
    name: str
    type: Literal["revenue", "cost"]
    sort_order: int = 0


class FinanceCategoryUpdate(BaseModel):
    name: str | None = None
    type: Literal["revenue", "cost"] | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class FinanceCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    sort_order: int
    is_active: bool
    created_at: datetime
