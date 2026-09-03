from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import SkillRating


class UserTaskPreference(Base):
    __tablename__ = "user_task_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    analysis: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    research: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    problem_solving: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    creativity: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    standards: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    qa: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    management: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    communication: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))
    fast_tasks: Mapped[SkillRating | None] = mapped_column(Enum(SkillRating, name="skill_rating"))

    above_average: Mapped[str | None] = mapped_column(Text)
    experience: Mapped[str | None] = mapped_column(Text)
    development: Mapped[str | None] = mapped_column(Text)
    ideal_projects: Mapped[str | None] = mapped_column(Text)
    motivation: Mapped[str | None] = mapped_column(Text)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", lazy="joined")
