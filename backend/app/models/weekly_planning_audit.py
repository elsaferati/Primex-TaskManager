from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WeeklyPlanningAuditSettings(Base):
    __tablename__ = "weekly_planning_audit_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Tirane")
    recipients_to: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    recipients_cc: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    recipients_bcc: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    schedule_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    recipient_config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    abbreviation_version: Mapped[str] = mapped_column(String(40), nullable=False, default="2026.1")
    abbreviation_dictionary: Mapped[dict | None] = mapped_column(JSONB)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WeeklyPlanningAuditRun(Base):
    __tablename__ = "weekly_planning_audit_runs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_weekly_planning_audit_run_idempotency"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="weekly_planning_audit", server_default="weekly_planning_audit"
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    slot: Mapped[str] = mapped_column(String(5), nullable=False, index=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="MANUAL")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="GENERATING", index=True)
    included_user_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    excluded_leave_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    high_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filename: Mapped[str | None] = mapped_column(String(255))
    file_checksum: Mapped[str | None] = mapped_column(String(64))
    storage_path: Mapped[str | None] = mapped_column(Text)
    recipients_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    recipient_config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    subject: Mapped[str | None] = mapped_column(String(500))
    message_id: Mapped[str | None] = mapped_column(String(255))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(180))
    report_payload: Mapped[dict | None] = mapped_column(JSONB)
    report_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WeeklyPlanningAuditDelivery(Base):
    __tablename__ = "weekly_planning_audit_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("weekly_planning_audit_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    delivery_type: Mapped[str] = mapped_column(String(20), nullable=False, default="INITIAL")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="SENDING", index=True)
    recipients: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    message_id: Mapped[str | None] = mapped_column(String(255))
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    smtp_response: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    attachment_filename: Mapped[str | None] = mapped_column(String(255))
    report_checksum: Mapped[str | None] = mapped_column(String(64))
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
