from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.one_h_print_report_snapshot import OneHPrintReportSnapshot
from app.models.user import User


async def get_one_h_print_snapshot(
    db: AsyncSession, report_kind: str, report_date: date
) -> OneHPrintReportSnapshot | None:
    return (
        await db.execute(
            select(OneHPrintReportSnapshot).where(
                OneHPrintReportSnapshot.report_kind == report_kind,
                OneHPrintReportSnapshot.report_date == report_date,
            )
        )
    ).scalar_one_or_none()


async def save_one_h_print_snapshot(
    db: AsyncSession,
    *,
    report_kind: str,
    report_date: date,
    report: dict,
    user: User,
) -> OneHPrintReportSnapshot:
    row = await get_one_h_print_snapshot(db, report_kind, report_date)
    target_date = date.fromisoformat(str(report["target_date"])[:10])
    if row is None:
        row = OneHPrintReportSnapshot(
            report_kind=report_kind,
            report_date=report_date,
            target_date=target_date,
            report_payload=report,
            generated_by_user_id=user.id,
        )
        db.add(row)
    else:
        row.target_date = target_date
        row.report_payload = report
        row.generated_by_user_id = user.id
    await db.commit()
    await db.refresh(row)
    return row


async def serialize_one_h_print_snapshot(
    db: AsyncSession, row: OneHPrintReportSnapshot
) -> dict:
    generated_by = None
    if row.generated_by_user_id:
        user = await db.get(User, row.generated_by_user_id)
        generated_by = user.full_name if user else None
    return {
        **dict(row.report_payload or {}),
        "snapshot_id": str(row.id),
        "report_kind": row.report_kind,
        "report_date": row.report_date.isoformat(),
        "generated_at": row.updated_at.isoformat() if row.updated_at else None,
        "generated_by": generated_by,
    }
