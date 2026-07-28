from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PrimeFlowReportDeliveryRun(Base):
    __tablename__ = "primeflow_report_delivery_runs"
    __table_args__ = (
        UniqueConstraint(
            "report_type", "report_date", "report_slot", "recipient_group",
            name="uq_primeflow_report_delivery_run_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_type: Mapped[str] = mapped_column(String(40), nullable=False, default="primeflow_1h")
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    report_slot: Mapped[str] = mapped_column(String(5), nullable=False)
    recipient_group: Mapped[str] = mapped_column(String(40), nullable=False, default="default")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    data_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    recipients: Mapped[str] = mapped_column(Text, nullable=False)
    body_hash: Mapped[str | None] = mapped_column(String(64))
    gmail_message_id: Mapped[str | None] = mapped_column(String(255))
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255))
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
