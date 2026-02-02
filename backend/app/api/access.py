from __future__ import annotations

import uuid

from fastapi import HTTPException, status

from app.models.enums import UserRole
from app.models.user import User


def ensure_department_access(user: User, department_id: uuid.UUID) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.department_id != department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_manager_or_admin(user: User) -> None:
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_project_creator(user: User) -> None:
    """Allow Admin, Manager, or Staff to create projects."""
    if user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def ensure_task_editor(user: User, task: "Task") -> None:
    """
    Allow editing a task when:
      - user is ADMIN or MANAGER
      - or user created the task (task.created_by)
      - or user is the primary assignee (task.assigned_to)
    """
    from app.models.task import Task  # local import to avoid circular

    if user.role in (UserRole.ADMIN, UserRole.MANAGER):
        return
    if task.created_by and task.created_by == user.id:
        return
    if task.assigned_to and task.assigned_to == user.id:
        return
    # Allow any explicit assignee record (TaskAssignee) as well
    if hasattr(task, "assignees"):
        assignees = getattr(task, "assignees") or []
        if any(ta.user_id == user.id for ta in assignees):
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

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
