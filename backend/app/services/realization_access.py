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
    # MANAGER is intentionally not scoped to their own department here:
    # every department manager (Development/Product Content/Graphic Design)
    # needs to see and manage Realization for all three departments.
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def can_view_department_aggregate(
    user: RealizationUser, *, department_id: uuid.UUID
) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def can_view_observation(
    user: RealizationUser,
    *,
    subject_user_id: uuid.UUID | None,
    department_id: uuid.UUID | None,
    visibility: RealizationObservationVisibility,
) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def can_review_realization(user: RealizationUser, *, department_id: uuid.UUID | None) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def can_approve_realization(user: RealizationUser) -> bool:
    return user.role is UserRole.ADMIN


def can_lock_realization(user: RealizationUser) -> bool:
    return user.role is UserRole.ADMIN
