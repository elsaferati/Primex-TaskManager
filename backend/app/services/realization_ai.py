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


async def analyze_realization(result_id: str, facts: dict[str, Any]) -> dict[str, Any]:
    if not settings.REALIZATION_AI_ENABLED:
        raise RealizationAIError("Realization AI is disabled")
    if not settings.OPENAI_API_KEY:
        raise RealizationAIError("OPENAI_API_KEY is not configured")

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
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise RealizationAIError(f"AI analysis failed: {exc}") from exc
    analysis["model"] = settings.REALIZATION_AI_MODEL
    analysis["advisory_only"] = True
    return analysis
