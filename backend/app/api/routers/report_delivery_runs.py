from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.db import get_db
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.models.user import User

router = APIRouter()


@router.get("")
async def recent_report_delivery_runs(
    report_date: date | None = Query(default=None, alias="date"),
    slot: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict]:
    query = select(PrimeFlowReportDeliveryRun)
    if report_date:
        query = query.where(PrimeFlowReportDeliveryRun.report_date == report_date)
    if slot:
        query = query.where(PrimeFlowReportDeliveryRun.report_slot == slot)
    if status:
        query = query.where(PrimeFlowReportDeliveryRun.status == status)
    rows = (await db.execute(query.order_by(PrimeFlowReportDeliveryRun.created_at.desc()).limit(limit))).scalars()
    return [
        {
            "id": str(row.id), "report_date": row.report_date, "report_slot": row.report_slot,
            "scheduled_for": row.scheduled_for, "status": row.status, "attempt_count": row.attempt_count,
            "data_generated_at": row.data_generated_at, "subject": row.subject,
            "gmail_message_id": row.gmail_message_id, "gmail_thread_id": row.gmail_thread_id,
            "error_code": row.error_code, "error_message": row.error_message,
            "started_at": row.started_at, "finished_at": row.finished_at,
        }
        for row in rows
    ]
