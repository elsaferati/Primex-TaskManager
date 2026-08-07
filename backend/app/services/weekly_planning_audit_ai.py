from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings


AI_AUDIT_SCHEMA = {
    "type": "object",
    "properties": {
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string"},
                    "focus_task_id": {"type": ["string", "null"]},
                    "focus_project_id": {"type": ["string", "null"]},
                },
                "required": ["user_id", "focus_task_id", "focus_project_id"],
                "additionalProperties": False,
            },
        },
        "errors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "problem": {"type": "string"},
                    "proposed_title": {"type": "string"},
                    "correction": {"type": "string"},
                    "severity": {"type": "string", "enum": ["HIGH", "MEDIUM", "LOW"]},
                },
                "required": ["task_id", "problem", "proposed_title", "correction", "severity"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["people", "errors"],
    "additionalProperties": False,
}


SYSTEM_PROMPT = """Role: Audito semantikisht planifikimin javor të PrimeFlow.

Goal:
- Për çdo person zgjidh si fokus vetëm një detyrë ose projekt real jo-sistem që përfaqëson punën kryesore.
- Raporto vetëm probleme semantike të titullit që nuk mund të kontrollohen nga fusha të strukturuara.

Constraints:
- Përdor vetëm evidencën e dhënë; mos shpik detyra, projekte, shkurtesa, persona ose fakte.
- Detyrat e sistemit dhe system templates nuk janë kurrë fokus.
- Mos përdor si fokus GDPR rutinë, PLNF JAV, 1H, BLL, R1, P:, WFC, BKP, raportime rutinë, takime standarde, kontrolle të zakonshme ose email rutinë.
- Për fokus kthe vetëm ID ekzistuese. Kur s'ka fokus jo-sistem, kthe null për të dy ID-të.
- Shkurtesat lejohen vetëm kur ekzistojnë në fjalorin zyrtar PX të dhënë.
- Titulli i propozuar duhet të jetë i shkurtër. Hapat dhe sqarimet kalojnë në Description/Notes.
- Mos raporto metadata të editorit ose ndryshimeve të gjurmuara.
- Mos përsërit kontrollet deterministe për datë, status, prioritet, AM/PM, Pushim Vjetor, KO, Total/Mesatare, 1H, R1, P:, WFC, BLL ose BKP.

Output:
- Shqip e qartë, pa hamendësime.
- Kthe output vetëm sipas skemës së kërkuar."""


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
    raise ValueError("AI response did not contain structured output")


async def analyze_weekly_planning_audit(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    model = settings.WEEKLY_PLANNING_AUDIT_AI_MODEL
    if not payload.get("people"):
        return {"people": [], "errors": []}, "not_needed"
    if not settings.WEEKLY_PLANNING_AUDIT_AI_ENABLED:
        return None, "disabled"
    if not settings.OPENAI_API_KEY:
        return None, "missing_api_key"

    request = {
        "model": model,
        "store": False,
        "reasoning": {"effort": "none"},
        "input": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "weekly_planning_audit",
                "strict": True,
                "schema": AI_AUDIT_SCHEMA,
            }
        },
    }
    try:
        async with httpx.AsyncClient(timeout=settings.WEEKLY_PLANNING_AUDIT_AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=request,
            )
        response.raise_for_status()
        result = json.loads(_output_text(response.json()))
        if not isinstance(result, dict):
            raise ValueError("AI response root must be an object")
        return result, "used"
    except (httpx.HTTPError, ValueError, TypeError, json.JSONDecodeError):
        return None, "fallback"
