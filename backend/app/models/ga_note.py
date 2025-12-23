from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import GaNotePriority, GaNoteStatus, GaNoteType


class GaNote(Base):
    __tablename__ = "ga_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    note_type: Mapped[GaNoteType] = mapped_column(
        Enum(GaNoteType, name="ga_note_type"), nullable=False, server_default="GA"
    )
    status: Mapped[GaNoteStatus] = mapped_column(
        Enum(GaNoteStatus, name="ga_note_status"), nullable=False, server_default="OPEN"
    )
    priority: Mapped[GaNotePriority | None] = mapped_column(Enum(GaNotePriority, name="ga_note_priority"))

    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_converted_to_task: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

