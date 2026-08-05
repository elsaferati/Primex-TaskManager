from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings


class RealizationAIError(RuntimeError):
    pass


ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "positives": {"type": "array", "items": {"type": "string"}},
        "problems": {"type": "array", "items": {"type": "string"}},
        "missing_evidence": {"type": "array", "items": {"type": "string"}},
        "suggested_level": {
            "type": "string",
            "enum": ["A+", "A", "B", "C", "M", "D", "E"],
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "summary",
        "positives",
        "problems",
        "missing_evidence",
        "suggested_level",
        "confidence",
        "evidence_ids",
    ],
    "additionalProperties": False,
}


def _safe_input(result_id: str, facts: dict[str, Any]) -> dict[str, Any]:
    tasks = []
    for task in facts.get("tasks") or []:
        tasks.append(
            {
                "task_id": str(task.get("task_id") or task.get("match_key") or ""),
                "source_type": task.get("source_type"),
                "classification": task.get("classification"),
                "progress": task.get("daily_progress") or [],
                "postponement": task.get("postponement"),
            }
        )
    observations = []
    for item in facts.get("observations") or []:
        observations.append(
            {
                "id": str(item.get("id") or ""),
                "marker": item.get("marker"),
                "category": item.get("category"),
                "verified": bool(item.get("verified")),
                "evidence_json": item.get("evidence_json") or {},
            }
        )
    return {
        "anonymous_result_id": result_id,
        "counters": facts.get("counters") or {},
        "weekly_progress_percent": facts.get("weekly_progress_percent"),
        "daily_timeline": facts.get("daily_timeline") or [],
        "project_progress": facts.get("project_progress") or [],
        "tasks": tasks,
        "observations": observations,
        "needs_review": facts.get("needs_review") or [],
        "deterministic_decision": facts.get("decision") or {},
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


def _rule_based_analysis(
    facts: dict[str, Any], *, suggested_level: str | None = None
) -> dict[str, Any]:
    """Return a useful, evidence-only analysis when external AI is unavailable."""
    counters = facts.get("counters") or {}
    planned = int(facts.get("weekly_planned_count", counters.get("weekly_planned_count", 0)) or 0)
    completed = int(
        facts.get("weekly_completed_count", counters.get("weekly_completed_count", 0)) or 0
    )
    additional = int(
        facts.get("weekly_additional_count", counters.get("weekly_additional_count", 0)) or 0
    )
    progress = float(
        facts.get("weekly_progress_percent")
        or (round(completed * 100 / planned, 1) if planned else 0)
    )
    observations = [
        item for item in facts.get("observations") or [] if item.get("verified") is True
    ]
    positive_observations = [item for item in observations if item.get("marker") == "POSITIVE"]
    negative_observations = [item for item in observations if item.get("marker") == "NEGATIVE"]
    questions = facts.get("questions") or []
    missing_questions = [
        str(question.get("label") or question.get("key") or "Evidencë e pakonfirmuar")
        for question in questions
        if question.get("source_status") in {"AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"}
    ]

    positives: list[str] = []
    if completed:
        positives.append(f"Janë përfunduar {completed} nga {planned} detyrat e planifikuara ({progress:g}%).")
    if additional:
        positives.append(f"Janë regjistruar {additional} detyra të shtuara gjatë javës, të ndara nga plani bazë.")
    if positive_observations:
        positives.append(f"Ka {len(positive_observations)} evidenca pozitive të verifikuara.")

    remaining = max(0, planned - completed)
    problems: list[str] = []
    if remaining:
        problems.append(f"Kanë mbetur {remaining} detyra të planit javor pa u përfunduar.")
    if negative_observations:
        problems.append(f"Ka {len(negative_observations)} evidenca negative të verifikuara që kërkojnë vëmendje.")
    if not planned:
        problems.append("Nuk ka detyra të planifikuara për të matur realizimin javor.")

    if suggested_level not in {"A+", "A", "B", "C", "M", "D", "E"}:
        if negative_observations and progress < 80:
            suggested_level = "D"
        elif progress >= 100 and positive_observations:
            suggested_level = "A"
        elif progress >= 90:
            suggested_level = "B"
        elif progress >= 70:
            suggested_level = "C"
        elif progress >= 50:
            suggested_level = "M"
        else:
            suggested_level = "D"

    snapshot_days = sum(
        bool(item.get("has_snapshot", True)) for item in facts.get("daily_timeline") or []
    )
    evidence_coverage = min(1.0, (snapshot_days / 5) + (len(observations) * 0.05))
    confidence = round(min(0.92, 0.55 + evidence_coverage * 0.35), 2)
    summary_parts = [
        f"Barazimi javor është {completed}/{planned} detyra të planifikuara të përfunduara ({progress:g}%)."
    ]
    if additional:
        summary_parts.append(f"{additional} detyra shtesë raportohen veçmas dhe nuk mbulojnë detyrat e pambyllura.")
    if missing_questions:
        summary_parts.append(f"Para vlerësimit final duhen konfirmuar {len(missing_questions)} pika nga menaxheri.")

    evidence_ids = sorted(
        {
            str(value)
            for item in facts.get("tasks") or []
            for value in [item.get("task_id") or item.get("match_key")]
            if value
        }
        | {str(item["id"]) for item in observations if item.get("id")}
    )
    return {
        "summary": " ".join(summary_parts),
        "positives": positives,
        "problems": problems,
        "missing_evidence": missing_questions,
        "suggested_level": suggested_level,
        "confidence": confidence,
        "evidence_ids": evidence_ids,
        "model": "primeflow-evidence-engine-v1",
        "advisory_only": True,
    }


async def analyze_realization(
    result_id: str, facts: dict[str, Any], *, suggested_level: str | None = None
) -> dict[str, Any]:
    if not settings.REALIZATION_AI_ENABLED or not settings.OPENAI_API_KEY:
        return _rule_based_analysis(facts, suggested_level=suggested_level)

    system_prompt = (
        "You audit a PrimeFlow weekly realization result. Use only supplied evidence. "
        "Never invent attendance, meeting presence, impact, or task completion. "
        "Annual leave is not personal absence: a full annual-leave week defaults to B; "
        "approved personal absence may be M. A+/A require verified positive extras. "
        "Return a concise Albanian analysis. The result is advisory; a human decides."
    )
    request = {
        "model": settings.REALIZATION_AI_MODEL,
        "store": False,
        "reasoning": {"effort": "none"},
        "input": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(_safe_input(result_id, facts), ensure_ascii=False),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "realization_analysis",
                "strict": True,
                "schema": ANALYSIS_SCHEMA,
            }
        },
    }
    try:
        async with httpx.AsyncClient(
            timeout=settings.REALIZATION_AI_TIMEOUT_SECONDS
        ) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=request,
            )
        response.raise_for_status()
        analysis = json.loads(_output_text(response.json()))
    except (httpx.HTTPError, ValueError, TypeError):
        return _rule_based_analysis(facts, suggested_level=suggested_level)
    analysis["model"] = settings.REALIZATION_AI_MODEL
    analysis["advisory_only"] = True
    return analysis
