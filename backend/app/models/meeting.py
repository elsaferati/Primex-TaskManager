from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(100))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meeting_url: Mapped[str | None] = mapped_column(String(500))
    meeting_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="external")
    recurrence_type: Mapped[str | None] = mapped_column(String(20))  # "none", "weekly", "monthly"
    recurrence_days_of_week: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    recurrence_days_of_month: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    participants: Mapped[list[MeetingParticipant]] = relationship(
        "MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan"
    )


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    meeting: Mapped[Meeting] = relationship("Meeting", back_populates="participants")
