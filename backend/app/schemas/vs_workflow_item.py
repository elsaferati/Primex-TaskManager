from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

class VsWorkflowItemBase(BaseModel):
    title: str
    description: Optional[str] = None
    internal_notes: Optional[str] = None
    assigned_to: Optional[UUID] = None
    status: str = "TODO"
    priority: str = "NORMAL"

class VsWorkflowItemUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[UUID] = None
    internal_notes: Optional[str] = None

class VsWorkflowItemOut(VsWorkflowItemBase):
    id: UUID
    project_id: UUID
    show_after_minutes: int
    show_at: datetime
    dependency_info: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
