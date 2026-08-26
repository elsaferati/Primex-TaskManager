from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DailyPlanAdjustment(Base):
    """Narrow approval record for one semantic daily plan-change event."""

    __tablename__ = "daily_plan_adjustments"
    __table_args__ = (
        UniqueConstraint("audit_event_id", "user_id", name="uq_daily_plan_adjustment_event_user"),
        CheckConstraint("adjustment_type IN ('POSTPONEMENT','REASSIGNMENT','REMOVAL')", name="ck_daily_plan_adjustment_type"),
        CheckConstraint("status IN ('PENDING','APPROVED','REJECTED')", name="ck_daily_plan_adjustment_status"),
        Index("ix_daily_plan_adjustment_user_day", "user_id", "day_date", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    audit_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("audit_logs.id", ondelete="RESTRICT"), nullable=False
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    day_date: Mapped[date] = mapped_column(Date, nullable=False)
    adjustment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="PENDING")
    reason: Mapped[str | None] = mapped_column(Text)
    decision_comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
