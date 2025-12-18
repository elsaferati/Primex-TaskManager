from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.task_status import TaskStatus
from app.schemas.task_status import TaskStatusOut


router = APIRouter()


@router.get("", response_model=list[TaskStatusOut])
async def list_task_statuses(
    department_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[TaskStatusOut]:
    if department_id is None:
        if user.role.value != "admin":
            if user.department_id is None:
                return []
            department_id = user.department_id
    else:
        ensure_department_access(user, department_id)

    stmt = select(TaskStatus)
    if department_id is not None:
        stmt = stmt.where(TaskStatus.department_id == department_id)
    statuses = (await db.execute(stmt.order_by(TaskStatus.position))).scalars().all()
    return [
        TaskStatusOut(
            id=s.id, department_id=s.department_id, name=s.name, position=s.position, is_done=s.is_done
        )
        for s in statuses
    ]

