from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.common_entry import CommonEntry
from app.models.enums import UserRole
from app.models.task import Task
from app.models.task_template import TaskTemplate
from app.schemas.audit_log import AuditLogOut


router = APIRouter()


def _to_out(a: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=a.id,
        actor_user_id=a.actor_user_id,
        entity_type=a.entity_type,
        entity_id=a.entity_id,
        action=a.action,
        before=a.before,
        after=a.after,
        created_at=a.created_at,
    )


async def _assert_entity_access(db: AsyncSession, user, entity_type: str, entity_id: uuid.UUID) -> None:
    if user.role == UserRole.admin:
        return

    if entity_type == "task":
        task = (await db.execute(select(Task).where(Task.id == entity_id))).scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        if user.department_id != task.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if user.role == UserRole.staff and task.assigned_to_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return

    if entity_type == "task_template":
        tmpl = (await db.execute(select(TaskTemplate).where(TaskTemplate.id == entity_id))).scalar_one_or_none()
        if tmpl is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        if user.department_id != tmpl.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return

    if entity_type == "common_entry":
        entry = (await db.execute(select(CommonEntry).where(CommonEntry.id == entity_id))).scalar_one_or_none()
        if entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
        if user.role == UserRole.staff and entry.created_by_user_id != user.id and entry.assigned_to_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AuditLogOut]:
    if user.role == UserRole.staff and (entity_type is None or entity_id is None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)

    if entity_type and entity_id:
        await _assert_entity_access(db, user, entity_type, entity_id)

    rows = (await db.execute(stmt.limit(max(1, min(limit, 500))))).scalars().all()
    if user.role != UserRole.admin and (entity_type is None or entity_id is None):
        # Managers can browse common entries + their department tasks/templates only.
        filtered: list[AuditLog] = []
        for row in rows:
            try:
                await _assert_entity_access(db, user, row.entity_type, row.entity_id)
                filtered.append(row)
            except HTTPException:
                continue
        rows = filtered

    return [_to_out(a) for a in rows]

