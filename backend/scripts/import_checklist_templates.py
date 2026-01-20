from __future__ import annotations

import argparse
import asyncio
import re
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import select

from app.db import SessionLocal
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.enums import ChecklistItemType


HEADER_ALIASES = {
    "nr": "nr",
    "no": "nr",
    "number": "nr",
    "tasks": "title",
    "task": "title",
    "attributes": "title",
    "attribute": "title",
    "topic": "title",
    "comment": "comment",
    "comments": "comment",
    "description": "description",
    "pershkrimidetal": "description",
    "pershkrimi": "description",
    "check": "check",
    "koha_e_perfundimit_manual": "time",
    "koha_e_perfundimit": "time",
    "time": "time",
    "when": "time",
    "owner": "owner",
    "who": "owner",
    "day": "day",
    "dita": "day",
    "date": "day",
}


def _normalize_header(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    if not text:
        return ""
    text = re.sub(r"[^\w]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def _clean_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalize_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _extract_header_row(rows: list[list[Any]]) -> tuple[int, dict[int, str], list[str]]:
    for idx, row in enumerate(rows):
        normalized = [_normalize_header(v) for v in row]
        header_hits = [HEADER_ALIASES.get(h, "") for h in normalized if h]
        if any(header_hits):
            column_map: dict[int, str] = {}
            raw_headers: list[str] = []
            for col_idx, header in enumerate(normalized):
                if not header:
                    raw_headers.append("")
                    continue
                raw_headers.append(header)
                column_map[col_idx] = HEADER_ALIASES.get(header, header)
            return idx, column_map, raw_headers
    raise ValueError("Could not find a header row with known columns.")


def _build_columns(raw_headers: list[str], column_map: dict[int, str]) -> list[dict[str, str]]:
    columns: list[dict[str, str]] = []
    seen: set[str] = set()
    for idx, raw in enumerate(raw_headers):
        if not raw:
            continue
        key = column_map.get(idx) or raw
        if key in seen:
            key = f"{key}_{idx}"
        seen.add(key)
        label = raw.replace("_", " ").upper()
        columns.append({"key": key, "label": label})
    return columns


async def _load_existing_items(db, checklist_id: str) -> set[str]:
    existing = (
        await db.execute(select(ChecklistItem).where(ChecklistItem.checklist_id == checklist_id))
    ).scalars().all()
    keys = set()
    for item in existing:
        parts = [
            _normalize_key(item.title or ""),
            _normalize_key(item.description or ""),
            _normalize_key(item.comment or ""),
            _normalize_key(item.time or ""),
            _normalize_key(item.owner or ""),
            _normalize_key(item.day or ""),
        ]
        keys.add("|".join(parts))
    return keys


async def import_checklist(
    file_path: Path,
    title: str,
    group_key: str,
    sheet_name: str | None,
    note: str | None,
    position: int | None,
) -> None:
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb[sheet_name] if sheet_name else wb.active

    rows = [list(row) for row in ws.iter_rows(values_only=True)]
    header_idx, column_map, raw_headers = _extract_header_row(rows)
    columns = _build_columns(raw_headers, column_map)

    async with SessionLocal() as db:
        checklist = (
            await db.execute(
                select(Checklist).where(Checklist.group_key == group_key, Checklist.project_id.is_(None))
            )
        ).scalar_one_or_none()
        if checklist is None:
            checklist = Checklist(
                title=title,
                group_key=group_key,
                note=note,
                position=position,
                columns=columns,
            )
            db.add(checklist)
            await db.flush()
        else:
            if checklist.title != title:
                checklist.title = title
            if note is not None:
                checklist.note = note
            if position is not None:
                checklist.position = position
            if checklist.columns is None and columns:
                checklist.columns = columns
            await db.flush()

        existing_keys = await _load_existing_items(db, str(checklist.id))

        position_counter = 0
        for row in rows[header_idx + 1 :]:
            if not any(v is not None and str(v).strip() for v in row):
                continue

            values = {column_map.get(idx, f"col_{idx}"): _clean_value(value) for idx, value in enumerate(row)}
            title_value = values.get("title") or ""
            description_value = values.get("description") or ""
            comment_value = values.get("comment") or ""
            time_value = values.get("time") or ""
            owner_value = values.get("owner") or ""
            day_value = values.get("day") or ""
            nr_value = values.get("nr") or ""

            extra_parts = []
            for key, value in values.items():
                if key in {"nr", "title", "description", "comment", "time", "owner", "day", "check"}:
                    continue
                if value:
                    extra_parts.append(f"{key.upper()}: {value}")
            if extra_parts:
                extra_text = "\n".join(extra_parts)
                comment_value = f"{comment_value}\n{extra_text}".strip() if comment_value else extra_text

            if not any([title_value, description_value, comment_value, time_value, owner_value, day_value]):
                continue

            key_parts = [
                _normalize_key(title_value),
                _normalize_key(description_value),
                _normalize_key(comment_value),
                _normalize_key(time_value),
                _normalize_key(owner_value),
                _normalize_key(day_value),
            ]
            key = "|".join(key_parts)
            if key in existing_keys:
                continue

            position_value: int | None = None
            if nr_value and nr_value.isdigit():
                position_value = int(nr_value) - 1
            if position_value is None:
                position_value = position_counter
            position_counter += 1

            db.add(
                ChecklistItem(
                    checklist_id=checklist.id,
                    item_type=ChecklistItemType.CHECKBOX,
                    position=position_value,
                    title=title_value or None,
                    description=description_value or None,
                    comment=comment_value or None,
                    time=time_value or None,
                    owner=owner_value or None,
                    day=day_value or None,
                    is_checked=False,
                )
            )
            existing_keys.add(key)

        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import checklist templates from Excel.")
    parser.add_argument("--file", required=True, help="Path to the .xlsx file.")
    parser.add_argument("--title", required=True, help="Checklist title.")
    parser.add_argument("--group-key", required=True, help="Checklist group_key.")
    parser.add_argument("--sheet", default=None, help="Optional sheet name.")
    parser.add_argument("--note", default=None, help="Optional checklist note.")
    parser.add_argument("--position", type=int, default=None, help="Optional checklist position.")
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        raise SystemExit(f"File not found: {file_path}")

    asyncio.run(
        import_checklist(
            file_path=file_path,
            title=args.title,
            group_key=args.group_key,
            sheet_name=args.sheet,
            note=args.note,
            position=args.position,
        )
    )


if __name__ == "__main__":
    main()
