from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class StdFeedbackTicket(Base):
    __tablename__ = "std_feedback_tickets"
    __table_args__ = (
        UniqueConstraint("external_id", name="uq_std_feedback_tickets_external_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    issue_number: Mapped[int | None] = mapped_column(Integer, index=True)
    order_ticket_number: Mapped[str | None] = mapped_column(String(100), index=True)
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    affected_fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    category: Mapped[str | None] = mapped_column(String(50))
    priority: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str | None] = mapped_column(String(50), index=True)
    dashboard_area: Mapped[str | None] = mapped_column(String(100))
    creator_id: Mapped[str | None] = mapped_column(String(100))
    reporter_username: Mapped[str | None] = mapped_column(String(255))
    reporter_email: Mapped[str | None] = mapped_column(String(255))
    assigned_admin: Mapped[str | None] = mapped_column(String(255))
    closed_by: Mapped[str | None] = mapped_column(String(255))
    related_order_id: Mapped[str | None] = mapped_column(String(100))
    order_snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    review_status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ga_note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ga_notes.id", ondelete="SET NULL"), index=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), index=True
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StdFeedbackSyncState(Base):
    __tablename__ = "std_feedback_sync_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True, default="default")
    after_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    after_id: Mapped[str | None] = mapped_column(String(100))
    last_successful_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
