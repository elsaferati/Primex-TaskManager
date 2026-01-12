from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, text
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.db import Base

class VsWorkflowItem(Base):
    __tablename__ = "vs_workflow_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(String, nullable=True)
    internal_notes = Column(String, nullable=True)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Using plain strings to avoid Enum conflicts
    status = Column(String, nullable=False, server_default="TODO") # TODO, IN_PROGRESS, REVIEW, DONE, CANCELLED
    priority = Column(String, nullable=False, server_default="NORMAL") # NORMAL, HIGH
    
    show_after_minutes = Column(Integer, nullable=False, default=0)
    show_at = Column(DateTime(timezone=True), nullable=False)
    dependency_info = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=text("now()"))
