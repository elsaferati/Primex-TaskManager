from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department
from app.models.project import Project
from app.models.task_assignee import TaskAssignee
from app.services.daily_report_logic import ko_owner_user_id_for_task, normalize_dept_code


async def ensure_ko_user_is_task_assignee(
    db: AsyncSession,
    *,
    task,
    project: Project | None = None,
) -> uuid.UUID | None:
    """
    Ensure that, when the KO rule applies (PCM + MST/TT + CONTROL),
    the KO user is also present in `task_assignees`.

    This makes KO behave like an assignee/owner across the app (lists, planner, permissions),
    while keeping the KO-driven visibility logic intact.

    Returns the KO user id when inserted/ensured, otherwise None.
    """
    project_id = getattr(task, "project_id", None)
    if project_id is None:
        return None

    if project is None:
        project = (
            await db.execute(select(Project).where(Project.id == project_id))
        ).scalar_one_or_none()
    if project is None or project.department_id is None:
        return None

    dept_code = (
        await db.execute(select(Department.code).where(Department.id == project.department_id))
    ).scalar_one_or_none()
    dept_code = normalize_dept_code(dept_code) if dept_code else ""

    ko_user_id = ko_owner_user_id_for_task(task, project=project, dept_code=dept_code)
    if ko_user_id is None:
        return None

    stmt = pg_insert(TaskAssignee).values(task_id=task.id, user_id=ko_user_id)
    stmt = stmt.on_conflict_do_nothing(index_elements=["task_id", "user_id"])
    await db.execute(stmt)
    return ko_user_id

