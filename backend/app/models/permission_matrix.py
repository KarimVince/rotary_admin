import uuid

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

access_level_enum = Enum("no_access", "read", "write", name="access_level")


class PermissionMatrix(Base):
    __tablename__ = "permission_matrix"
    __table_args__ = (
        UniqueConstraint(
            "board_position_id", "app_function_id", name="uq_permission_matrix_position_function"
        ),
        Index(
            "uq_permission_matrix_default_user_function",
            "app_function_id",
            unique=True,
            postgresql_where=text("is_default_user = true"),
        ),
        CheckConstraint(
            "(is_default_user = true AND board_position_id IS NULL) "
            "OR (is_default_user = false AND board_position_id IS NOT NULL)",
            name="chk_permission_matrix_default_user_no_position",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    board_position_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("board_positions.id", ondelete="CASCADE")
    )
    app_function_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_functions.id", ondelete="CASCADE"), nullable=False
    )
    access_level: Mapped[str] = mapped_column(access_level_enum, nullable=False)
    is_default_user: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
