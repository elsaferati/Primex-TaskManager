from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_department_access, ensure_manager_or_admin
from app.api.deps import get_current_user
from app.db import get_db
from app.models.department import Department
from app.models.enums import UserRole
from app.models.system_task_template import SystemTaskTemplate
from app.models.user import User
from app.schemas.system_task_template import SystemTaskTemplateCreate, SystemTaskTemplateOut


router = APIRouter()


def _template_to_out(template: SystemTaskTemplate) -> SystemTaskTemplateOut:
    return SystemTaskTemplateOut(
        id=template.id,
        title=template.title,
        description=template.description,
        department_id=template.department_id,
        default_assignee_id=template.default_assignee_id,
        frequency=template.frequency,
        day_of_week=template.day_of_week,
        day_of_month=template.day_of_month,
        month_of_year=template.month_of_year,
        is_active=template.is_active,
        created_at=template.created_at,
    )


@router.get("", response_model=list[SystemTaskTemplateOut])
async def list_system_task_templates(
    department_id: uuid.UUID | None = None,
    only_active: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[SystemTaskTemplateOut]:
    stmt = select(SystemTaskTemplate)

    if department_id is not None:
        ensure_department_access(user, department_id)
        stmt = stmt.where(SystemTaskTemplate.department_id == department_id)
    elif user.role != UserRole.ADMIN:
        if user.department_id is None:
            return []
        stmt = stmt.where(SystemTaskTemplate.department_id == user.department_id)

    if only_active:
        stmt = stmt.where(SystemTaskTemplate.is_active.is_(True))

    rows = (await db.execute(stmt.order_by(SystemTaskTemplate.created_at))).scalars().all()
    return [_template_to_out(template) for template in rows]


@router.post("", response_model=SystemTaskTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_system_task_template(
    payload: SystemTaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> SystemTaskTemplateOut:
    ensure_manager_or_admin(user)
    if payload.department_id is not None:
        ensure_department_access(user, payload.department_id)

    if payload.department_id is not None:
        department = (
            await db.execute(select(Department).where(Department.id == payload.department_id))
        ).scalar_one_or_none()
        if department is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    default_assignee: User | None = None
    if payload.default_assignee_id is not None:
        default_assignee = (
            await db.execute(select(User).where(User.id == payload.default_assignee_id))
        ).scalar_one_or_none()
        if default_assignee is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")
        if payload.department_id is not None and default_assignee.department_id != payload.department_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must belong to the selected department",
            )

    template = SystemTaskTemplate(
        title=payload.title,
        description=payload.description,
        department_id=payload.department_id,
        default_assignee_id=payload.default_assignee_id,
        frequency=payload.frequency,
        day_of_week=payload.day_of_week,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
        is_active=payload.is_active if payload.is_active is not None else True,
    )

    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _template_to_out(template)
