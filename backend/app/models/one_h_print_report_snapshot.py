from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OneHPrintReportSnapshot(Base):
    __tablename__ = "one_h_print_report_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "report_kind",
            "report_date",
            name="uq_one_h_print_report_snapshot_kind_date",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    report_kind: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    target_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    report_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
