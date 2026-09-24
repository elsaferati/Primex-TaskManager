from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

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

    @model_validator(mode="after")
    def valid_linkedin_profile(self) -> "NewsSourceCreate":
        if self.type == "LINKEDIN":
            parsed = urlparse(self.url)
            segments = [part for part in parsed.path.split("/") if part]
            if parsed.hostname not in {"linkedin.com", "www.linkedin.com"} or len(segments) != 2 or segments[0] not in {"in", "company"}:
                raise ValueError("Use a LinkedIn profile or company page URL (linkedin.com/in/... or linkedin.com/company/...).")
        return self


class NewsSourceUpdate(NewsSourceCreate):
    pass


class NewsSourceOut(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    type: SourceType
    status: SourceStatus
    priority: SourcePriority
    categories: list[str]
    ai_instructions: str | None
    fetch_interval_minutes: int
    last_checked_at: datetime | None
    last_started_at: datetime | None
    pending_snapshot_id: str | None
    last_error: str | None
    collection_supported: bool = False
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


class IntelligenceStatusOut(BaseModel):
    linkedinConfigured: bool


class FeedAnalysisOut(BaseModel):
    summary: str
    category: NewsCategory
    importanceScore: int
    relevanceScore: int
    whyItMatters: str | None
    deadline: str | None
    fundingAmount: str | None
    eligibility: str | None
    opportunityType: str | None
    tags: list[str]


class FeedItemOut(BaseModel):
    id: str
    sourceId: str
    sourceName: str
    sourceType: SourceType
    externalId: str | None
    url: str
    title: str
    originalText: str | None
    publishedAt: str
    imageUrl: str | None
    contentHash: str | None
    createdAt: str
    readAt: str | None
    emailedAt: str | None
    location: str | None
    priority: Literal["HIGH", "NORMAL"]
    analysis: FeedAnalysisOut


class NewsFeedOut(BaseModel):
    items: list[FeedItemOut]
    hasLiveSources: bool


class EmailShareOut(BaseModel):
    recipient: str
    sentAt: datetime
    alreadySent: bool


class SourceCheckOut(BaseModel):
    state: Literal["started", "pending", "completed", "error", "unavailable"]
