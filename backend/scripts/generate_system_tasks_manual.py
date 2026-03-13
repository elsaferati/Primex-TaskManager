from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.services.system_task_instances import generate_system_task_instances


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid date: {value!r}. Use YYYY-MM-DD.") from exc


async def _run(*, start: date | None, end: date | None) -> int:
    async with SessionLocal() as db:
        created = await generate_system_task_instances(
            db=db,
            now_utc=datetime.now(timezone.utc),
            start=start,
            end=end,
        )
        await db.commit()
        return created


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manually generate task rows from system task templates."
    )
    parser.add_argument(
        "--start",
        type=_parse_date,
        default=None,
        help="Optional local occurrence start date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--end",
        type=_parse_date,
        default=None,
        help="Optional local occurrence end date (YYYY-MM-DD).",
    )
    args = parser.parse_args()

    if (args.start is None) != (args.end is None):
        parser.error("--start and --end must be provided together.")
    if args.start is not None and args.end is not None and args.end < args.start:
        parser.error("--end must be on or after --start.")

    created = asyncio.run(_run(start=args.start, end=args.end))
    if args.start is not None and args.end is not None:
        print(
            f"Manual generation complete for range {args.start.isoformat()}..{args.end.isoformat()}. "
            f"created_tasks={created}"
        )
        return
    print(f"Manual generation complete using default scheduler window. created_tasks={created}")


if __name__ == "__main__":
    main()
