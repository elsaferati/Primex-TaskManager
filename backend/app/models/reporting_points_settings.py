from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ReportingPointsSettings(Base):
    __tablename__ = "reporting_points_settings"

    report_type: Mapped[str] = mapped_column(String(2), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    send_time: Mapped[time] = mapped_column(Time, nullable=False)
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    recipients: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # NULL retains the previous manual configuration until explicitly saved.
    manual_recipients: Mapped[dict | None] = mapped_column(JSONB)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
