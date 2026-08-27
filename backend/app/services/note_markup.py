from __future__ import annotations

import html
import re
from dataclasses import dataclass


# Keep this grammar aligned with frontend/src/lib/note-markup.tsx, including
# the historical missing-leading-bracket form accepted by PX Notes.
NOTE_MARK_TOKEN_RE = re.compile(r"\[{1,2}(done|added)\]\]|\[{1,2}/(done|added)\]\]", re.IGNORECASE)
LEGACY_ADD_WORD_RE = re.compile(r"\bADD\b")


@dataclass(frozen=True)
class MarkedText:
    text: str
    done_ranges: tuple[tuple[int, int], ...]
    added_ranges: tuple[tuple[int, int], ...]


def _normalize_ranges(ranges: list[tuple[int, int]]) -> tuple[tuple[int, int], ...]:
    normalized: list[list[int]] = []
    for start, end in sorted((start, end) for start, end in ranges if end > start):
        if normalized and start <= normalized[-1][1]:
            normalized[-1][1] = max(normalized[-1][1], end)
        else:
            normalized.append([start, end])
    return tuple((start, end) for start, end in normalized)


def parse_marked_note_content(content: str | None) -> MarkedText:
    if not content:
        return MarkedText("", (), ())
    output: list[str] = []
    output_length = 0
    cursor = 0
    open_marks: dict[str, list[int]] = {"done": [], "added": []}
    ranges: dict[str, list[tuple[int, int]]] = {"done": [], "added": []}
    for match in NOTE_MARK_TOKEN_RE.finditer(content):
        segment = content[cursor:match.start()]
        output.append(segment)
        output_length += len(segment)
        opening, closing = match.group(1), match.group(2)
        if opening:
            open_marks[opening.lower()].append(output_length)
        elif closing and open_marks[closing.lower()]:
            start = open_marks[closing.lower()].pop()
            if output_length > start:
                ranges[closing.lower()].append((start, output_length))
        cursor = match.end()
    output.append(content[cursor:])
    text = "".join(output)
    added = [*ranges["added"], *(match.span() for match in LEGACY_ADD_WORD_RE.finditer(text))]
    normalized_added = list(_normalize_ranges(added))
    merged_added: list[tuple[int, int]] = []
    for start, end in normalized_added:
        if merged_added and re.fullmatch(r"[ \t]*", text[merged_added[-1][1]:start]):
            merged_added[-1] = (merged_added[-1][0], end)
        else:
            merged_added.append((start, end))
    return MarkedText(text, _normalize_ranges(ranges["done"]), tuple(merged_added))


def _range_html(parsed: MarkedText, start: int, end: int) -> str:
    boundaries = {start, end}
    for range_start, range_end in (*parsed.done_ranges, *parsed.added_ranges):
        if range_end > start and range_start < end:
            boundaries.update((max(start, range_start), min(end, range_end)))
    ordered = sorted(boundaries)
    parts: list[str] = []
    for part_start, part_end in zip(ordered, ordered[1:]):
        value = html.escape(parsed.text[part_start:part_end])
        done = any(range_start <= part_start and range_end >= part_end for range_start, range_end in parsed.done_ranges)
        added = any(range_start <= part_start and range_end >= part_end for range_start, range_end in parsed.added_ranges)
        if done and added:
            value = f'<span style="background:#DBEAFE;color:#065F46;text-decoration:line-through;text-decoration-thickness:2px;padding:0 2px">{value}</span>'
        elif done:
            value = f'<span style="background:#D1FAE5;color:#047857;text-decoration:line-through;text-decoration-thickness:2px;padding:0 2px">{value}</span>'
        elif added:
            value = f'<span style="background:#BFDBFE;color:#172554;padding:0 2px">{value}</span>'
        parts.append(value)
    return "".join(parts)


def marked_task_html(content: str | None, ordinal: int) -> str:
    parsed = parse_marked_note_content(content)
    lines = parsed.text.splitlines(keepends=True) or [""]
    offsets: list[tuple[int, int, str]] = []
    cursor = 0
    for raw_line in lines:
        line = raw_line.rstrip("\r\n")
        offsets.append((cursor, cursor + len(line), line))
        cursor += len(raw_line)
    title_index = next((index for index, (_, _, line) in enumerate(offsets) if line.strip()), None)
    if title_index is None:
        return f'<b>{ordinal}.</b> —'
    rendered = []
    for index, (start, end, _line) in enumerate(offsets[title_index:]):
        line_html = _range_html(parsed, start, end) or "&nbsp;"
        if index == 0:
            rendered.append(f'<div style="font:700 11px/1.35 Arial;color:#111827">{line_html}</div>')
        else:
            rendered.append(f'<div style="margin-top:2px;font:400 10px/1.35 Arial;color:#475569">{line_html}</div>')
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">'
        f'<tr><td width="22" valign="top" style="width:22px;padding:0 5px 0 0;text-align:right;font:700 11px/1.35 Arial;color:#64748B">{ordinal}.</td>'
        f'<td valign="top" style="padding:0">{"".join(rendered)}</td></tr></table>'
    )


def marked_task_plain_lines(content: str | None, ordinal: int) -> list[str]:
    lines = [line.rstrip() for line in parse_marked_note_content(content).text.splitlines()]
    first = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first is None:
        return [f"{ordinal}. —"]
    return [f"{ordinal}. {lines[first].strip()}", *(f"   {line}" for line in lines[first + 1:])]
