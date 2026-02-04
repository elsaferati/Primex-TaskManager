from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TaskDailyProgress(Base):
    __tablename__ = "task_daily_progress"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Snapshot for the day (cumulative completed at last update that day).
    completed_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Total target for the day (from task.daily_products / internal_notes parsing).
    total_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Positive progress delta accumulated during the day (best-effort; informational).
    completed_delta: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Per-day derived status: TODO / IN_PROGRESS / DONE (matches TaskStatus values).
    daily_status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="TODO")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("task_id", "day_date", name="uq_task_daily_progress_task_id_day_date"),
    )

