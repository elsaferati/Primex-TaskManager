from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ChecklistItemType


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    checklist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE")
    )
    item_type: Mapped[ChecklistItemType] = mapped_column(
        Enum(ChecklistItemType, name="checklist_item_type"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Common fields (all types)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    keyword: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    day: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    time: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Type-specific fields
    title: Mapped[str | None] = mapped_column(Text, nullable=True)  # For TITLE and CHECKBOX
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)  # For COMMENT
    is_checked: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # Only for CHECKBOX

    # Relationships
    checklist: Mapped["Checklist"] = relationship("Checklist", back_populates="items")
    assignees: Mapped[list["ChecklistItemAssignee"]] = relationship(
        "ChecklistItemAssignee", back_populates="checklist_item", cascade="all, delete-orphan"
    )


class ChecklistItemAssignee(Base):
    __tablename__ = "checklist_item_assignees"

    checklist_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("checklist_items.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # Relationships
    checklist_item: Mapped["ChecklistItem"] = relationship("ChecklistItem", back_populates="assignees")
    user: Mapped["User"] = relationship("User")
