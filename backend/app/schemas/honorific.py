import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HonorificCreate(BaseModel):
    code: str
    label: str
    sort_order: int = 0


class HonorificUpdate(BaseModel):
    code: str | None = None
    label: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class HonorificRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    label: str
    sort_order: int
    is_active: bool
    created_at: datetime
