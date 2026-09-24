"""Contracts for future ingestion and server-side analysis.

No connector runs in the MVP. Implement adapters independently and persist
their output as NewsItem before calling the AI service.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.intelligence.models import NewsSource
from app.intelligence.schemas import StructuredNewsAnalysis


@dataclass(frozen=True)
class CollectedNewsItem:
    external_id: str | None
    url: str
    title: str
    original_text: str | None
    published_at: datetime | None
    image_url: str | None = None


class SourceAdapter(Protocol):
    async def collect(self, source: NewsSource) -> list[CollectedNewsItem]: ...


class NewsAIService(Protocol):
    async def analyze_news_item(self, item: CollectedNewsItem, source: NewsSource) -> StructuredNewsAnalysis: ...
    async def generate_daily_brief(self, analyses: list[StructuredNewsAnalysis]) -> str: ...
