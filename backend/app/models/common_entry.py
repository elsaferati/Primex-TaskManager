from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import CommonApprovalStatus, CommonCategory


class CommonEntry(Base):
    __tablename__ = "common_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[CommonCategory] = mapped_column(
        Enum(CommonCategory, name="common_category", values_callable=lambda enums: [e.value for e in enums]),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(String(8000))
    entry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)

    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    approval_status: Mapped[CommonApprovalStatus] = mapped_column(
        Enum(CommonApprovalStatus, name="common_approval_status"), nullable=False, index=True
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(1000))

    generated_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

