from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings
from app.schemas.skills import SKILL_FIELDS


INFERENCE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": list(SKILL_FIELDS)},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "reason": {"type": "string", "maxLength": 240},
    },
    "required": ["category", "confidence", "reason"],
    "additionalProperties": False,
}


def _output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for output in payload.get("output") or []:
        for content in output.get("content") or []:
            if content.get("type") == "output_text" and content.get("text"):
                return str(content["text"])
    raise ValueError("OpenAI response did not contain output_text")


async def infer_task_skill_category(title: str, description: str) -> dict[str, str]:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OpenAI API key is not configured")
    request = {
        "model": settings.SKILLS_AI_MODEL,
        "store": False,
        "reasoning": {"effort": "none"},
        "input": [
            {
                "role": "system",
                "content": (
                    "Classify the supplied PrimeFlow task into exactly one Skills Matrix category. "
                    "Use analysis for requirements/process breakdown; research for discovery/new ideas; "
                    "problem_solving for diagnosis/debugging; creativity for design/content/concepts; "
                    "standards for procedures/templates/documentation; qa for testing/quality checks; "
                    "management for planning/coordination; communication for clients/meetings/presentations; "
                    "fast_tasks for short urgent practical work. Respond in concise Albanian. "
                    "This is task classification, never employee performance evaluation."
                ),
            },
            {"role": "user", "content": json.dumps({"title": title, "description": description}, ensure_ascii=False)},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "skill_category_inference",
                "strict": True,
                "schema": INFERENCE_SCHEMA,
            }
        },
    }
    async with httpx.AsyncClient(timeout=settings.SKILLS_AI_TIMEOUT_SECONDS) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
            json=request,
        )
    response.raise_for_status()
    result = json.loads(_output_text(response.json()))
    if result.get("category") not in SKILL_FIELDS:
        raise ValueError("OpenAI returned an unsupported skill category")
    return result
