from __future__ import annotations

from typing import Any


def preserve_manual_sections(
    generated: list[dict[str, str]],
    existing: list[dict[str, Any]] | None,
    manual_titles: set[str],
) -> list[dict[str, str]]:
    """Keep saved manual answers (and renamed titles) when regenerating the same report day."""
    existing_list = list(existing or [])
    existing_by_title: dict[str, str] = {}
    for section in existing_list:
        title = str(section.get("title") or "").strip()
        if title and title not in existing_by_title:
            existing_by_title[title] = str(section.get("body") or "")

    merged: list[dict[str, str]] = []
    for index, section in enumerate(generated):
        title = str(section.get("title") or "")
        body = str(section.get("body") or "")
        if title in manual_titles:
            if index < len(existing_list):
                previous_title = str(existing_list[index].get("title") or "").strip()
                if previous_title:
                    title = previous_title
                    body = str(existing_list[index].get("body") or "")
            elif title in existing_by_title:
                body = existing_by_title[title]
        merged.append({"title": title, "body": body})
    return merged


def preserve_keyed_line(generated_body: str, existing_body: str | None, key_prefix: str) -> str:
    """Preserve a manual KEY: line inside an otherwise auto-generated section body."""
    if not existing_body:
        return generated_body

    saved_line: str | None = None
    prefix = key_prefix.strip().upper()
    for line in existing_body.splitlines():
        if line.strip().upper().startswith(prefix):
            saved_line = line
            break
    if saved_line is None:
        return generated_body

    lines = generated_body.splitlines()
    replaced = False
    out: list[str] = []
    for line in lines:
        if line.strip().upper().startswith(prefix):
            out.append(saved_line)
            replaced = True
        else:
            out.append(line)
    if not replaced:
        if out and out[-1].strip():
            out.append("")
        out.append(saved_line)
    return "\n".join(out)
