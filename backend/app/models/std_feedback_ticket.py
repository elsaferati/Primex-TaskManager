from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, func
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
    reporter_username: Mapped[str | None] = mapped_column(String(255))
    reporter_email: Mapped[str | None] = mapped_column(String(255))
    assigned_admin: Mapped[str | None] = mapped_column(String(255))
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
