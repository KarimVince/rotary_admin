import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttendanceAuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    file_original_filename: str
    file_content_type: str
    file_size_bytes: int
    uploaded_by: uuid.UUID | None
    uploaded_by_name: str | None = None
    uploaded_at: datetime
