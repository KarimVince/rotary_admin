import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemberTitleCreate(BaseModel):
    code: str
    label: str
    sort_order: int = 0


class MemberTitleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    label: str
    sort_order: int
    is_active: bool
    created_at: datetime
