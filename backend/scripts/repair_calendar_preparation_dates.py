"""Recalculate future CAL preparation meetings; preview unless --apply is used."""
import argparse
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.db import SessionLocal
from app.models.meeting import Meeting
from app.services.audit import add_audit_log
from app.services.microsoft_calendar_sync import calendar_preparation_start


async def main(apply=False):
    external = aliased(Meeting)
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(Meeting, external).join(external, Meeting.pre_external_meeting_id == external.id)
            .where(Meeting.meeting_type == "internal", external.calendar_imported.is_(True),
                   external.calendar_sync_status == "active", external.starts_at > now)
            .order_by(external.starts_at, external.id).with_for_update()
        )).all()
        reserved = set()
        count = 0
        for internal, ext in rows:
            # The database import timestamp is the safe fallback used by sync
            # when Microsoft's original creation timestamp is unavailable.
            start = calendar_preparation_start(ext.starts_at, ext.created_at, reserved_starts=reserved)
            reserved.add(start)
            if start == internal.starts_at:
                continue
            before = {"starts_at": internal.starts_at.isoformat() if internal.starts_at else None,
                      "ends_at": internal.ends_at.isoformat() if internal.ends_at else None}
            duration = internal.ends_at - internal.starts_at if internal.ends_at and internal.starts_at else None
            end = start + duration if duration else None
            after = {"starts_at": start.isoformat(), "ends_at": end.isoformat() if end else None}
            print(f"{internal.id} {internal.title}: {before} -> {after}")
            count += 1
            if apply:
                internal.starts_at = start
                internal.ends_at = end
                add_audit_log(db=db, actor_user_id=None, entity_type="meeting", entity_id=internal.id,
                              action="calendar_preparation_dates_repair", before=before, after=after)
        if apply:
            await db.commit()
        else:
            await db.rollback()
        print(f"{'COMMITTED' if apply else 'PREVIEW'}: changed={count}, checked={len(rows)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
