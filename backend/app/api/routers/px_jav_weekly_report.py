from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.access import ensure_manager_or_admin, ensure_reports_access
from app.api.deps import get_current_user
from app.db import get_db
from app.models.primeflow_report_delivery_run import PrimeFlowReportDeliveryRun
from app.models.user import User
from app.services.px_jav_weekly_report import (
    EXCEL_MIME,
    PDF_MIME,
    REPORT_SLOT,
    REPORT_TYPE,
    WORD_MIME,
    build_px_jav_weekly_report,
    configured_recipient,
    deliver_px_jav_weekly_report,
    render_docx,
    render_pdf,
    render_xlsx,
    report_filename_stem,
    report_timezone,
)


router = APIRouter()


@router.get("/preview")
async def preview_px_jav_weekly_report(
    report_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    ensure_reports_access(user)
    report = await build_px_jav_weekly_report(
        db,
        report_date=report_date,
        timezone_name=report_timezone().key,
        recipient=configured_recipient(),
    )
    return {
        "report_date": report.report_date,
        "generated_at": report.generated_at,
        "period_start": report.period_start,
        "period_end": report.period_end,
        "timezone": report.timezone,
        "recipient": report.recipient,
        "summary": report.summary(),
        "rows": [row.model_dump(mode="json") for row in report.rows],
    }


@router.get("/download")
async def download_px_jav_weekly_report(
    format: str = Query(pattern=r"^(xlsx|docx|pdf)$"),
    report_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    ensure_reports_access(user)
    report = await build_px_jav_weekly_report(
        db,
        report_date=report_date,
        timezone_name=report_timezone().key,
        recipient=configured_recipient(),
    )
    renderers = {
        "xlsx": (render_xlsx, EXCEL_MIME),
        "docx": (render_docx, WORD_MIME),
        "pdf": (render_pdf, PDF_MIME),
    }
    renderer, media_type = renderers[format]
    filename = f"{report_filename_stem(report)}.{format}"
    return Response(
        content=renderer(report),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/send-now")
async def send_px_jav_weekly_report_now(
    report_date: date | None = None,
    user: User = Depends(get_current_user),
) -> dict:
    ensure_manager_or_admin(user)
    run = await deliver_px_jav_weekly_report(
        report_date,
        send=True,
        trigger_type="MANUAL",
        triggered_by_user_id=user.id,
    )
    if run.status not in {"SENT", "ALREADY_SENT"}:
        raise HTTPException(status_code=502, detail=run.error_message or f"Delivery status: {run.status}")
    return {
        "id": str(run.id),
        "status": run.status,
        "report_date": run.report_date,
        "report_slot": run.report_slot,
        "recipient": configured_recipient(),
        "message_id": run.gmail_message_id,
    }


@router.get("/history")
async def px_jav_weekly_report_history(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    ensure_manager_or_admin(user)
    rows = (
        await db.execute(
            select(PrimeFlowReportDeliveryRun)
            .where(PrimeFlowReportDeliveryRun.report_type == REPORT_TYPE)
            .order_by(PrimeFlowReportDeliveryRun.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": str(row.id),
            "report_date": row.report_date,
            "report_slot": row.report_slot,
            "status": row.status,
            "attempt_count": row.attempt_count,
            "subject": row.subject,
            "recipient": configured_recipient(),
            "message_id": row.gmail_message_id,
            "error_message": row.error_message,
            "trigger_type": row.trigger_type,
            "started_at": row.started_at,
            "finished_at": row.finished_at,
        }
        for row in rows
    ]
