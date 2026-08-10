from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings


class RealizationAIError(RuntimeError):
    pass


def mark_analysis_stale(result: Any) -> None:
    if getattr(result, "ai_generated_at", None) is not None:
        result.ai_analysis_stale = True


def record_analysis_state(result: Any, analysis: dict[str, Any], generated_at: Any) -> None:
    result.ai_suggested_level = analysis["suggested_level"]
    result.ai_generated_at = generated_at
    result.ai_analysis_stale = False


ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "positives": {"type": "array", "items": {"type": "string"}},
        "problems": {"type": "array", "items": {"type": "string"}},
        "missing_evidence": {"type": "array", "items": {"type": "string"}},
        "suggested_level": {"type": "string", "enum": ["A+", "A", "B", "C", "M", "D", "E"]},
        "grade_reason": {"type": "string"},
        "grade_drivers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["POSITIVE", "NEGATIVE", "JUSTIFICATION", "FACT"]},
                    "description": {"type": "string"},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["type", "description", "evidence_ids"],
                "additionalProperties": False,
            },
        },
        "caps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "maximum_level": {"type": "string", "enum": ["A+", "A", "B", "C", "M", "D", "E"]},
                    "reason": {"type": "string"},
                    "evidence_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["maximum_level", "reason", "evidence_ids"],
                "additionalProperties": False,
            },
        },
        "question_keys_used": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "summary", "positives", "problems", "missing_evidence", "suggested_level",
        "grade_reason", "grade_drivers", "caps", "question_keys_used", "confidence",
        "evidence_ids",
    ],
    "additionalProperties": False,
}


def _text(value: Any, *, limit: int = 6000) -> str | None:
    """Keep human context and make any token-safety truncation explicit."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= limit:
        return text
    half = max(1, (limit - 80) // 2)
    return f"{text[:half]}\n[TRUNCATED {len(text) - (half * 2)} CHARACTERS]\n{text[-half:]}"


def _safe_input(result_id: str, facts: dict[str, Any]) -> dict[str, Any]:
    """Build a Realization-only payload without discarding human explanations."""
    tasks: list[dict[str, Any]] = []
    for task in facts.get("tasks") or []:
        progress = task.get("daily_progress") or task.get("progress") or []
        completion_day = task.get("completion_day") or task.get("actual_completion_day")
        classification = task.get("classification")
        attribution = task.get("attribution")
        status = task.get("status")
        comment = task.get("user_comment") or task.get("employee_comment")
        planned = attribution == "planned_owner" or str(classification or "").startswith("planned_")
        additional = attribution in {"additional_owner", "added_after_weekly_plan"} or str(
            classification or ""
        ).startswith("additional_")
        tasks.append(
            {
                "task_id": str(task.get("task_id") or task.get("match_key") or ""),
                "title": _text(task.get("title")),
                "project_title": _text(task.get("project_title")),
                "project_id": str(task.get("project_id") or "") or None,
                "source_type": task.get("source_type"),
                "planned_days": task.get("planned_days") or task.get("planned_dates") or task.get("planned_day") or [item.get("day") for item in (task.get("planned_occurrences") or []) if item.get("day")],
                "planned_deadline": task.get("planned_deadline") or task.get("baseline_deadline"),
                "effective_deadline": task.get("effective_deadline") or task.get("deadline"),
                "actual_completion_day": completion_day,
                "classification": classification,
                "current_status": getattr(status, "value", status),
                "progress": progress,
                "quantity_progress": task.get("quantity_progress") or {
                    "completed": task.get("completed_quantity") or task.get("completed_value"),
                    "target": task.get("quantity_target") or task.get("total_value"),
                },
                "postponement_type": task.get("postponement"),
                "employee_comment": _text(comment),
                "rlz_impact": task.get("rlz_impact"),
                "planned": planned,
                "additional": additional,
                "pink_no_progress": bool(task.get("pink") or task.get("is_pink") or task.get("rlz_impact") == "PINK_ACTION_REQUIRED" or classification == "no_progress"),
                "completed_late": bool(task.get("completed_late") or classification == "completed_late"),
                "completed_outside_plan": bool(classification == "completed_outside_plan"),
                "explanation_missing": bool(task.get("comment_required_before_close") and not comment),
            }
        )

    observations: list[dict[str, Any]] = []
    for item in facts.get("observations") or []:
        observations.append(
            {
                "id": str(item.get("id") or ""),
                "marker": item.get("marker"),
                "category": item.get("category"),
                "comment": _text(item.get("comment")),
                "verified": bool(item.get("verified")),
                "task_id": str(item.get("task_id") or "") or None,
                "related_user_id": str(item.get("user_id") or item.get("related_user_id") or "") or None,
                "impact_minutes": item.get("impact_minutes"),
                "repeat_count": item.get("repeat_count") or item.get("repeat_count_at_creation"),
                "evidence_json": item.get("evidence_json") or {},
                "source_type": item.get("source_type"),
                "relevant_date": item.get("relevant_date") or item.get("created_at"),
            }
        )

    manual_answers = {}
    for key, answer in (facts.get("manual_answers") or {}).items():
        manual_answers[str(key)] = {
            "value": answer.get("value"),
            "comment": _text(answer.get("comment")),
            "evidence_ids": answer.get("evidence_ids") or [],
            "answered_by": answer.get("answered_by_name") or answer.get("answered_by"),
            "answered_at": answer.get("answered_at"),
            "source": "MANAGER_ANSWER",
        }

    timeline = []
    for day in facts.get("daily_timeline") or []:
        close_event = day.get("close_event") or {}
        timeline.append(
            {
                "date": day.get("date"),
                "planned_count": day.get("planned_count"),
                "completed_count": day.get("completed_count"),
                "weekly_progress_percent": day.get("weekly_progress_percent"),
                "pulse": day.get("pulse"),
                "close_state": day.get("close_state"),
                "employee_daily_close_comment": _text(close_event.get("daily_comment")),
                "confirmed_pulse": close_event.get("confirmed_pulse"),
                "attendance": day.get("attendance") or [],
            }
        )

    return {
        "anonymous_result_id": result_id,
        "data_roles": {
            "task_and_operational_records": "AUTO_FACT",
            "manual_answers": "MANAGER_ANSWER_NOT_AUTOMATICALLY_PROVEN",
            "observations_with_verified_true": "VERIFIED_EVIDENCE",
        },
        "baseline": facts.get("baseline") or {},
        "final_state": facts.get("final_state") or {},
        "counters": facts.get("counters") or {},
        "weekly_progress_percent": facts.get("weekly_progress_percent"),
        "rlz_pulse_history": facts.get("pulse_history") or [],
        "daily_timeline": timeline,
        "project_progress": facts.get("project_progress") or [],
        "tasks": tasks,
        "manual_answers": manual_answers,
        "observations": observations,
        "attendance": facts.get("attendance") or [],
        "meetings": facts.get("meetings") or [],
        "postponements": facts.get("postponements") or [],
        "needs_review": facts.get("needs_review") or [],
        "deterministic_policy_decision": facts.get("decision") or {},
        "manager_review_comment": _text(facts.get("manager_review_comment")),
    }


def _output_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct:
        return direct
    for output in payload.get("output") or []:
        if output.get("type") != "message":
            continue
        for content in output.get("content") or []:
            if content.get("type") == "output_text" and content.get("text"):
                return str(content["text"])
    raise RealizationAIError("AI response did not contain structured output")


def _rule_based_analysis(facts: dict[str, Any], *, suggested_level: str | None = None) -> dict[str, Any]:
    """Evidence-only fallback; it remains advisory and mirrors policy guardrails."""
    counters = facts.get("counters") or {}
    planned = int(facts.get("weekly_planned_count", counters.get("planned_count", 0)) or 0)
    accounted = int(counters.get("accounted_planned_count", facts.get("weekly_completed_count", 0)) or 0)
    remaining = max(0, planned - accounted)
    observations = [item for item in facts.get("observations") or [] if item.get("verified") is True]
    positive = [item for item in observations if item.get("marker") in {"POSITIVE", "DIAMOND"}]
    negative = [item for item in observations if item.get("marker") == "NEGATIVE"]
    answers = facts.get("manual_answers") or {}
    # A persisted null value means the manager explicitly selected N/A.
    missing: list[str] = []
    missing.extend(
        str(question.get("label") or question.get("key"))
        for question in facts.get("questions") or []
        if question.get("source_status") in {
            "AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE", "MANUAL_UNANSWERED"
        }
        and str(question.get("key")) not in answers
    )
    if suggested_level not in {"A+", "A", "B", "C", "M", "D", "E"}:
        suggested_level = "D" if remaining else ("A+" if len(positive) >= 2 else "A" if positive else "B")

    positives = [
        f"{item.get('category')}: {item.get('comment')}"
        for item in positive
        if item.get("comment")
    ] or ([f"{len(positive)} evidenca pozitive të verifikuara."] if positive else [])
    problems = []
    if remaining:
        problems.append(f"{remaining} nga {planned} obligime të planit mbeten të pambuluara.")
    problems.extend(
        f"{item.get('category')}: {item.get('comment')}" for item in negative if item.get("comment")
    )
    evidence_ids = sorted(
        {str(item["id"]) for item in observations if item.get("id")}
        | {
            str(task.get("task_id") or task.get("match_key"))
            for task in facts.get("tasks") or []
            if task.get("task_id") or task.get("match_key")
        }
    )
    question_keys = sorted(answers)
    grade_reason = (
        f"Janë llogaritur {accounted}/{planned} obligime. Ka {len(positive)} kontribute pozitive të verifikuara, por {remaining}/{planned} obligime të planit mbeten të pambuluara."
        if remaining
        else f"Të gjitha {planned} obligimet janë llogaritur; u verifikuan {len(positive)} kontribute pozitive."
    )
    caps = []
    decision = facts.get("decision") or {}
    if decision.get("hard_cap_level"):
        caps.append({
            "maximum_level": decision["hard_cap_level"],
            "reason": "; ".join(decision.get("reasons") or ["Kufizim determinist"]),
            "evidence_ids": evidence_ids,
        })
    drivers = [
        {"type": "POSITIVE", "description": text, "evidence_ids": evidence_ids}
        for text in positives
    ]
    if remaining:
        drivers.append({"type": "NEGATIVE", "description": problems[0], "evidence_ids": []})
    return {
        "summary": grade_reason,
        "positives": positives,
        "problems": problems,
        "missing_evidence": missing,
        "suggested_level": suggested_level,
        "grade_reason": grade_reason,
        "grade_drivers": drivers,
        "caps": caps,
        "question_keys_used": question_keys,
        "confidence": round(min(0.94, 0.58 + min(len(observations), 5) * 0.05 + min(len(answers), 12) * 0.015), 2),
        "evidence_ids": evidence_ids,
        "model": "primeflow-evidence-engine-v2",
        "advisory_only": True,
    }


async def analyze_realization(
    result_id: str, facts: dict[str, Any], *, suggested_level: str | None = None
) -> dict[str, Any]:
    if not settings.REALIZATION_AI_ENABLED or not settings.OPENAI_API_KEY:
        return _rule_based_analysis(facts, suggested_level=suggested_level)

    system_prompt = """
You are the advisory PrimeFlow weekly Realization evaluator. Read every supplied AUTO FACT,
MANAGER ANSWER, employee task/daily-close comment, and VERIFIED EVIDENCE comment. Manager
answers are judgments, not proof; verified observations are evidence. Never invent facts.
Cite the evidence IDs and manual question keys that drive the proposal.

Rubric: A+ requires accounted obligations, exceptional performance, multiple strong verified
positive contributions, and no disqualifying negative evidence. A requires accounted obligations,
at least one meaningful verified positive, and no serious negative. B means expected work is
satisfactorily accounted with no extra required. C means work is mostly achieved but meaningful
delay, minor discipline, or quality issues exist. M is for approved personal circumstances with
the obligation/reason properly accounted. D means significant unresolved plan failure, unapproved
delays, repeated problems, missed obligations, or important negative evidence. E means severe
failure, no meaningful progress, serious repeated failure, or severe absence under policy.

Positive contributions must be acknowledged but never erase unresolved planned obligations or a
hard deterministic cap. Explain any disagreement with the deterministic policy. Return concise
Albanian. This is advisory only: AI cannot review, approve, or lock a result.
""".strip()
    request = {
        "model": settings.REALIZATION_AI_MODEL,
        "store": False,
        "reasoning": {"effort": "none"},
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(_safe_input(result_id, facts), ensure_ascii=False, default=str)},
        ],
        "text": {"format": {"type": "json_schema", "name": "realization_analysis", "strict": True, "schema": ANALYSIS_SCHEMA}},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.REALIZATION_AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
                json=request,
            )
        response.raise_for_status()
        analysis = json.loads(_output_text(response.json()))
    except (httpx.HTTPError, ValueError, TypeError):
        return _rule_based_analysis(facts, suggested_level=suggested_level)
    analysis["model"] = settings.REALIZATION_AI_MODEL
    analysis["advisory_only"] = True
    return analysis
