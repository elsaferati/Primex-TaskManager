from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Integer, String, Time, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AfterBreakReportSettings(Base):
    __tablename__ = "after_break_report_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    send_time: Mapped[time] = mapped_column(Time, nullable=False, default=lambda: time(13, 15))
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="Europe/Tirane")
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, default=lambda: [0, 1, 2, 3, 4])
    recipients: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_run_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
