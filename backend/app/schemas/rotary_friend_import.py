from pydantic import BaseModel

from app.schemas.rotary_friend import RotaryFriendCreate


class CsvImportRowPreview(BaseModel):
    row_number: int
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    whatsapp: str | None = None
    tags: str | None = None
    source: str | None = None
    notes: str | None = None
    errors: list[str]
    is_duplicate: bool


class CsvImportPreviewResult(BaseModel):
    rows: list[CsvImportRowPreview]
    valid_count: int
    error_count: int
    duplicate_count: int


class RotaryFriendImportCommitRequest(BaseModel):
    friends: list[RotaryFriendCreate]


class RotaryFriendImportCommitResult(BaseModel):
    created_count: int
    skipped_count: int
    skipped_emails: list[str]
