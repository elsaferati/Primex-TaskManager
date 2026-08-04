from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common_entry import CommonEntry
from app.models.enums import CommonCategory
from app.models.user import User
from app.services.common_leave import parse_common_view_annual_leave


@dataclass(frozen=True)
class CommonLeaveCoverage:
    days: frozenset[date]
    entry_ids: tuple[uuid.UUID, ...]


def build_common_leave_coverage(
    entries: Iterable[CommonEntry],
    *,
    user_ids: set[uuid.UUID],
    start_date: date,
    end_date: date,
) -> dict[uuid.UUID, CommonLeaveCoverage]:
    """Mirror Common View PV/FEST ranges for full-day realization exclusions."""
    days_by_user: dict[uuid.UUID, set[date]] = defaultdict(set)
    entries_by_user: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for entry in entries:
        leave_start, leave_end, full_day, _, _, _, is_all_users = (
            parse_common_view_annual_leave(entry)
        )
        if not full_day or leave_end < start_date or leave_start > end_date:
            continue
        impacted_users = (
            user_ids
            if is_all_users
            else {entry.assigned_to_user_id or entry.created_by_user_id} & user_ids
        )
        current = max(start_date, leave_start)
        last = min(end_date, leave_end)
        covered_days: set[date] = set()
        while current <= last:
            covered_days.add(current)
            current += timedelta(days=1)
        for user_id in impacted_users:
            days_by_user[user_id].update(covered_days)
            entries_by_user[user_id].add(entry.id)
    return {
        user_id: CommonLeaveCoverage(
            days=frozenset(days),
            entry_ids=tuple(sorted(entries_by_user[user_id], key=str)),
        )
        for user_id, days in days_by_user.items()
    }


async def load_active_users_and_common_leave(
    db: AsyncSession,
    *,
    department_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> tuple[list[User], dict[uuid.UUID, CommonLeaveCoverage]]:
    active_users = (
        await db.execute(
            select(User)
            .where(
                User.department_id == department_id,
                User.is_active.is_(True),
            )
            .order_by(User.full_name.asc(), User.id.asc())
        )
    ).scalars().all()
    user_ids = {user.id for user in active_users}
    if not user_ids:
        return active_users, {}

    # Common View intentionally shows annual-leave entries regardless of approval
    # state, so realization uses the same source and interpretation.
    entries = (
        await db.execute(
            select(CommonEntry).where(CommonEntry.category == CommonCategory.annual_leave)
        )
    ).scalars().all()
    coverage = build_common_leave_coverage(
        entries,
        user_ids=user_ids,
        start_date=start_date,
        end_date=end_date,
    )
    return active_users, coverage


def full_period_leave_user_ids(
    coverage: dict[uuid.UUID, CommonLeaveCoverage],
    *,
    working_days: set[date],
) -> set[uuid.UUID]:
    if not working_days:
        return set()
    return {
        user_id
        for user_id, leave in coverage.items()
        if working_days.issubset(leave.days)
    }
