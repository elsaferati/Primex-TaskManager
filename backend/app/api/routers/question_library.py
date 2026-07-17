from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin, require_manager_or_admin
from app.db import get_db
from app.models.enums import UserRole
from app.models.question_library import (
    QuestionCategory,
    QuestionDefinition,
    QuestionStatusEvent,
    QuestionUserStatus,
)
from app.models.user import User
from app.schemas.question_library import (
    QuestionCategoryCreate,
    QuestionCategoryOut,
    QuestionCategoryUpdate,
    QuestionDefinitionCreate,
    QuestionDefinitionOut,
    QuestionDefinitionUpdate,
    QuestionStatusHistoryOut,
    QuestionStatusSummary,
    QuestionStatusUpdate,
)


router = APIRouter()


def can_manage_question_library(role: UserRole) -> bool:
    return role in (UserRole.ADMIN, UserRole.MANAGER)


def visible_status_owner_id(role: UserRole, current_user_id: uuid.UUID) -> uuid.UUID | None:
    return None if can_manage_question_library(role) else current_user_id


def _clean_required(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Value cannot be empty")
    return cleaned


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def _category_or_404(db: AsyncSession, category_id: uuid.UUID) -> QuestionCategory:
    category = await db.get(QuestionCategory, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question category not found")
    return category


async def _question_or_404(db: AsyncSession, question_id: uuid.UUID) -> QuestionDefinition:
    question = await db.get(QuestionDefinition, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return question


async def _question_out(
    db: AsyncSession,
    question: QuestionDefinition,
    current_user: User,
) -> QuestionDefinitionOut:
    owner_id = visible_status_owner_id(current_user.role, current_user.id)
    stmt = (
        select(QuestionUserStatus, User.full_name)
        .join(User, User.id == QuestionUserStatus.user_id)
        .where(QuestionUserStatus.question_id == question.id)
        .order_by(User.full_name, QuestionUserStatus.updated_at.desc())
    )
    if owner_id is not None:
        stmt = stmt.where(QuestionUserStatus.user_id == owner_id)
    status_rows = (await db.execute(stmt)).all()
    summaries = [
        QuestionStatusSummary(
            user_id=status_row.user_id,
            full_name=full_name,
            status=status_row.status,
            updated_at=status_row.updated_at,
        )
        for status_row, full_name in status_rows
    ]
    own = next((item.status for item in summaries if item.user_id == current_user.id), None)
    if own is None and owner_id is None:
        own_status = await db.scalar(
            select(QuestionUserStatus.status).where(
                QuestionUserStatus.question_id == question.id,
                QuestionUserStatus.user_id == current_user.id,
            )
        )
        own = own_status
    return QuestionDefinitionOut(
        id=question.id,
        category_id=question.category_id,
        text=question.text,
        guidance=question.guidance,
        sort_order=question.sort_order,
        current_user_status=own,
        statuses=summaries,
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


def _question_out_from_summaries(
    question: QuestionDefinition,
    summaries: list[QuestionStatusSummary],
    current_user_id: uuid.UUID,
) -> QuestionDefinitionOut:
    return QuestionDefinitionOut(
        id=question.id,
        category_id=question.category_id,
        text=question.text,
        guidance=question.guidance,
        sort_order=question.sort_order,
        current_user_status=next(
            (item.status for item in summaries if item.user_id == current_user_id),
            None,
        ),
        statuses=summaries,
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


@router.get("", response_model=list[QuestionCategoryOut])
async def list_question_library(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[QuestionCategoryOut]:
    categories = (
        await db.execute(select(QuestionCategory).order_by(QuestionCategory.sort_order, QuestionCategory.name))
    ).scalars().all()
    questions = (
        await db.execute(
            select(QuestionDefinition).order_by(
                QuestionDefinition.category_id,
                QuestionDefinition.sort_order,
                QuestionDefinition.created_at,
            )
        )
    ).scalars().all()
    by_category: dict[uuid.UUID, list[QuestionDefinition]] = {}
    for question in questions:
        by_category.setdefault(question.category_id, []).append(question)

    statuses_by_question: dict[uuid.UUID, list[QuestionStatusSummary]] = {}
    if questions:
        owner_id = visible_status_owner_id(current_user.role, current_user.id)
        status_stmt = (
            select(QuestionUserStatus, User.full_name)
            .join(User, User.id == QuestionUserStatus.user_id)
            .where(QuestionUserStatus.question_id.in_([item.id for item in questions]))
            .order_by(User.full_name, QuestionUserStatus.updated_at.desc())
        )
        if owner_id is not None:
            status_stmt = status_stmt.where(QuestionUserStatus.user_id == owner_id)
        for status_row, full_name in (await db.execute(status_stmt)).all():
            statuses_by_question.setdefault(status_row.question_id, []).append(
                QuestionStatusSummary(
                    user_id=status_row.user_id,
                    full_name=full_name,
                    status=status_row.status,
                    updated_at=status_row.updated_at,
                )
            )

    output: list[QuestionCategoryOut] = []
    for category in categories:
        question_output = [
            _question_out_from_summaries(
                item,
                statuses_by_question.get(item.id, []),
                current_user.id,
            )
            for item in by_category.get(category.id, [])
        ]
        output.append(
            QuestionCategoryOut(
                id=category.id,
                name=category.name,
                sort_order=category.sort_order,
                questions=question_output,
                created_at=category.created_at,
                updated_at=category.updated_at,
            )
        )
    return output


@router.post("/categories", response_model=QuestionCategoryOut, status_code=status.HTTP_201_CREATED)
async def create_question_category(
    payload: QuestionCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuestionCategoryOut:
    name = _clean_required(payload.name)
    normalized_name = name.casefold()
    existing = await db.scalar(select(QuestionCategory.id).where(QuestionCategory.normalized_name == normalized_name))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A category with this name already exists")
    next_order = (await db.scalar(select(func.coalesce(func.max(QuestionCategory.sort_order), -1)))) + 1
    category = QuestionCategory(
        name=name,
        normalized_name=normalized_name,
        sort_order=next_order,
        created_by_user_id=current_user.id,
    )
    db.add(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A category with this name already exists")
    await db.refresh(category)
    return QuestionCategoryOut(
        id=category.id,
        name=category.name,
        sort_order=category.sort_order,
        questions=[],
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.patch("/categories/{category_id}", response_model=QuestionCategoryOut)
async def update_question_category(
    category_id: uuid.UUID,
    payload: QuestionCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuestionCategoryOut:
    category = await _category_or_404(db, category_id)
    name = _clean_required(payload.name)
    normalized_name = name.casefold()
    duplicate = await db.scalar(
        select(QuestionCategory.id).where(
            QuestionCategory.normalized_name == normalized_name,
            QuestionCategory.id != category_id,
        )
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A category with this name already exists")
    category.name = name
    category.normalized_name = normalized_name
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A category with this name already exists")
    await db.refresh(category)
    questions = (
        await db.execute(
            select(QuestionDefinition)
            .where(QuestionDefinition.category_id == category.id)
            .order_by(QuestionDefinition.sort_order, QuestionDefinition.created_at)
        )
    ).scalars().all()
    return QuestionCategoryOut(
        id=category.id,
        name=category.name,
        sort_order=category.sort_order,
        questions=[await _question_out(db, item, current_user) for item in questions],
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_question_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> Response:
    category = await _category_or_404(db, category_id)
    await db.delete(category)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/categories/{category_id}/questions",
    response_model=QuestionDefinitionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_question_definition(
    category_id: uuid.UUID,
    payload: QuestionDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuestionDefinitionOut:
    await _category_or_404(db, category_id)
    next_order = (
        await db.scalar(
            select(func.coalesce(func.max(QuestionDefinition.sort_order), -1)).where(
                QuestionDefinition.category_id == category_id
            )
        )
    ) + 1
    question = QuestionDefinition(
        category_id=category_id,
        text=_clean_required(payload.text),
        guidance=_clean_optional(payload.guidance),
        sort_order=next_order,
        created_by_user_id=current_user.id,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return await _question_out(db, question, current_user)


@router.patch("/questions/{question_id}", response_model=QuestionDefinitionOut)
async def update_question_definition(
    question_id: uuid.UUID,
    payload: QuestionDefinitionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuestionDefinitionOut:
    question = await _question_or_404(db, question_id)
    siblings = (
        await db.execute(
            select(QuestionDefinition)
            .where(QuestionDefinition.category_id == question.category_id)
            .order_by(QuestionDefinition.sort_order, QuestionDefinition.created_at)
        )
    ).scalars().all()
    current_index = next((index for index, item in enumerate(siblings) if item.id == question.id), None)
    target_index = min(max(payload.sort_order, 0), len(siblings) - 1)
    if current_index is not None and current_index != target_index:
        siblings[current_index].sort_order, siblings[target_index].sort_order = (
            siblings[target_index].sort_order,
            siblings[current_index].sort_order,
        )
    question.text = _clean_required(payload.text)
    question.guidance = _clean_optional(payload.guidance)
    await db.commit()
    await db.refresh(question)
    return await _question_out(db, question, current_user)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_question_definition(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> Response:
    question = await _question_or_404(db, question_id)
    category_id = question.category_id
    await db.delete(question)
    await db.flush()
    remaining = (
        await db.execute(
            select(QuestionDefinition)
            .where(QuestionDefinition.category_id == category_id)
            .order_by(QuestionDefinition.sort_order, QuestionDefinition.created_at)
        )
    ).scalars().all()
    for index, item in enumerate(remaining):
        item.sort_order = index
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/questions/{question_id}/status", response_model=QuestionStatusSummary | None)
async def update_own_question_status(
    question_id: uuid.UUID,
    payload: QuestionStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuestionStatusSummary | None:
    await _question_or_404(db, question_id)
    current = await db.scalar(
        select(QuestionUserStatus).where(
            QuestionUserStatus.question_id == question_id,
            QuestionUserStatus.user_id == current_user.id,
        )
    )
    if (current.status if current else None) == payload.status:
        if current is None:
            return None
        return QuestionStatusSummary(
            user_id=current_user.id,
            full_name=current_user.full_name,
            status=current.status,
            updated_at=current.updated_at,
        )

    if payload.status is None:
        if current is not None:
            await db.delete(current)
    elif current is None:
        current = QuestionUserStatus(
            question_id=question_id,
            user_id=current_user.id,
            status=payload.status,
        )
        db.add(current)
    else:
        current.status = payload.status
        current.updated_at = func.now()

    db.add(
        QuestionStatusEvent(
            question_id=question_id,
            user_id=current_user.id,
            user_full_name=current_user.full_name,
            status=payload.status,
        )
    )
    await db.commit()
    if payload.status is None:
        return None
    await db.refresh(current)
    return QuestionStatusSummary(
        user_id=current_user.id,
        full_name=current_user.full_name,
        status=current.status,
        updated_at=current.updated_at,
    )


@router.get("/questions/{question_id}/status-history", response_model=list[QuestionStatusHistoryOut])
async def list_question_status_history(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager_or_admin),
) -> list[QuestionStatusHistoryOut]:
    await _question_or_404(db, question_id)
    events = (
        await db.execute(
            select(QuestionStatusEvent)
            .where(QuestionStatusEvent.question_id == question_id)
            .order_by(QuestionStatusEvent.created_at.desc(), QuestionStatusEvent.id.desc())
        )
    ).scalars().all()
    return [
        QuestionStatusHistoryOut(
            id=item.id,
            user_id=item.user_id,
            full_name=item.user_full_name,
            status=item.status,
            created_at=item.created_at,
        )
        for item in events
    ]
