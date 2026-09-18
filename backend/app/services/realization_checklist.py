"""Roll up recorded daily judgment without treating missing answers as facts."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from app.services.realization_calculator import (
    MANDATORY_MANUAL_QUESTION_KEYS,
    MANUAL_BOOLEAN_QUESTION_KEYS,
)


def aggregate_daily_answers(
    records: list[dict[str, Any]], *, expected_dates: set[date]
) -> dict[str, dict[str, Any]]:
    # Corrections replace earlier answers for the same day/question. The caller
    # loads the latest answer per result; this also guards duplicate results.
    latest: dict[tuple[str, str], dict] = {}
    for record in sorted(records, key=lambda item: (item.get("answered_at") or "", item.get("id") or "")):
        key = record["question_key"]
        if key in MANDATORY_MANUAL_QUESTION_KEYS:
            latest[(record["date"], key)] = record
    grouped: dict[str, list[dict]] = defaultdict(list)
    for (day, key), record in sorted(latest.items()):
        if date.fromisoformat(day) in expected_dates:
            grouped[key].append(record)
    summaries = {}
    for key in sorted(MANDATORY_MANUAL_QUESTION_KEYS):
        history = grouped.get(key, [])
        if key in MANUAL_BOOLEAN_QUESTION_KEYS:
            answered_history = [item for item in history if isinstance(item.get("value"), bool)]
        else:
            answered_history = [
                item
                for item in history
                if isinstance(item.get("value"), str) and item["value"].strip()
            ]
        answered_dates = {date.fromisoformat(item["date"]) for item in answered_history}
        missing = sorted(day.isoformat() for day in expected_dates - answered_dates)
        values = [item["value"] for item in answered_history]
        if key in MANUAL_BOOLEAN_QUESTION_KEYS:
            # One missed meeting makes the week's meetings non-compliant;
            # the other questions ask whether an event happened at least once.
            value = (all(values) if key == "respected_meetings" else any(values)) if values else None
        else:
            value = "\n".join(f'{item["date"]}: {item["value"]}' for item in history if item["value"])
        comments = "\n".join(f'{item["date"]}: {item["comment"]}' for item in answered_history if item.get("comment"))
        summaries[key] = {
            "value": value,
            "comment": comments or None,
            "source": "DAILY_AGGREGATE",
            "history": answered_history,
            "answered_days": len(answered_history),
            "expected_days": len(expected_dates),
            "missing_dates": missing,
            "complete": not missing,
            "yes_days": sum(item["value"] is True for item in answered_history),
            "no_days": sum(item["value"] is False for item in answered_history),
            "na_days": 0,
            "evidence_ids": sorted({str(evidence) for item in answered_history for evidence in item.get("evidence_ids") or []}),
        }
    return summaries


def apply_checklist_answers(
    facts: dict[str, Any], *, direct_answers: dict[str, dict], daily_summaries: dict[str, dict] | None = None
) -> None:
    daily_summaries = daily_summaries or {}
    effective = {key: summary for key, summary in daily_summaries.items() if summary["complete"]}
    effective.update({key: answer for key, answer in direct_answers.items() if key in MANDATORY_MANUAL_QUESTION_KEYS})
    facts["manual_answers"] = effective
    facts["daily_question_summary"] = daily_summaries
    enriched = []
    for question in facts.get("questions") or []:
        item = dict(question)
        key = item["key"]
        summary = daily_summaries.get(key)
        if summary:
            item["daily_summary"] = summary
        answer = direct_answers.get(key) if key in MANDATORY_MANUAL_QUESTION_KEYS else None
        if answer is not None:
            item.update(final_value=answer["value"], manager_comment=answer.get("comment"), linked_evidence_ids=answer.get("evidence_ids") or [], source_status="MANUAL_ANSWERED")
        elif summary:
            item.update(final_value=summary["value"], manager_comment=summary["comment"], linked_evidence_ids=summary["evidence_ids"], source_status="MANUAL_DAILY_ANSWERED" if summary["complete"] else "MANUAL_DAILY_PARTIAL")
        enriched.append(item)
    facts["questions"] = enriched
    answered = set(effective) & MANDATORY_MANUAL_QUESTION_KEYS
    facts["manual_question_completeness"] = {
        "answered": len(answered), "required": len(MANDATORY_MANUAL_QUESTION_KEYS),
        "missing_keys": sorted(MANDATORY_MANUAL_QUESTION_KEYS - answered),
        "complete": answered == MANDATORY_MANUAL_QUESTION_KEYS,
    }
