from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import SkillRating


SKILL_FIELDS = (
    "analysis", "research", "problem_solving", "creativity", "standards",
    "qa", "management", "communication", "fast_tasks",
)
TEXT_FIELDS = ("above_average", "experience", "development", "ideal_projects", "motivation")


class SkillsProfileUpdate(BaseModel):
    analysis: SkillRating | None = None
    research: SkillRating | None = None
    problem_solving: SkillRating | None = None
    creativity: SkillRating | None = None
    standards: SkillRating | None = None
    qa: SkillRating | None = None
    management: SkillRating | None = None
    communication: SkillRating | None = None
    fast_tasks: SkillRating | None = None
    above_average: str | None = Field(default=None, max_length=5000)
    experience: str | None = Field(default=None, max_length=5000)
    development: str | None = Field(default=None, max_length=5000)
    ideal_projects: str | None = Field(default=None, max_length=5000)
    motivation: str | None = Field(default=None, max_length=5000)

    @field_validator(*TEXT_FIELDS)
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        normalized = value.strip() if value is not None else None
        return normalized or None


class SkillsProfileOut(SkillsProfileUpdate):
    id: uuid.UUID | None = None
    user_id: uuid.UUID
    exists: bool
    completed_count: int
    is_complete: bool
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TeamSkillsMatrixItem(SkillsProfileOut):
    name: str
    department_id: uuid.UUID | None = None
    department: str | None = None


class SkillRecommendation(BaseModel):
    rank: int
    user_id: uuid.UUID
    name: str
    department_id: uuid.UUID | None = None
    department: str | None = None
    category: str
    rating: SkillRating
    score: int
