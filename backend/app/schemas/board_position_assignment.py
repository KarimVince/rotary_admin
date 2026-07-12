import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.board_position import BoardPositionRead


class AssignmentMemberSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    # Story 8.19: the Dashboard board strip needs a photo + a few key
    # details per card — everything else about the member is out of scope
    # for this summary (BoardMembers.jsx only ever needed the name).
    photo_url: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    nationality: str | None = None


class BoardPositionAssignmentCreate(BaseModel):
    board_position_id: uuid.UUID
    member_id: uuid.UUID


class BoardPositionAssignmentUpdate(BaseModel):
    start_date: date | None = None
    end_date: date | None = None


class BoardPositionAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    board_position_id: uuid.UUID
    member_id: uuid.UUID
    rotary_year: int
    start_date: date | None
    end_date: date | None
    created_by: uuid.UUID | None
    created_at: datetime
    board_position: BoardPositionRead | None = None
    member: AssignmentMemberSummary | None = None
