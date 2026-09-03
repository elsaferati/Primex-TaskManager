from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user, require_manager_or_admin
from app.config import settings
from app.db import get_db
from app.models.enums import SkillRating
from app.models.user import User
from app.models.user_task_preference import UserTaskPreference
from app.schemas.skills import (
    SKILL_FIELDS,
    TEXT_FIELDS,
    SkillRecommendation,
    SkillCategoryInferenceOut,
    SkillCategoryInferenceRequest,
    SkillsProfileOut,
    SkillsProfileUpdate,
    TeamSkillsMatrixItem,
)
from app.services.skills import RATING_WEIGHTS, completed_skill_count, rank_profiles, update_completion
from app.services.skill_category_ai import infer_task_skill_category


router = APIRouter()


@router.post("/infer-category", response_model=SkillCategoryInferenceOut)
async def infer_category(
    payload: SkillCategoryInferenceRequest,
    _user: User = Depends(get_current_user),
) -> SkillCategoryInferenceOut:
    if not payload.title.strip() and not payload.description.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title or description is required")
    try:
        result = await infer_task_skill_category(payload.title.strip(), payload.description.strip())
    except (RuntimeError, ValueError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI classification is unavailable") from exc
    return SkillCategoryInferenceOut(**result, model=settings.SKILLS_AI_MODEL)


def _profile_data(profile: UserTaskPreference | None, user: User) -> dict:
    count = completed_skill_count(profile)
    data = {field: getattr(profile, field, None) for field in (*SKILL_FIELDS, *TEXT_FIELDS)}
    return {
        **data,
        "id": getattr(profile, "id", None),
        "user_id": user.id,
        "exists": profile is not None,
        "completed_count": count,
        "is_complete": count == len(SKILL_FIELDS),
        "completed_at": getattr(profile, "completed_at", None),
        "created_at": getattr(profile, "created_at", None),
        "updated_at": getattr(profile, "updated_at", None),
    }


def _matrix_item(profile: UserTaskPreference | None, user: User) -> TeamSkillsMatrixItem:
    return TeamSkillsMatrixItem(
        **_profile_data(profile, user),
        name=user.full_name,
        department_id=user.department_id,
        department=getattr(user.department, "name", None),
    )


async def _find_profile(db: AsyncSession, user_id: uuid.UUID) -> UserTaskPreference | None:
    return (await db.execute(
        select(UserTaskPreference).where(UserTaskPreference.user_id == user_id)
    )).scalar_one_or_none()


@router.get("/me", response_model=SkillsProfileOut)
async def get_my_skills(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> SkillsProfileOut:
    return SkillsProfileOut(**_profile_data(await _find_profile(db, user.id), user))


@router.patch("/me", response_model=SkillsProfileOut)
@router.put("/me", response_model=SkillsProfileOut)
async def update_my_skills(
    payload: SkillsProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SkillsProfileOut:
    profile = await _find_profile(db, user.id)
    if profile is None:
        profile = UserTaskPreference(user_id=user.id)
        db.add(profile)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    update_completion(profile)
    await db.commit()
    await db.refresh(profile)
    return SkillsProfileOut(**_profile_data(profile, user))


@router.get("/matrix", response_model=list[TeamSkillsMatrixItem])
async def get_team_matrix(
    db: AsyncSession = Depends(get_db),
    _manager: User = Depends(require_manager_or_admin),
) -> list[TeamSkillsMatrixItem]:
    rows = (await db.execute(
        select(User, UserTaskPreference)
        .outerjoin(UserTaskPreference, UserTaskPreference.user_id == User.id)
        .options(joinedload(User.department))
        .where(User.is_active.is_(True))
        .order_by(User.full_name, User.id)
    )).all()
    return [_matrix_item(profile, user) for user, profile in rows]


@router.get("/recommendations", response_model=list[SkillRecommendation])
async def get_recommendations(
    category: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[SkillRecommendation]:
    if category not in SKILL_FIELDS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown skill category")
    profiles = (await db.execute(
        select(UserTaskPreference)
        .join(User, User.id == UserTaskPreference.user_id)
        .options(joinedload(UserTaskPreference.user).joinedload(User.department))
        .where(User.is_active.is_(True))
    )).scalars().unique().all()
    ranked = rank_profiles(profiles, category)
    return [
        SkillRecommendation(
            rank=index,
            user_id=profile.user_id,
            name=profile.user.full_name,
            department_id=profile.user.department_id,
            department=getattr(profile.user.department, "name", None),
            category=category,
            rating=getattr(profile, category),
            score=RATING_WEIGHTS[getattr(profile, category)],
        )
        for index, profile in enumerate(ranked, start=1)
    ]


@router.get("/users/{user_id}", response_model=TeamSkillsMatrixItem)
async def get_user_skills(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _manager: User = Depends(require_manager_or_admin),
) -> TeamSkillsMatrixItem:
    user = (await db.execute(
        select(User).options(joinedload(User.department)).where(User.id == user_id, User.is_active.is_(True))
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _matrix_item(await _find_profile(db, user_id), user)
