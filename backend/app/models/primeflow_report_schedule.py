from __future__ import annotations
import uuid
from datetime import datetime, time
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class PrimeFlowReportSchedule(Base):
    __tablename__ = "primeflow_report_schedules"
    __table_args__ = (UniqueConstraint("name", name="uq_primeflow_report_schedule_name"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    report_slot: Mapped[str] = mapped_column(String(5), nullable=False)
    execution_time: Mapped[time] = mapped_column(Time, nullable=False)
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="Europe/Tirane")
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, default=lambda: [0, 1, 2, 3, 4])
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    backfill_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    predecessor_schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("primeflow_report_schedules.id", ondelete="SET NULL"))
    grace_period_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    retry_delays_seconds: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, default=lambda: [0, 2, 5])
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
