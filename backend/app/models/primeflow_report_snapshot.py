from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class PrimeFlowReportSnapshot(Base):
    __tablename__ = "primeflow_report_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("primeflow_report_delivery_runs.id", ondelete="CASCADE"), unique=True)
    normalized_report_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    plain_text_body: Mapped[str] = mapped_column(Text, nullable=False)
    html_body: Mapped[str] = mapped_column(Text, nullable=False)
    content_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
