import uuid

from pydantic import BaseModel, ConfigDict


class AppFunctionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    label: str
    module: str
    parent_id: uuid.UUID | None
    display_order: int
    active: bool
