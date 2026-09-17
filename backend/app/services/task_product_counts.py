from __future__ import annotations

import re
from typing import Any


COMPLETED_PRODUCTS = re.compile(r"completed_products\s*[:=]\s*(\d+)", re.I)


def task_product_counts(task: Any) -> tuple[int, int] | None:
    """The same planned/completed product quantities used in M3."""
    planned = getattr(task, "daily_products", None)
    if planned is None or int(planned) <= 0:
        return None
    match = COMPLETED_PRODUCTS.search(getattr(task, "internal_notes", None) or "")
    return int(planned), int(match.group(1)) if match else 0
