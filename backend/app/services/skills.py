from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from app.models.enums import SkillRating
from app.schemas.skills import SKILL_FIELDS


RATING_WEIGHTS = {
    SkillRating.A_PLUS: 4,
    SkillRating.A: 3,
    SkillRating.B: 2,
    SkillRating.C: 1,
}


def completed_skill_count(profile: object | None) -> int:
    return sum(getattr(profile, field, None) is not None for field in SKILL_FIELDS)


def update_completion(profile: object, now: datetime | None = None) -> None:
    """Record first completion and preserve it across later complete edits."""
    if completed_skill_count(profile) == len(SKILL_FIELDS):
        if getattr(profile, "completed_at", None) is None:
            profile.completed_at = now or datetime.now(timezone.utc)
    else:
        profile.completed_at = None


def rank_profiles(profiles: Iterable[object], category: str) -> list[object]:
    if category not in SKILL_FIELDS:
        raise ValueError("Unknown skill category")
    eligible = [profile for profile in profiles if getattr(profile, category, None) is not None]
    return sorted(
        eligible,
        key=lambda profile: (
            -RATING_WEIGHTS[getattr(profile, category)],
            (getattr(getattr(profile, "user", None), "full_name", "") or "").casefold(),
            str(getattr(profile, "user_id", "")),
        ),
    )
