from __future__ import annotations

import uuid
from typing import Protocol

from app.models.enums import RealizationObservationVisibility, UserRole


class RealizationUser(Protocol):
    id: uuid.UUID
    role: UserRole
    department_id: uuid.UUID | None


def can_view_person_result(
    user: RealizationUser,
    *,
    subject_user_id: uuid.UUID,
    subject_department_id: uuid.UUID | None,
) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if user.role is UserRole.MANAGER:
        return True
    return user.role is UserRole.STAFF and user.id == subject_user_id


def can_view_department_aggregate(
    user: RealizationUser, *, department_id: uuid.UUID
) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    return user.role is UserRole.MANAGER


def can_view_observation(
    user: RealizationUser,
    *,
    subject_user_id: uuid.UUID | None,
    department_id: uuid.UUID | None,
    visibility: RealizationObservationVisibility,
) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    if user.role is UserRole.MANAGER:
        return True
    return (
        user.role is UserRole.STAFF
        and user.id == subject_user_id
        and visibility is not RealizationObservationVisibility.PRIVATE_MANAGER
    )


def can_review_realization(user: RealizationUser, *, department_id: uuid.UUID | None) -> bool:
    if user.role is UserRole.ADMIN:
        return True
    return user.role is UserRole.MANAGER


def can_approve_realization(user: RealizationUser) -> bool:
    return user.role is UserRole.ADMIN


def can_lock_realization(user: RealizationUser) -> bool:
    return user.role is UserRole.ADMIN
