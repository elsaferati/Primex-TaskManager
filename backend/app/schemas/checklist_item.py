from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, model_validator

from app.models.enums import ChecklistItemType


class ChecklistItemAssigneeOut(BaseModel):
    user_id: uuid.UUID
    user_full_name: str | None = None
    user_username: str | None = None


class ChecklistItemOut(BaseModel):
    id: uuid.UUID
    checklist_id: uuid.UUID | None = None
    item_type: ChecklistItemType
    position: int

    # Common fields
    path: str | None = None
    keyword: str | None = None
    description: str | None = None
    category: str | None = None
    day: str | None = None
    owner: str | None = None
    time: str | None = None

    # Type-specific fields
    title: str | None = None
    comment: str | None = None
    is_checked: bool | None = None

    # Assignees
    assignees: list[ChecklistItemAssigneeOut] = []


class ChecklistItemCreate(BaseModel):
    checklist_id: uuid.UUID | None = None
    item_type: ChecklistItemType
    position: int | None = None

    # Common fields
    path: str | None = None
    keyword: str | None = None
    description: str | None = None
    category: str | None = None
    day: str | None = None
    owner: str | None = None
    time: str | None = None

    # Type-specific fields
    title: str | None = None
    comment: str | None = None
    is_checked: bool | None = None

    # Assignees (user IDs)
    assignee_user_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_type_specific_fields(self) -> "ChecklistItemCreate":
        """Validate that required fields are present based on item_type."""
        if self.item_type == ChecklistItemType.TITLE:
            if not self.title:
                raise ValueError("title is required for TITLE type")
            if self.is_checked is not None:
                raise ValueError("is_checked must be null for TITLE type")
        elif self.item_type == ChecklistItemType.COMMENT:
            if not self.comment:
                raise ValueError("comment is required for COMMENT type")
            if self.is_checked is not None:
                raise ValueError("is_checked must be null for COMMENT type")
        elif self.item_type == ChecklistItemType.CHECKBOX:
            if not self.title:
                raise ValueError("title is required for CHECKBOX type")
            if self.is_checked is None:
                self.is_checked = False  # Default to False if not provided
        return self


class ChecklistItemUpdate(BaseModel):
    item_type: ChecklistItemType | None = None
    position: int | None = None

    # Common fields
    path: str | None = None
    keyword: str | None = None
    description: str | None = None
    category: str | None = None
    day: str | None = None
    owner: str | None = None
    time: str | None = None

    # Type-specific fields
    title: str | None = None
    comment: str | None = None
    is_checked: bool | None = None

    # Assignees (user IDs)
    assignee_user_ids: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def validate_type_specific_fields(self) -> "ChecklistItemUpdate":
        """Validate that fields are consistent with item_type."""
        # If item_type is being updated, validate accordingly
        if self.item_type is not None:
            if self.item_type == ChecklistItemType.TITLE:
                if self.is_checked is not None:
                    raise ValueError("is_checked must be null for TITLE type")
            elif self.item_type == ChecklistItemType.COMMENT:
                if self.is_checked is not None:
                    raise ValueError("is_checked must be null for COMMENT type")
        return self
