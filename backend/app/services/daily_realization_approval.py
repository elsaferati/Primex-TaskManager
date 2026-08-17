from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.realization import (
    RealizationDailyApprovalEvent,
    RealizationDailyCloseEvent,
    RealizationPeriod,
)


async def latest_daily_close(
    db: AsyncSession, *, period_id: uuid.UUID, user_id: uuid.UUID
) -> RealizationDailyCloseEvent | None:
    return (await db.execute(
        select(RealizationDailyCloseEvent)
        .where(
            RealizationDailyCloseEvent.period_id == period_id,
            RealizationDailyCloseEvent.user_id == user_id,
        )
        .order_by(RealizationDailyCloseEvent.created_at.desc(), RealizationDailyCloseEvent.id.desc())
        .limit(1)
    )).scalar_one_or_none()


async def latest_daily_approval(
    db: AsyncSession, *, period_id: uuid.UUID, user_id: uuid.UUID
) -> RealizationDailyApprovalEvent | None:
    return (await db.execute(
        select(RealizationDailyApprovalEvent)
        .where(
            RealizationDailyApprovalEvent.period_id == period_id,
            RealizationDailyApprovalEvent.user_id == user_id,
        )
        .order_by(RealizationDailyApprovalEvent.created_at.desc(), RealizationDailyApprovalEvent.id.desc())
        .limit(1)
    )).scalar_one_or_none()


def approval_state_from_events(
    approval: RealizationDailyApprovalEvent | None,
    close_event: RealizationDailyCloseEvent | None,
    *,
    personal_close_status: str,
) -> dict:
    if approval is None:
        status = "PENDING"
    elif approval.action == "REVOKE":
        status = "REVOKED"
    elif (
        close_event is None
        or close_event.action not in {"CLOSE", "CORRECT"}
        or approval.source_close_event_id != close_event.id
        or personal_close_status != "SAVED"
    ):
        status = "STALE"
    else:
        status = "APPROVED"
    return {
        "status": status,
        "approval_id": str(approval.id) if approval else None,
        "action": approval.action if approval else None,
        "approved_by": str(approval.actor_user_id) if approval and approval.action == "APPROVE" else None,
        "approved_at": approval.created_at.isoformat() if approval and approval.action == "APPROVE" else None,
        "approval_comment": approval.approval_comment if approval else None,
        "reason": approval.reason if approval else None,
        "source_close_event_id": str(approval.source_close_event_id) if approval and approval.source_close_event_id else None,
    }


async def daily_approval_state(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    day: date,
    personal_close_status: str,
) -> dict:
    period = (await db.execute(
        select(RealizationPeriod)
        .where(
            RealizationPeriod.period_type == "DAILY",
            RealizationPeriod.start_date == day,
            RealizationPeriod.end_date == day,
            RealizationPeriod.department_id.is_not(None),
        )
        .join(RealizationDailyCloseEvent, RealizationDailyCloseEvent.period_id == RealizationPeriod.id)
        .where(RealizationDailyCloseEvent.user_id == user_id)
        .order_by(RealizationPeriod.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    if period is None:
        return approval_state_from_events(None, None, personal_close_status=personal_close_status)
    close_event = await latest_daily_close(db, period_id=period.id, user_id=user_id)
    approval = await latest_daily_approval(db, period_id=period.id, user_id=user_id)
    return approval_state_from_events(
        approval, close_event, personal_close_status=personal_close_status
    )
