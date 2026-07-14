import uuid
from datetime import date as date_

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

member_status_enum = Enum("active", "past", name="member_status")
member_gender_enum = Enum("Male", "Female", "Other", name="member_gender")


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        CheckConstraint(
            "leave_date IS NULL OR leave_date >= join_date", name="chk_members_dates"
        ),
        Index("idx_members_status", "status"),
        Index("idx_members_title", "title_id"),
        Index("idx_members_honorific", "honorific_id"),
        Index("idx_members_nationality", "nationality"),
        Index("idx_members_classification", "classification"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(
        member_status_enum, nullable=False, server_default="active"
    )
    title_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("member_titles.id")
    )
    # Story 8.3: personal honorific (Mr./Mrs./Ms./Dr. etc.) — distinct from
    # title_id above, which is the Rotary role (P/PP/IPP/CP/Rtn).
    honorific_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("honorifics.id")
    )
    join_date: Mapped["Date"] = mapped_column(Date, nullable=False)
    leave_date: Mapped["Date | None"] = mapped_column(Date)
    rotarian_since: Mapped["Date | None"] = mapped_column(Date)
    rotarian_id: Mapped[str | None] = mapped_column(String(50), unique=True)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    profession: Mapped[str | None] = mapped_column(String(150))
    classification: Mapped[str | None] = mapped_column(String(150))
    date_of_birth: Mapped["Date | None"] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(member_gender_enum)
    nationality: Mapped[str | None] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(Text)
    # Story 8.3: new-member-application fields.
    company_name: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[str | None] = mapped_column(String(200))
    proposer_name: Mapped[str | None] = mapped_column(String(200))
    is_couple: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # Story 8.14: honorary is no longer a status value — it's a flag on an
    # otherwise-Active member. Only meaningful when status == "active".
    is_honorary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    @property
    def years_as_rotarian(self) -> float:
        start = self.rotarian_since or self.join_date
        return round((date_.today() - start).days / 365.25, 1)

    @property
    def years_in_this_club(self) -> float:
        return round((date_.today() - self.join_date).days / 365.25, 1)
