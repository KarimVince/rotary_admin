from pydantic import BaseModel, EmailStr, Field


class AccountPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AccountEmailChangeRequest(BaseModel):
    new_email: EmailStr
    current_password: str


class AccountEmailChangeConfirm(BaseModel):
    token: str
