import uuid
from datetime import datetime

from pydantic import BaseModel


class PptTemplateRead(BaseModel):
    id: uuid.UUID
    rotary_year: int
    original_filename: str
    uploaded_by: uuid.UUID | None
    uploaded_by_name: str | None
    uploaded_at: datetime
