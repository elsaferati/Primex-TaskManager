from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import ProjectPhaseStatus, TaskFinishPeriod, TaskPriority, TaskStatus


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("system_template_origin_id", name="uq_tasks_system_template_origin_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    internal_notes: Mapped[str | None] = mapped_column(String)

    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    dependency_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id")
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    ga_note_origin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ga_notes.id"))
    system_template_origin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("system_task_templates.id")
    )

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="TODO"
    )
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="NORMAL"
    )
    finish_period: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    phase: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="MEETINGS",
    )
    progress_percentage: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_bllok: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_1h_report: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_r1: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_personal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

