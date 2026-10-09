"""Apply the manager's weekly judgment onto the calculated question checklist."""
from __future__ import annotations

from typing import Any

from app.services.realization_calculator import MANDATORY_MANUAL_QUESTION_KEYS
from app.services.realization_weekly_summary import rollup_daily_answers


def apply_checklist_answers(facts: dict[str, Any], *, direct_answers: dict[str, dict]) -> None:
    rollup = rollup_daily_answers(facts.get("daily_timeline") or [])
    effective = {
        key: answer
        for key, answer in {**rollup, **direct_answers}.items()
        if key in MANDATORY_MANUAL_QUESTION_KEYS
    }
    facts["manual_answers"] = effective
    enriched = []
    for question in facts.get("questions") or []:
        item = dict(question)
        if item["key"] in MANDATORY_MANUAL_QUESTION_KEYS:
            item.update(final_value=None, manager_comment=None, linked_evidence_ids=[],
                        source_status="MANUAL_UNANSWERED", answer_source=None, daily_history=[])
        answer = effective.get(item["key"])
        if answer is not None:
            item.update(
                final_value=answer["value"],
                manager_comment=answer.get("comment"),
                linked_evidence_ids=answer.get("evidence_ids") or [],
                source_status="MANUAL_ANSWERED",
                answer_source=answer.get("source", "DIRECT"),
                daily_history=(rollup.get(item["key"]) or {}).get("history", []),
            )
        enriched.append(item)
    facts["questions"] = enriched
    answered = set(effective)
    facts["manual_question_completeness"] = {
        "answered": len(answered), "required": len(MANDATORY_MANUAL_QUESTION_KEYS),
        "missing_keys": sorted(MANDATORY_MANUAL_QUESTION_KEYS - answered),
        "complete": answered == MANDATORY_MANUAL_QUESTION_KEYS,
    }
