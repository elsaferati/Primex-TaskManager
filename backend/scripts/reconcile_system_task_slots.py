from __future__ import annotations

import argparse
import asyncio

from app.db import SessionLocal
from app.services.system_task_instances import ensure_slots_initialized, reconcile_system_task_slots


async def _run(days: int) -> dict[str, int]:
    async with SessionLocal() as db:
        await ensure_slots_initialized(db)
        result = await reconcile_system_task_slots(db=db, lookback_days=days)
        await db.commit()
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile and backfill missing system task slots.")
    parser.add_argument("--days", type=int, default=7, help="Lookback days for missing occurrences.")
    args = parser.parse_args()
    result = asyncio.run(_run(max(args.days, 0)))
    print(
        f"Reconciliation complete. rewound_slots={result['rewound_slots']} "
        f"created_tasks={result['created_tasks']}"
    )


if __name__ == "__main__":
    main()
