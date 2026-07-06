from pydantic import BaseModel

from app.schemas.member_statistics import LabelValue


class RotaryFriendStatistics(BaseModel):
    total_friends: int
    by_source: list[LabelValue]
    by_tag: list[LabelValue]
    # Contactability breakdown: email_only / whatsapp_only / both.
    contactability: list[LabelValue]
