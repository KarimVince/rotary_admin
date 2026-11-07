import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ServiceProjectStatus = Literal["idea", "planning", "in_progress", "completed"]


class ServiceProjectUpsert(BaseModel):
    status: ServiceProjectStatus = "planning"
    lead_member_id: uuid.UUID | None = None
    objectives: str | None = None
    plan: str | None = None
    outcome: str | None = None


class ServiceProjectDocumentRead(BaseModel):
    id: uuid.UUID
    service_project_id: uuid.UUID
    description: str | None
    file_original_filename: str
    file_content_type: str
    file_size_bytes: int
    uploaded_by: uuid.UUID | None
    uploaded_by_name: str | None
    created_at: datetime


class ServiceProjectRead(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    rotary_year: int
    status: ServiceProjectStatus
    lead_member_id: uuid.UUID | None
    lead_member_name: str | None
    objectives: str | None
    plan: str | None
    outcome: str | None
    documents: list[ServiceProjectDocumentRead]
    created_by: uuid.UUID | None
    created_at: datetime
    last_updated_by: uuid.UUID | None
    last_updated_by_name: str | None
    last_updated_at: datetime
