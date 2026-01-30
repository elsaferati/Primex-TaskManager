from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.board import Board
from app.models.common_entry import CommonEntry
from app.models.enums import CommonApprovalStatus, NotificationType, TaskType, UserRole
from app.models.notification import Notification
from app.models.project import Project
from app.models.task import Task
from app.models.task_status import TaskStatus
from app.models.user import User
from app.schemas.common_entry import (
    CommonEntryApprove,
    CommonEntryAssign,
    CommonEntryCreate,
    CommonEntryOut,
    CommonEntryReject,
)
from app.services.audit import add_audit_log
from app.services.notifications import add_notification, publish_notification


router = APIRouter()


def _to_out(e: CommonEntry) -> CommonEntryOut:
    return CommonEntryOut(
        id=e.id,
        category=e.category,
        title=e.title,
        description=e.description,
        entry_date=e.entry_date,
        created_by_user_id=e.created_by_user_id,
        assigned_to_user_id=e.assigned_to_user_id,
        approval_status=e.approval_status,
        approved_by_user_id=e.approved_by_user_id,
        approved_at=e.approved_at,
        rejected_by_user_id=e.rejected_by_user_id,
        rejected_at=e.rejected_at,
        rejection_reason=e.rejection_reason,
        generated_task_id=e.generated_task_id,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


@router.get("", response_model=list[CommonEntryOut])
async def list_entries(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> list[CommonEntryOut]:
    stmt = select(CommonEntry).order_by(CommonEntry.created_at.desc())
    entries = (await db.execute(stmt)).scalars().all()
    return [_to_out(e) for e in entries]


@router.post("", response_model=CommonEntryOut)
async def create_entry(
    payload: CommonEntryCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> CommonEntryOut:
    # Validate assigned user if provided
    assigned_to_user_id = payload.assigned_to_user_id
    if assigned_to_user_id is not None:
        assigned_user = (await db.execute(select(User).where(User.id == assigned_to_user_id))).scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
    
    entry = CommonEntry(
        category=payload.category,
        title=payload.title,
        description=payload.description,
        entry_date=payload.entry_date,
        created_by_user_id=user.id,
        assigned_to_user_id=assigned_to_user_id,
        approval_status=CommonApprovalStatus.pending,
    )
    db.add(entry)
    await db.flush()

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="common_entry",
        entity_id=entry.id,
        action="created",
        after={"category": entry.category.value, "title": entry.title, "assigned_to_user_id": str(assigned_to_user_id) if assigned_to_user_id else None},
    )

    # Send notification to assigned user if entry is created for someone else
    created_notifications: list[Notification] = []
    if assigned_to_user_id is not None and assigned_to_user_id != user.id:
        created_notifications.append(
            add_notification(
                db=db,
                user_id=assigned_to_user_id,
                type=NotificationType.assignment,
                title="Common entry assigned",
                body=entry.title,
                data={"common_entry_id": str(entry.id)},
            )
        )

    await db.commit()
    await db.refresh(entry)

    # Publish notifications
    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    return _to_out(entry)


@router.patch("/{entry_id}/assign", response_model=CommonEntryOut)
async def assign_entry(
    entry_id: uuid.UUID,
    payload: CommonEntryAssign,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> CommonEntryOut:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = (await db.execute(select(CommonEntry).where(CommonEntry.id == entry_id))).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    before = {"assigned_to_user_id": str(entry.assigned_to_user_id) if entry.assigned_to_user_id else None}
    entry.assigned_to_user_id = payload.assigned_to_user_id
    after = {"assigned_to_user_id": str(entry.assigned_to_user_id) if entry.assigned_to_user_id else None}

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="common_entry",
        entity_id=entry.id,
        action="assigned",
        before=before,
        after=after,
    )

    created_notifications: list[Notification] = []
    if payload.assigned_to_user_id is not None:
        target = (await db.execute(select(User).where(User.id == payload.assigned_to_user_id))).scalar_one_or_none()
        if target:
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=target.id,
                    type=NotificationType.assignment,
                    title="Common entry assigned",
                    body=entry.title,
                    data={"common_entry_id": str(entry.id)},
                )
            )

    await db.commit()
    await db.refresh(entry)

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    return _to_out(entry)


@router.post("/{entry_id}/approve", response_model=CommonEntryOut)
async def approve_entry(
    entry_id: uuid.UUID,
    payload: CommonEntryApprove,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> CommonEntryOut:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = (await db.execute(select(CommonEntry).where(CommonEntry.id == entry_id))).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if entry.approval_status != CommonApprovalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entry already processed")

    created_notifications: list[Notification] = []

    entry.approval_status = CommonApprovalStatus.approved
    entry.approved_by_user_id = user.id
    entry.approved_at = datetime.now(timezone.utc)

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="common_entry",
        entity_id=entry.id,
        action="approved",
        after={"approved_at": entry.approved_at.isoformat()},
    )

    if payload.create_task:
        if payload.project_id is None or payload.status_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_id and status_id required")

        project = (await db.execute(select(Project).where(Project.id == payload.project_id))).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        board = (await db.execute(select(Board).where(Board.id == project.board_id))).scalar_one_or_none()
        if board is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")

        status_row = (
            await db.execute(
                select(TaskStatus).where(TaskStatus.id == payload.status_id, TaskStatus.department_id == board.department_id)
            )
        ).scalar_one_or_none()
        if status_row is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

        assigned_to = payload.assigned_to_user_id or entry.assigned_to_user_id
        if assigned_to is not None:
            assigned_user = (await db.execute(select(User).where(User.id == assigned_to))).scalar_one_or_none()
            if assigned_user is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user not found")
            if assigned_user.department_id != board.department_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be in department")

        task = Task(
            department_id=board.department_id,
            board_id=board.id,
            project_id=project.id,
            title=entry.title,
            description=entry.description,
            task_type=TaskType.adhoc,
            status_id=payload.status_id,
            position=0,
            assigned_to_user_id=assigned_to,
            created_by_user_id=user.id,
        )
        db.add(task)
        await db.flush()
        entry.generated_task_id = task.id

        add_audit_log(
            db=db,
            actor_user_id=user.id,
            entity_type="task",
            entity_id=task.id,
            action="created_from_common_entry",
            after={"common_entry_id": str(entry.id)},
        )

        if assigned_to is not None:
            created_notifications.append(
                add_notification(
                    db=db,
                    user_id=assigned_to,
                    type=NotificationType.assignment,
                    title="Task assigned",
                    body=task.title,
                    data={"task_id": str(task.id)},
                )
            )

    await db.commit()
    await db.refresh(entry)

    for n in created_notifications:
        try:
            await publish_notification(user_id=n.user_id, notification=n)
        except Exception:
            pass

    return _to_out(entry)


@router.post("/{entry_id}/reject", response_model=CommonEntryOut)
async def reject_entry(
    entry_id: uuid.UUID,
    payload: CommonEntryReject,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> CommonEntryOut:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = (await db.execute(select(CommonEntry).where(CommonEntry.id == entry_id))).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if entry.approval_status != CommonApprovalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entry already processed")

    entry.approval_status = CommonApprovalStatus.rejected
    entry.rejected_by_user_id = user.id
    entry.rejected_at = datetime.now(timezone.utc)
    entry.rejection_reason = payload.reason

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="common_entry",
        entity_id=entry.id,
        action="rejected",
        after={"reason": payload.reason},
    )

    await db.commit()
    await db.refresh(entry)
    return _to_out(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = (await db.execute(select(CommonEntry).where(CommonEntry.id == entry_id))).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    add_audit_log(
        db=db,
        actor_user_id=user.id,
        entity_type="common_entry",
        entity_id=entry.id,
        action="deleted",
        before={"category": entry.category.value, "title": entry.title},
    )

    await db.delete(entry)
    await db.commit()
    return None

