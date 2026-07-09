import os
import base64
import json
import time
from typing import Any
from urllib.parse import urljoin

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP


load_dotenv()

API_BASE_URL = os.getenv("PRIMEFLOW_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
WEB_BASE_URL = os.getenv("PRIMEFLOW_WEB_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
ACCESS_TOKEN = os.getenv("PRIMEFLOW_ACCESS_TOKEN")
PRIMEFLOW_EMAIL = os.getenv("PRIMEFLOW_EMAIL")
PRIMEFLOW_PASSWORD = os.getenv("PRIMEFLOW_PASSWORD")
REQUEST_TIMEOUT = float(os.getenv("PRIMEFLOW_MCP_TIMEOUT", "30"))
MCP_HOST = os.getenv("PRIMEFLOW_MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("PRIMEFLOW_MCP_PORT", "8010"))
_token_cache: dict[str, Any] = {"access_token": ACCESS_TOKEN, "expires_at": 0}

mcp = FastMCP("primeflow", host=MCP_HOST, port=MCP_PORT)


def _jwt_exp(token: str) -> int:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return int(json.loads(base64.urlsafe_b64decode(payload.encode("ascii"))).get("exp", 0))
    except Exception:
        return 0


async def _access_token() -> str:
    cached_token = str(_token_cache.get("access_token") or "")
    cached_exp = int(_token_cache.get("expires_at") or 0)
    if cached_token and cached_exp > int(time.time()) + 30:
        return cached_token

    if PRIMEFLOW_EMAIL and PRIMEFLOW_PASSWORD:
        async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                "/api/auth/login",
                json={"email": PRIMEFLOW_EMAIL, "password": PRIMEFLOW_PASSWORD},
            )
        response.raise_for_status()
        token = response.json()["access_token"]
        _token_cache["access_token"] = token
        _token_cache["expires_at"] = _jwt_exp(token)
        return token

    if ACCESS_TOKEN:
        _token_cache["access_token"] = ACCESS_TOKEN
        _token_cache["expires_at"] = _jwt_exp(ACCESS_TOKEN)
        return ACCESS_TOKEN

    raise RuntimeError(
        "Set PRIMEFLOW_EMAIL and PRIMEFLOW_PASSWORD, or set PRIMEFLOW_ACCESS_TOKEN for short local tests."
    )


async def _headers() -> dict[str, str]:
    token = await _access_token()
    if not token:
        raise RuntimeError(
            "PRIMEFLOW_ACCESS_TOKEN is not set. Log in to Primeflow and provide a valid API access token."
        )
    return {"Authorization": f"Bearer {token}"}


async def _request(method: str, path: str, *, params: dict[str, Any] | None = None, json: Any = None) -> Any:
    clean_params = {key: value for key, value in (params or {}).items() if value is not None}
    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=REQUEST_TIMEOUT, headers=await _headers()) as client:
        response = await client.request(method, path, params=clean_params, json=json)
    response.raise_for_status()
    if response.status_code == 204 or not response.content:
        return {"status": "ok"}
    return response.json()


def _frontend_url(path: str) -> str:
    return urljoin(f"{WEB_BASE_URL}/", path.lstrip("/"))


@mcp.tool()
async def primeflow_me() -> Any:
    """Return the Primeflow user connected to this MCP server."""
    return await _request("GET", "/api/auth/me")


@mcp.tool()
async def search_primeflow(query: str) -> Any:
    """Search Primeflow tasks and projects by text."""
    return await _request("GET", "/api/search", params={"q": query})


@mcp.tool(name="search")
async def search_for_chatgpt(query: str) -> dict[str, list[dict[str, str]]]:
    """Search Primeflow and return ChatGPT-compatible citation results."""
    data = await search_primeflow(query)
    results: list[dict[str, str]] = []
    for task in data.get("tasks", []):
        task_id = str(task["id"])
        results.append(
            {
                "id": f"task:{task_id}",
                "title": task.get("title") or f"Task {task_id}",
                "url": _frontend_url(f"/tasks/{task_id}"),
            }
        )
    for project in data.get("projects", []):
        project_id = str(project["id"])
        title = project.get("title") or project.get("name") or f"Project {project_id}"
        results.append(
            {
                "id": f"project:{project_id}",
                "title": title,
                "url": _frontend_url(f"/projects/{project_id}"),
            }
        )
    return {"results": results}


@mcp.tool(name="fetch")
async def fetch_for_chatgpt(id: str) -> dict[str, Any]:
    """Fetch a Primeflow search result by ID. IDs are returned by the search tool."""
    kind, _, item_id = id.partition(":")
    if kind == "task" and item_id:
        task = await get_task(item_id)
        return {
            "id": id,
            "title": task.get("title") or f"Task {item_id}",
            "text": "\n".join(
                part
                for part in [
                    f"Status: {task.get('status')}",
                    f"Priority: {task.get('priority')}",
                    f"Due date: {task.get('due_date')}",
                    task.get("description") or "",
                    task.get("internal_notes") or "",
                ]
                if part
            ),
            "url": _frontend_url(f"/tasks/{item_id}"),
            "metadata": {"type": "task", "primeflow_id": item_id},
        }
    if kind == "project" and item_id:
        project = await get_project(item_id)
        return {
            "id": id,
            "title": project.get("display_title") or project.get("title") or f"Project {item_id}",
            "text": "\n".join(
                part
                for part in [
                    f"Status: {project.get('status')}",
                    f"Current phase: {project.get('current_phase')}",
                    f"Progress: {project.get('progress_percentage')}%",
                    project.get("description") or "",
                ]
                if part
            ),
            "url": _frontend_url(f"/projects/{item_id}"),
            "metadata": {"type": "project", "primeflow_id": item_id},
        }
    raise ValueError("Expected a search result ID like task:<uuid> or project:<uuid>.")


@mcp.tool()
async def list_tasks(
    department_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
    assigned_to: str | None = None,
    due_from: str | None = None,
    due_to: str | None = None,
    include_done: bool = True,
    include_inactive: bool = False,
) -> Any:
    """List Primeflow tasks with optional filters. Date filters should be ISO datetime strings."""
    return await _request(
        "GET",
        "/api/tasks",
        params={
            "department_id": department_id,
            "project_id": project_id,
            "status": status,
            "assigned_to": assigned_to,
            "due_from": due_from,
            "due_to": due_to,
            "include_done": include_done,
            "include_inactive": include_inactive,
        },
    )


@mcp.tool()
async def get_task(task_id: str) -> Any:
    """Get a Primeflow task by ID."""
    return await _request("GET", f"/api/tasks/{task_id}")


@mcp.tool()
async def create_task(
    title: str,
    description: str | None = None,
    project_id: str | None = None,
    department_id: str | None = None,
    assigned_to: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
) -> Any:
    """Create a Primeflow task. due_date should be an ISO datetime string."""
    return await _request(
        "POST",
        "/api/tasks",
        json={
            "title": title,
            "description": description,
            "project_id": project_id,
            "department_id": department_id,
            "assigned_to": assigned_to,
            "due_date": due_date,
            "priority": priority,
        },
    )


@mcp.tool()
async def update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assigned_to: str | None = None,
    due_date: str | None = None,
    progress_percentage: int | None = None,
) -> Any:
    """Update selected fields on a Primeflow task."""
    payload = {
        "title": title,
        "description": description,
        "status": status,
        "priority": priority,
        "assigned_to": assigned_to,
        "due_date": due_date,
        "progress_percentage": progress_percentage,
    }
    return await _request("PATCH", f"/api/tasks/{task_id}", json={key: value for key, value in payload.items() if value is not None})


@mcp.tool()
async def list_projects(
    department_id: str | None = None,
    include_templates: bool = False,
) -> Any:
    """List Primeflow projects with optional department filtering."""
    return await _request(
        "GET",
        "/api/projects",
        params={"department_id": department_id, "include_templates": include_templates},
    )


@mcp.tool()
async def get_project(project_id: str) -> Any:
    """Get a Primeflow project by ID."""
    return await _request("GET", f"/api/projects/{project_id}")


@mcp.tool()
async def list_users() -> Any:
    """List active Primeflow users visible to the connected account."""
    return await _request("GET", "/api/users")


if __name__ == "__main__":
    transport = os.getenv("PRIMEFLOW_MCP_TRANSPORT", "stdio")
    if transport == "sse":
        mcp.run(transport="sse")
    else:
        mcp.run()
