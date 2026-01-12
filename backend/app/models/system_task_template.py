from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import FrequencyType, SystemTaskScope, TaskFinishPeriod, TaskPriority


class SystemTaskTemplate(Base):
    __tablename__ = "system_task_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    internal_notes: Mapped[str | None] = mapped_column(String)
    department_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"))
    default_assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    scope: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="ALL",
    )

    frequency: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    day_of_week: Mapped[int | None] = mapped_column(Integer)
    days_of_week: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(Integer)
    month_of_year: Mapped[int | None] = mapped_column(Integer)

    priority: Mapped[str | None] = mapped_column(
        String(50), nullable=True, server_default="NORMAL"
    )
    finish_period: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

