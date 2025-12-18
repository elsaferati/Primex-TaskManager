from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.enums import UserRole
from app.models.task import Task
from app.schemas.planner import (
    MonthlyPlannerResponse,
    MonthlyPlannerSummary,
    WeeklyPlannerDay,
    WeeklyPlannerResponse,
)
from app.schemas.task import TaskOut


router = APIRouter()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _month_range(year: int, month: int) -> tuple[date, date]:
    month_start = date(year, month, 1)
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    return month_start, next_month - timedelta(days=1)


def _task_to_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        department_id=t.department_id,
        board_id=t.board_id,
        project_id=t.project_id,
        title=t.title,
        description=t.description,
        task_type=t.task_type,
        status_id=t.status_id,
        position=t.position,
        assigned_to_user_id=t.assigned_to_user_id,
        planned_for=t.planned_for,
        is_carried_over=t.is_carried_over,
        carried_over_from=t.carried_over_from,
        is_milestone=t.is_milestone,
        reminder_enabled=t.reminder_enabled,
        next_reminder_at=t.next_reminder_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
        completed_at=t.completed_at,
    )


@router.get("/weekly", response_model=WeeklyPlannerResponse)
async def weekly_planner(
    week_start: date | None = None,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> WeeklyPlannerResponse:
    today = datetime.now(timezone.utc).date()
    week_start_date = week_start or _week_start(today)
    week_end = week_start_date + timedelta(days=6)

    if user.role == UserRole.staff:
        user_id = user.id
        department_id = user.department_id

    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role != UserRole.admin:
        department_id = user.department_id

    stmt = select(Task).where(Task.completed_at.is_(None))
    if department_id is not None:
        stmt = stmt.where(Task.department_id == department_id)
    if user_id is not None:
        stmt = stmt.where(Task.assigned_to_user_id == user_id)

    tasks = (await db.execute(stmt.order_by(Task.planned_for.nullsfirst(), Task.created_at))).scalars().all()

    overdue = [_task_to_out(t) for t in tasks if t.planned_for is not None and t.planned_for < week_start_date]

    days: list[WeeklyPlannerDay] = []
    for i in range(7):
        d = week_start_date + timedelta(days=i)
        day_tasks = [_task_to_out(t) for t in tasks if t.planned_for == d]
        if i == 0:
            day_tasks.extend([_task_to_out(t) for t in tasks if t.planned_for is None])
        days.append(WeeklyPlannerDay(date=d, tasks=day_tasks))

    return WeeklyPlannerResponse(week_start=week_start_date, week_end=week_end, overdue=overdue, days=days)


@router.get("/monthly", response_model=MonthlyPlannerResponse)
async def monthly_planner(
    year: int,
    month: int,
    department_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> MonthlyPlannerResponse:
    if user.role == UserRole.staff:
        user_id = user.id
        department_id = user.department_id

    if department_id is not None:
        ensure_department_access(user, department_id)
    elif user.role != UserRole.admin:
        department_id = user.department_id

    month_start, month_end = _month_range(year, month)

    stmt = select(Task).where(Task.planned_for.is_not(None), Task.planned_for >= month_start, Task.planned_for <= month_end)
    if department_id is not None:
        stmt = stmt.where(Task.department_id == department_id)
    if user_id is not None:
        stmt = stmt.where(Task.assigned_to_user_id == user_id)

    tasks = (await db.execute(stmt.order_by(Task.planned_for, Task.created_at))).scalars().all()
    task_out = [_task_to_out(t) for t in tasks]

    milestones = [t for t in task_out if t.is_milestone]
    recurring = [t for t in task_out if t.task_type.value == "system"]

    prev_month = month - 1
    prev_year = year
    if prev_month == 0:
        prev_month = 12
        prev_year -= 1
    prev_start, prev_end = _month_range(prev_year, prev_month)

    base_filters = [Task.planned_for.is_not(None)]
    if department_id is not None:
        base_filters.append(Task.department_id == department_id)
    if user_id is not None:
        base_filters.append(Task.assigned_to_user_id == user_id)

    month_completed = (
        await db.execute(
            select(func.count(Task.id)).where(
                *base_filters,
                Task.planned_for >= month_start,
                Task.planned_for <= month_end,
                Task.completed_at.is_not(None),
            )
        )
    ).scalar_one()
    prev_completed = (
        await db.execute(
            select(func.count(Task.id)).where(
                *base_filters,
                Task.planned_for >= prev_start,
                Task.planned_for <= prev_end,
                Task.completed_at.is_not(None),
            )
        )
    ).scalar_one()

    return MonthlyPlannerResponse(
        month_start=month_start,
        month_end=month_end,
        tasks=task_out,
        milestones=milestones,
        recurring=recurring,
        summary=MonthlyPlannerSummary(month_completed=month_completed, previous_month_completed=prev_completed),
    )

