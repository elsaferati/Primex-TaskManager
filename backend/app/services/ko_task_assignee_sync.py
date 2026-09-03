from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department
from app.models.project import Project
from app.models.task_assignee import TaskAssignee
from app.services.daily_report_logic import (
    ko_owner_user_id_for_task,
    ko_rule_applies_for_task,
    normalize_dept_code,
)


async def ensure_ko_user_is_task_assignee(
    db: AsyncSession,
    *,
    task,
    project: Project | None = None,
) -> uuid.UUID | None:
    """
    Make KO the sole owner when the PCM + MST/TT + CONTROL rule applies.

    PRODUCT ownership is available through ``origin_task_id``. Keeping the
    PRODUCT executor on the CONTROL row made generic lists, permissions,
    notifications, reports, and exports treat both people as controllers.

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

    if not ko_rule_applies_for_task(task, project=project, dept_code=dept_code):
        return None

    ko_user_id = ko_owner_user_id_for_task(task, project=project, dept_code=dept_code)
    task.assigned_to = ko_user_id
    await db.execute(delete(TaskAssignee).where(TaskAssignee.task_id == task.id))
    if ko_user_id is not None:
        stmt = pg_insert(TaskAssignee).values(task_id=task.id, user_id=ko_user_id)
        stmt = stmt.on_conflict_do_nothing(index_elements=["task_id", "user_id"])
        await db.execute(stmt)
    return ko_user_id

