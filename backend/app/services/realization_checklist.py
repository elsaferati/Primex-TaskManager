"""Apply the manager's weekly judgment onto the calculated question checklist."""
from __future__ import annotations

from typing import Any

from app.services.realization_calculator import MANDATORY_MANUAL_QUESTION_KEYS


def apply_checklist_answers(facts: dict[str, Any], *, direct_answers: dict[str, dict]) -> None:
    # One answer per question per week: the manager may record or correct it on
    # any day of that week, and every view reads back the same weekly answer.
    effective = {
        key: answer
        for key, answer in direct_answers.items()
        if key in MANDATORY_MANUAL_QUESTION_KEYS
    }
    facts["manual_answers"] = effective
    enriched = []
    for question in facts.get("questions") or []:
        item = dict(question)
        answer = effective.get(item["key"])
        if answer is not None:
            item.update(
                final_value=answer["value"],
                manager_comment=answer.get("comment"),
                linked_evidence_ids=answer.get("evidence_ids") or [],
                source_status="MANUAL_ANSWERED",
            )
        enriched.append(item)
    facts["questions"] = enriched
    answered = set(effective)
    facts["manual_question_completeness"] = {
        "answered": len(answered), "required": len(MANDATORY_MANUAL_QUESTION_KEYS),
        "missing_keys": sorted(MANDATORY_MANUAL_QUESTION_KEYS - answered),
        "complete": answered == MANDATORY_MANUAL_QUESTION_KEYS,
    }
