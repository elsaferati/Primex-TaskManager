from __future__ import annotations

import uuid
from datetime import datetime, date

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class NewsSource(Base):
    __tablename__ = "intelligence_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    type: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default="ACTIVE")
    priority: Mapped[str] = mapped_column(String(12), nullable=False, server_default="NORMAL")
    categories: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    ai_instructions: Mapped[str | None] = mapped_column(Text)
    fetch_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="60")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_snapshot_id: Mapped[str | None] = mapped_column(String(80))
    last_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class NewsItem(Base):
    __tablename__ = "intelligence_items"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_intelligence_items_source_external"),
        UniqueConstraint("source_id", "content_hash", name="uq_intelligence_items_source_hash"),
        Index("ix_intelligence_items_published_at", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("intelligence_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    external_id: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    original_text: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    image_url: Mapped[str | None] = mapped_column(String(2000))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class NewsAnalysis(Base):
    __tablename__ = "intelligence_analyses"

    news_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("intelligence_items.id", ondelete="CASCADE"), primary_key=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    importance_score: Mapped[int] = mapped_column(Integer, nullable=False)
    relevance_score: Mapped[int] = mapped_column(Integer, nullable=False)
    why_it_matters: Mapped[str | None] = mapped_column(Text)
    deadline: Mapped[date | None] = mapped_column(Date)
    funding_amount: Mapped[str | None] = mapped_column(String(160))
    eligibility: Mapped[str | None] = mapped_column(Text)
    opportunity_type: Mapped[str | None] = mapped_column(String(40))
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class NewsUserState(Base):
    __tablename__ = "intelligence_user_states"
    __table_args__ = (Index("ix_intelligence_user_states_saved", "user_id", "saved_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    news_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("intelligence_items.id", ondelete="CASCADE"), primary_key=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
