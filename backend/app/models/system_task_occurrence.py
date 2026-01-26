from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SystemTaskOccurrence(Base):
    """
    Represents a scheduled occurrence of a system (recurring) task for a user on a specific date.

    This is intentionally separate from `tasks` to avoid generating many task rows and to keep
    Weekly Planner (planning) separate from Daily Report (execution/status).
    """

    __tablename__ = "system_task_occurrences"
    __table_args__ = (
        UniqueConstraint("template_id", "user_id", "occurrence_date", name="uq_system_task_occurrence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("system_task_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurrence_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # OPEN = unresolved; DONE / NOT_DONE / SKIPPED are resolved outcomes.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="OPEN")
    comment: Mapped[str | None] = mapped_column(String, nullable=True)
    acted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

