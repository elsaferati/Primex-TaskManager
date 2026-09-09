from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OpenTaskPlanningBaseline(Base):
    __tablename__ = "open_task_planning_baselines"
    __table_args__ = (
        UniqueConstraint(
            "planning_week_start",
            "task_id",
            name="uq_open_task_planning_baseline_week_task",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    planning_week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    when_value: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status_value: Mapped[str | None] = mapped_column(String(20), nullable=True)
    comment_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
