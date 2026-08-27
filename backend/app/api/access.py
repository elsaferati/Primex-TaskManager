from __future__ import annotations

import uuid

from fastapi import HTTPException, status

from app.models.enums import UserRole
from app.models.user import User


def ensure_department_access(user: User, department_id: uuid.UUID) -> None:
    if user.role in (UserRole.ADMIN, UserRole.MANAGER):
        return
    if user.department_id != department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_manager_or_admin(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_reports_access(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_project_creator(user: User) -> None:
    """Allow Admin, Manager, or Staff to create projects."""
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_task_editor(user: User, task: "Task") -> None:
    """Allow every authenticated PrimeFlow user to edit every task."""
    return

def ensure_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


def ensure_meeting_editor(user: User, meeting: "Meeting") -> None:
    """
    Allow editing a meeting when:
      - user is ADMIN or MANAGER
      - or user created the meeting (meeting.created_by)
    """
    from app.models.meeting import Meeting  # local import to avoid circular

    if user.role in (UserRole.ADMIN, UserRole.MANAGER):
        return
    if meeting.created_by and meeting.created_by == user.id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
