from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

SourceType = Literal["WEBSITE", "RSS", "LINKEDIN", "FACEBOOK", "API", "OTHER"]
SourceStatus = Literal["ACTIVE", "PAUSED"]
SourcePriority = Literal["HIGH", "NORMAL", "LOW"]
NewsCategory = Literal["NEWS", "GRANT", "TENDER", "EVENT", "BUSINESS", "TECHNOLOGY", "REGULATION", "PARTNERSHIP"]
SourceCategory = Literal["Grants", "Tenders", "Funding", "Business", "Events", "Technology", "Regulations", "Partnerships", "General News"]


class NewsSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2000)
    type: SourceType
    status: SourceStatus = "ACTIVE"
    priority: SourcePriority = "NORMAL"
    categories: list[SourceCategory] = Field(default_factory=list, max_length=9)
    ai_instructions: str | None = Field(default=None, max_length=4000)
    fetch_interval_minutes: int = Field(default=60, ge=5, le=10080)

    @field_validator("name", "url")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field cannot be empty")
        return value

    @field_validator("url")
    @classmethod
    def valid_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Enter a valid http or https URL without credentials")
        return value


class NewsSourceUpdate(NewsSourceCreate):
    pass


class NewsSourceOut(NewsSourceCreate):
    id: uuid.UUID
    last_checked_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StructuredNewsAnalysis(BaseModel):
    """Contract for future server-side AI analysis output."""

    summary: str
    category: NewsCategory
    importanceScore: int = Field(ge=0, le=100)
    relevanceScore: int = Field(ge=0, le=100)
    whyItMatters: str | None = None
    deadline: date | None = None
    fundingAmount: str | None = None
    eligibility: str | None = None
    opportunityType: str | None = None
    tags: list[str] = Field(default_factory=list)
