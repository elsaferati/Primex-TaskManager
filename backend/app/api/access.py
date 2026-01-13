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


def ensure_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")