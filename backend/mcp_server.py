import os
import base64
import json
import re
import time
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import httpx
import asyncpg
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP


ENV_FILE = Path(__file__).resolve().with_name(".env")
load_dotenv(ENV_FILE, override=True)

API_BASE_URL = os.getenv("PRIMEFLOW_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
WEB_BASE_URL = os.getenv("PRIMEFLOW_WEB_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
ACCESS_TOKEN = os.getenv("PRIMEFLOW_ACCESS_TOKEN")
READONLY_DATABASE_URL = os.getenv("PRIMEFLOW_READONLY_DATABASE_URL")
REQUEST_TIMEOUT = float(os.getenv("PRIMEFLOW_MCP_TIMEOUT", "30"))
MCP_HOST = os.getenv("PRIMEFLOW_MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("PRIMEFLOW_MCP_PORT", "8010"))
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Europe/Budapest")
_token_cache: dict[str, Any] = {"access_token": ACCESS_TOKEN, "expires_at": 0}

PRIMEFLOW_GUIDE = """
Primeflow is an internal task, project, planning, reporting, and operations system.

Use the specific MCP tools first for common work. Use primeflow_api_request only when a specific tool does not cover the request.
All API calls go through the existing Primeflow FastAPI backend and use the configured service account, so backend permissions still apply.

Core language and business rules:
- "1H" means a Primeflow 1H report task. It is not a request to set the deadline one hour from now. Set is_1h_report=true.
- 1H slots, when requested, use one_h_report_slot values: 10:00, 11:00, 11:50, 14:20, 16:00.
- After the app's slot rollover time, Primeflow may apply 1H slot work to the next effective workday. Let the backend enforce this.
- Initials such as LH should be resolved to users before assignment. LH normally means Laurent Hoxha if that is the unique matching user.
- For task assignment, prefer assignee_name or assignee_ids in MCP tools. The MCP server resolves names/initials and sends assignees=[user_id] plus assigned_to.
- Status values commonly include TODO, IN_PROGRESS, WAITING_CONFIRMATION, DONE, and related backend enum values.
- Priority values commonly include NORMAL and HIGH.
- Dates should be ISO strings. For day filters, use local-day bounds such as 2026-07-09T00:00:00+02:00 to 2026-07-10T00:00:00+02:00.

Major modules:
- Auth: login, refresh, logout, and /api/auth/me. MCP handles login internally with the configured service account.
- Users: list users, lookup users, create/update/deactivate users where permitted. Use list_users or resolve_user before assigning by name.
- Departments and boards: departments group work areas such as Development, Graphic Design, Finance, HR, PCM, GA/KA. Boards support department kanban views.
- Tasks: primary work item. Tasks have title, description, internal_notes, project_id, department_id, assigned_to, assignees, status, priority, phase, progress, start_date, due_date, completed_at, is_1h_report, one_h_report_slot, is_bllok, is_r1, is_personal, and related planner fields.
- Projects: grouped work with current_phase, status, manager, department, project_type, total_products, templates, workflow items, phase advancement, close/remove-from-day operations.
- Common View: operational cross-department view built from common entries and task/project signals. It includes common entries, approval/rejection, assignment, leave/block rows, bllok tasks, personal/R1/1H/common orderable tasks, and consolidated planning visibility.
- Weekly Planner: weekly and weekly-table endpoints show planned work by user/day/slot, support save-day, user ordering, user visibility, snapshots, plan-vs-actual, plan-vs-final, comparison, latest snapshot, overview, and legend rows.
- Monthly Planner: monthly planning endpoint for larger time windows.
- System Tasks: recurring/system templates, approvals, rejections, occurrence generation, occurrence date changes, and generated task visibility.
- GA notes and Plan notes: notes with attachments, discussed/done fields, task conversion, task deadlines, waiting confirmation handling, and public GA notes.
- GA time slots/table: GA time table rows, slot entries, and time-based reporting.
- Meetings: meetings, external/internal meeting flows, triggered system tasks, meeting templates/exports.
- Internal notes and internal meeting sessions: internal note creation, grouped updates, done state, cleanup/session handling.
- Checklists and checklist items: reusable checklists, project phase checklist items, checklist item editing/deletion, import/export support.
- Reports and exports: daily reports, GA daily table, XLSX/CSV/PDF exports for tasks, weekly planner, common view, snapshots, system tasks, GA notes, meetings, checklists, and daily reports.
- File access: maps users, lists folders/access, creates/approves/rejects file access requests, removes access where permitted.
- Microsoft integration: authorization URL, callback, status, disconnect, calendar events.
- Notifications and audit logs: user notifications, read/delete operations, audit history.
- External platform links and project prompts: platform references and prompt/config records for project workflows.

Endpoint guidance:
- Use /openapi.json or list_api_endpoints to discover exact routes and schemas.
- Use GET endpoints for lookup/reporting before mutating.
- Use POST/PATCH/PUT only when the user clearly asks to create, update, approve, reject, save, or generate.
- Use DELETE only when the user explicitly asks to delete/deactivate/remove and the target ID is clear.
- Never invent UUIDs. Resolve names with list_users, resolve_user, list_projects, or relevant lookup endpoints.
- For "what tasks does X have today / unfinished today", use get_user_tasks_for_day or get_user_unfinished_tasks_today. Do not manually filter by assignee name.
- Database read-only tools are for schema understanding, relationship discovery, debugging, and simple analytics only. Use API tools for writes and Primeflow business logic.
- run_readonly_sql allows only SELECT/WITH statements and runs in a read-only transaction. Never use database tools for create/update/delete actions.
"""

mcp = FastMCP("primeflow", instructions=PRIMEFLOW_GUIDE, host=MCP_HOST, port=MCP_PORT)

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
FORBIDDEN_SQL_RE = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|execute|call|merge|"
    r"refresh|vacuum|analyze|reindex|cluster|comment|security|set|reset|listen|notify)\b",
    re.IGNORECASE,
)


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

    primeflow_email = os.getenv("PRIMEFLOW_EMAIL")
    primeflow_password = os.getenv("PRIMEFLOW_PASSWORD")
    if primeflow_email and primeflow_password:
        async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(
                "/api/auth/login",
                json={"email": primeflow_email, "password": primeflow_password},
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


def _db_url() -> str:
    if not READONLY_DATABASE_URL:
        raise RuntimeError(
            "PRIMEFLOW_READONLY_DATABASE_URL is not set. Configure a PostgreSQL read-only user before using DB tools."
        )
    return READONLY_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)


def _validate_readonly_sql(sql: str) -> str:
    statement = sql.strip()
    if not statement:
        raise ValueError("SQL query is required.")
    if ";" in statement.rstrip(";"):
        raise ValueError("Only one SQL statement is allowed.")
    statement = statement.rstrip(";").strip()
    lowered = statement.lower()
    if not (lowered.startswith("select ") or lowered.startswith("with ")):
        raise ValueError("Only SELECT or WITH read-only queries are allowed.")
    if FORBIDDEN_SQL_RE.search(statement):
        raise ValueError("This SQL contains a forbidden non-read-only keyword.")
    return statement


def _quote_ident(value: str) -> str:
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
        raise ValueError(f"Invalid SQL identifier: {value}")
    return f'"{value}"'


async def _db_fetch(sql: str, *args: Any) -> list[dict[str, Any]]:
    conn = await asyncpg.connect(_db_url())
    try:
        async with conn.transaction(readonly=True):
            rows = await conn.fetch(sql, *args)
            return [dict(row) for row in rows]
    finally:
        await conn.close()


def _parse_json_arg(value: str | None, *, default: Any) -> Any:
    if value is None or value.strip() == "":
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Expected valid JSON, got: {value}") from exc


def _normalize_api_path(path: str) -> str:
    value = path.strip()
    if not value:
        raise ValueError("API path is required.")
    if value.startswith("http://") or value.startswith("https://"):
        raise ValueError("Use a relative Primeflow path, not a full URL.")
    if value in {"/health", "health", "/openapi.json", "openapi.json"}:
        return value if value.startswith("/") else f"/{value}"
    if value.startswith("/api/"):
        return value
    if value.startswith("api/"):
        return f"/{value}"
    return f"/api/{value.lstrip('/')}"


def _frontend_url(path: str) -> str:
    return urljoin(f"{WEB_BASE_URL}/", path.lstrip("/"))


def _local_tz() -> ZoneInfo | timezone:
    try:
        return ZoneInfo(APP_TIMEZONE)
    except Exception:
        return timezone.utc


def _parse_day(value: str | None) -> date:
    if value:
        return date.fromisoformat(value)
    return datetime.now(_local_tz()).date()


def _day_bounds(value: str | None) -> tuple[str, str, str]:
    day = _parse_day(value)
    tz = _local_tz()
    start = datetime.combine(day, datetime_time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return day.isoformat(), start.isoformat(), end.isoformat()


def _user_initials(user: dict[str, Any]) -> str:
    full_name = str(user.get("full_name") or "").strip()
    if full_name:
        parts = [part for part in re.split(r"\s+", full_name) if part]
        return "".join(part[0] for part in parts).upper()
    username = str(user.get("username") or "").strip()
    return "".join(part[0] for part in re.split(r"[\s._-]+", username) if part).upper()


def _user_search_text(user: dict[str, Any]) -> str:
    return " ".join(
        str(user.get(key) or "").lower()
        for key in ("full_name", "username", "email")
    )


async def _resolve_user_id(user_ref: str | None) -> str | None:
    if not user_ref:
        return None
    value = user_ref.strip()
    if not value:
        return None
    if UUID_RE.match(value):
        return value

    users = await _request("GET", "/api/users")
    query = value.lower()
    query_initials = value.replace(".", "").replace(" ", "").upper()

    exact_matches = [
        user for user in users
        if query in {
            str(user.get("full_name") or "").lower(),
            str(user.get("username") or "").lower(),
            str(user.get("email") or "").lower(),
        }
    ]
    if len(exact_matches) == 1:
        return str(exact_matches[0]["id"])

    initials_matches = [user for user in users if _user_initials(user) == query_initials]
    if len(initials_matches) == 1:
        return str(initials_matches[0]["id"])

    contains_matches = [user for user in users if query in _user_search_text(user)]
    if len(contains_matches) == 1:
        return str(contains_matches[0]["id"])

    if not exact_matches and not initials_matches and not contains_matches:
        raise ValueError(f"No Primeflow user matched '{user_ref}'. Use list_users to inspect users.")

    candidates = exact_matches or initials_matches or contains_matches
    names = ", ".join(
        f"{user.get('full_name') or user.get('username')} ({user.get('id')})"
        for user in candidates[:10]
    )
    raise ValueError(f"Ambiguous Primeflow user '{user_ref}'. Matching candidates: {names}")


async def _resolve_department_id(department_ref: str | None) -> str | None:
    if not department_ref:
        return None
    value = department_ref.strip()
    if not value:
        return None
    if UUID_RE.match(value):
        return value

    departments = await _request("GET", "/api/departments")
    query = value.lower()
    exact_matches = [
        dept for dept in departments
        if query in {
            str(dept.get("name") or "").lower(),
            str(dept.get("code") or "").lower(),
            str(dept.get("slug") or "").lower(),
        }
    ]
    if len(exact_matches) == 1:
        return str(exact_matches[0]["id"])

    contains_matches = [
        dept for dept in departments
        if query in " ".join(str(dept.get(key) or "").lower() for key in ("name", "code", "slug"))
    ]
    if len(contains_matches) == 1:
        return str(contains_matches[0]["id"])

    candidates = exact_matches or contains_matches
    if not candidates:
        raise ValueError(f"No Primeflow department matched '{department_ref}'. Use list_departments to inspect departments.")
    names = ", ".join(
        f"{dept.get('name') or dept.get('code')} ({dept.get('id')})"
        for dept in candidates[:10]
    )
    raise ValueError(f"Ambiguous Primeflow department '{department_ref}'. Matching candidates: {names}")


@mcp.tool()
async def primeflow_me() -> Any:
    """Return the Primeflow user connected to this MCP server."""
    return await _request("GET", "/api/auth/me")


@mcp.tool()
async def primeflow_guide() -> str:
    """Return a broad guide explaining Primeflow modules, terminology, and MCP/API usage rules."""
    return PRIMEFLOW_GUIDE


@mcp.tool()
async def list_api_endpoints(tag: str | None = None, query: str | None = None) -> Any:
    """List Primeflow API endpoints from FastAPI OpenAPI. Optional tag/query filters narrow the result."""
    spec = await _request("GET", "/openapi.json")
    results: list[dict[str, Any]] = []
    tag_filter = tag.lower() if tag else None
    query_filter = query.lower() if query else None
    for path, methods in spec.get("paths", {}).items():
        for method, details in methods.items():
            if method.lower() not in {"get", "post", "patch", "put", "delete"}:
                continue
            tags = details.get("tags") or []
            haystack = " ".join(
                [
                    path,
                    method,
                    str(details.get("summary") or ""),
                    str(details.get("description") or ""),
                    " ".join(str(item) for item in tags),
                ]
            ).lower()
            if tag_filter and tag_filter not in [str(item).lower() for item in tags]:
                continue
            if query_filter and query_filter not in haystack:
                continue
            results.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "tags": tags,
                    "summary": details.get("summary"),
                    "operation_id": details.get("operationId"),
                }
            )
    return results


@mcp.tool()
async def list_departments() -> Any:
    """List Primeflow departments. Use this before department-specific reports if the department ID is unknown."""
    return await _request("GET", "/api/departments")


@mcp.tool()
async def resolve_department(department_ref: str) -> Any:
    """Resolve a Primeflow department name/code/slug/UUID such as Development, DEV, GA, PCM to a department record."""
    department_id = await _resolve_department_id(department_ref)
    departments = await _request("GET", "/api/departments")
    for department in departments:
        if str(department.get("id")) == department_id:
            return department
    return {"id": department_id}


@mcp.tool()
async def primeflow_api_request(
    method: str,
    path: str,
    params_json: str | None = None,
    body_json: str | None = None,
) -> Any:
    """
    Call any Primeflow API endpoint through the existing backend.

    method: GET, POST, PATCH, PUT, or DELETE.
    path: relative path such as /api/tasks, /api/planners/weekly-table, /api/common-view, or /openapi.json.
    params_json: JSON object for query params, for example {"include_done": false}.
    body_json: JSON body for POST/PATCH/PUT, for example {"title": "Task"}.

    Use DELETE only after an explicit user request and a clear target ID.
    """
    method_upper = method.strip().upper()
    if method_upper not in {"GET", "POST", "PATCH", "PUT", "DELETE"}:
        raise ValueError("method must be GET, POST, PATCH, PUT, or DELETE.")
    normalized_path = _normalize_api_path(path)
    params = _parse_json_arg(params_json, default={})
    body = _parse_json_arg(body_json, default=None)
    if not isinstance(params, dict):
        raise ValueError("params_json must be a JSON object.")

    async with httpx.AsyncClient(base_url=API_BASE_URL, timeout=REQUEST_TIMEOUT, headers=await _headers()) as client:
        response = await client.request(method_upper, normalized_path, params=params, json=body)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if response.status_code == 204 or not response.content:
        return {"status": "ok", "status_code": response.status_code}
    if "application/json" in content_type:
        return response.json()
    text = response.text
    return {
        "status_code": response.status_code,
        "content_type": content_type,
        "content_length": len(response.content),
        "text_preview": text[:2000],
    }


@mcp.tool()
async def list_database_tables(schema_name: str = "public") -> Any:
    """List database tables/views in a schema using the read-only DB connection."""
    return await _db_fetch(
        """
        select table_schema, table_name, table_type
        from information_schema.tables
        where table_schema = $1
        order by table_type, table_name
        """,
        schema_name,
    )


@mcp.tool()
async def describe_database_table(table_name: str, schema_name: str = "public") -> Any:
    """Describe columns, types, nullability, defaults, and primary key status for a database table."""
    columns = await _db_fetch(
        """
        select
            c.ordinal_position,
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default,
            case when pk.column_name is not null then true else false end as is_primary_key
        from information_schema.columns c
        left join (
            select ku.table_schema, ku.table_name, ku.column_name
            from information_schema.table_constraints tc
            join information_schema.key_column_usage ku
              on tc.constraint_name = ku.constraint_name
             and tc.table_schema = ku.table_schema
            where tc.constraint_type = 'PRIMARY KEY'
        ) pk
          on pk.table_schema = c.table_schema
         and pk.table_name = c.table_name
         and pk.column_name = c.column_name
        where c.table_schema = $1 and c.table_name = $2
        order by c.ordinal_position
        """,
        schema_name,
        table_name,
    )
    if not columns:
        raise ValueError(f"Table not found: {schema_name}.{table_name}")
    return columns


@mcp.tool()
async def list_database_relationships(table_name: str | None = None, schema_name: str = "public") -> Any:
    """List foreign-key relationships, optionally filtered to one table."""
    return await _db_fetch(
        """
        select
            tc.constraint_name,
            kcu.table_schema,
            kcu.table_name,
            kcu.column_name,
            ccu.table_schema as foreign_table_schema,
            ccu.table_name as foreign_table_name,
            ccu.column_name as foreign_column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
         and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and kcu.table_schema = $1
          and ($2::text is null or kcu.table_name = $2 or ccu.table_name = $2)
        order by kcu.table_name, kcu.column_name
        """,
        schema_name,
        table_name,
    )


@mcp.tool()
async def run_readonly_sql(sql: str, max_rows: int = 100) -> Any:
    """
    Run a read-only SQL query against Primeflow DB.

    Only SELECT/WITH are allowed. The query runs in a read-only transaction.
    Results are capped to max_rows, default 100, hard max 500.
    Use this for understanding data and relationships, not for app writes.
    """
    statement = _validate_readonly_sql(sql)
    row_limit = min(max(max_rows, 1), 500)
    wrapped = f"select * from ({statement}) as mcp_readonly_result limit {row_limit}"
    rows = await _db_fetch(wrapped)
    return {"row_count": len(rows), "max_rows": row_limit, "rows": rows}


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
    assignee_name: str | None = None,
    due_from: str | None = None,
    due_to: str | None = None,
    window_from: str | None = None,
    window_to: str | None = None,
    include_done: bool = True,
    include_inactive: bool = False,
) -> Any:
    """
    List Primeflow tasks with optional filters.

    Use assignee_name for names/initials like "Endi Hyseni" or "EH"; the MCP server resolves it to assigned_to UUID.
    Date filters should be ISO datetime strings. window_from/window_to is better for "tasks for this day" because it considers due/start/created planner windows.
    """
    resolved_assignee = await _resolve_user_id(assignee_name or assigned_to)
    return await _request(
        "GET",
        "/api/tasks",
        params={
            "department_id": department_id,
            "project_id": project_id,
            "status": status,
            "assigned_to": resolved_assignee,
            "due_from": due_from,
            "due_to": due_to,
            "window_from": window_from,
            "window_to": window_to,
            "include_done": include_done,
            "include_inactive": include_inactive,
        },
    )


@mcp.tool()
async def get_user_tasks_for_day(
    user_ref: str,
    day_date: str | None = None,
    unfinished_only: bool = False,
    include_inactive: bool = False,
) -> Any:
    """
    Get one user's Primeflow tasks for a specific local day.

    Use this for questions like "what does Endi Hyseni need to finish today?"
    user_ref can be a full name, username, email, UUID, or initials.
    day_date is YYYY-MM-DD; omitted means today in APP_TIMEZONE.
    unfinished_only=true excludes DONE/completed tasks.
    """
    user_id = await _resolve_user_id(user_ref)
    day, start, end = _day_bounds(day_date)
    tasks = await _request(
        "GET",
        "/api/tasks",
        params={
            "assigned_to": user_id,
            "window_from": start,
            "window_to": end,
            "include_done": not unfinished_only,
            "include_inactive": include_inactive,
        },
    )
    if unfinished_only:
        tasks = [
            task for task in tasks
            if str(task.get("status") or "").upper() not in {"DONE", "COMPLETED"}
            and not task.get("completed_at")
        ]
    return {
        "user_id": user_id,
        "day": day,
        "unfinished_only": unfinished_only,
        "count": len(tasks),
        "tasks": tasks,
    }


@mcp.tool()
async def get_user_unfinished_tasks_today(user_ref: str) -> Any:
    """Get unfinished Primeflow tasks for a user today. Use this for 'left unfinished today' questions."""
    return await get_user_tasks_for_day(user_ref=user_ref, day_date=None, unfinished_only=True)


@mcp.tool()
async def get_open_tasks_by_department(
    department_ref: str,
    include_done: bool = False,
    include_inactive: bool = False,
) -> Any:
    """Get open/unfinished tasks for a Primeflow department by name/code/UUID."""
    department_id = await _resolve_department_id(department_ref)
    return await list_tasks(
        department_id=department_id,
        include_done=include_done,
        include_inactive=include_inactive,
    )


@mcp.tool()
async def get_common_view(
    week_start: str | None = None,
    include: str | None = "users,departments,entries,meetings,system_tasks,tasks",
    department_id: str | None = None,
    include_all_departments: bool = True,
    max_items_per_bucket: int | None = None,
) -> Any:
    """
    Get Primeflow Common View.

    Use this for Common View, internal/external meetings, 1H, blocked, personal, R1, priority, feedback,
    absent/leave, external holidays, system-task BZ rows, and weekly operational overview.
    For meetings, Common View returns them in items.internal and items.external.
    week_start should be the Monday date in YYYY-MM-DD format; omitted means current week.
    """
    return await _request(
        "GET",
        "/api/common-view",
        params={
            "week_start": week_start,
            "include": include,
            "department_id": department_id,
            "include_all_departments": include_all_departments,
            "max_items_per_bucket": max_items_per_bucket,
        },
    )


@mcp.tool()
async def get_common_view_meetings_for_week(
    week_start: str | None = None,
    department_ref: str | None = None,
    include_all_departments: bool = True,
) -> Any:
    """
    Get internal and external meetings from Common View for a week.

    Use this for "takime interne/eksterne kete jave/javen tjeter".
    week_start should be Monday YYYY-MM-DD. The result contains internal and external lists.
    """
    department_id = await _resolve_department_id(department_ref)
    data = await get_common_view(
        week_start=week_start,
        include="users,departments,meetings",
        department_id=department_id,
        include_all_departments=include_all_departments,
    )
    items = data.get("items") or {}
    return {
        "week_start": data.get("week_start"),
        "week_end": data.get("week_end"),
        "counts": {
            "internal": len(items.get("internal") or []),
            "external": len(items.get("external") or []),
        },
        "internal": items.get("internal") or [],
        "external": items.get("external") or [],
    }


@mcp.tool()
async def list_meetings(
    department_id: str | None = None,
    project_id: str | None = None,
    include_all_departments: bool = True,
    meeting_type: str | None = None,
) -> Any:
    """
    List Primeflow meetings.

    meeting_type can be "internal" or "external".
    For week-based internal/external meeting summaries, prefer get_common_view because it expands recurring meetings by week.
    """
    return await _request(
        "GET",
        "/api/meetings",
        params={
            "department_id": department_id,
            "project_id": project_id,
            "include_all_departments": include_all_departments,
            "meeting_type": meeting_type,
        },
    )


@mcp.tool()
async def get_weekly_planner(
    week_start: str | None = None,
    department_ref: str | None = None,
    user_ref: str | None = None,
) -> Any:
    """Get Primeflow weekly planner data. Use for weekly plan/project/task planning views."""
    department_id = await _resolve_department_id(department_ref)
    user_id = await _resolve_user_id(user_ref)
    return await _request(
        "GET",
        "/api/planners/weekly",
        params={"week_start": week_start, "department_id": department_id, "user_id": user_id},
    )


@mcp.tool()
async def get_weekly_table(
    week_start: str | None = None,
    department_ref: str | None = None,
    is_this_week: bool = False,
) -> Any:
    """Get Primeflow weekly table planner, organized by departments/users/days/AM/PM."""
    department_id = await _resolve_department_id(department_ref)
    return await _request(
        "GET",
        "/api/planners/weekly-table",
        params={"week_start": week_start, "department_id": department_id, "is_this_week": is_this_week},
    )


@mcp.tool()
async def get_monthly_planner(
    year: int,
    month: int,
    department_ref: str | None = None,
    user_ref: str | None = None,
) -> Any:
    """Get Primeflow monthly planner for a year/month, optionally scoped to department or user."""
    department_id = await _resolve_department_id(department_ref)
    user_id = await _resolve_user_id(user_ref)
    return await _request(
        "GET",
        "/api/planners/monthly",
        params={"year": year, "month": month, "department_id": department_id, "user_id": user_id},
    )


@mcp.tool()
async def get_daily_report(
    day: str | None = None,
    department_ref: str | None = None,
    user_ref: str | None = None,
) -> Any:
    """Get Primeflow daily report for execution/accountability, late items, daily tasks, and system occurrences."""
    day_value = _parse_day(day).isoformat()
    department_id = await _resolve_department_id(department_ref)
    user_id = await _resolve_user_id(user_ref)
    return await _request(
        "GET",
        "/api/reports/daily",
        params={"day": day_value, "department_id": department_id, "user_id": user_id},
    )


@mcp.tool()
async def get_daily_ga_table(
    day: str | None = None,
    department_ref: str | None = None,
    user_ref: str | None = None,
) -> Any:
    """Get Primeflow daily GA table/report data for a day."""
    day_value = _parse_day(day).isoformat()
    department_id = await _resolve_department_id(department_ref)
    user_id = await _resolve_user_id(user_ref)
    return await _request(
        "GET",
        "/api/reports/daily-ga-table",
        params={"day": day_value, "department_id": department_id, "user_id": user_id},
    )


@mcp.tool()
async def list_common_entries(from_date: str | None = None, to_date: str | None = None) -> Any:
    """List Common entries, optionally by date range. Use for complaints, requests, proposals, problems, leave/PV, holidays, feedback."""
    return await _request("GET", "/api/common-entries", params={"from": from_date, "to": to_date})


@mcp.tool()
async def list_leave_blocks(
    block_type: str = "PV_FEST",
    start: str | None = None,
    end: str | None = None,
    department_ref: str | None = None,
) -> Any:
    """List Common View leave/holiday blocks. block_type defaults to PV_FEST."""
    department_id = await _resolve_department_id(department_ref)
    return await _request(
        "GET",
        "/api/common-entries/blocks",
        params={"type": block_type, "start": start, "end": end, "department_id": department_id},
    )


@mcp.tool()
async def list_ga_notes(project_id: str | None = None, department_ref: str | None = None) -> Any:
    """List GA/KA notes, optionally for a project or department."""
    department_id = await _resolve_department_id(department_ref)
    return await _request("GET", "/api/ga-notes", params={"project_id": project_id, "department_id": department_id})


@mcp.tool()
async def list_plan_notes(project_id: str | None = None, department_ref: str | None = None) -> Any:
    """List plan notes, optionally for a project or department."""
    department_id = await _resolve_department_id(department_ref)
    return await _request("GET", "/api/plan-notes", params={"project_id": project_id, "department_id": department_id})


@mcp.tool()
async def list_internal_notes(department_ref: str, to_user_ref: str | None = None) -> Any:
    """List internal notes for a department, optionally targeted to a user."""
    department_id = await _resolve_department_id(department_ref)
    to_user_id = await _resolve_user_id(to_user_ref)
    return await _request(
        "GET",
        "/api/internal-notes",
        params={"department_id": department_id, "to_user_id": to_user_id},
    )


@mcp.tool()
async def list_system_tasks(
    department_ref: str | None = None,
    only_active: bool = False,
    assigned_to: str | None = None,
    occurrence_date: str | None = None,
    include_overdue: bool = False,
) -> Any:
    """List system tasks/occurrences. assigned_to can be name/initials/UUID."""
    department_id = await _resolve_department_id(department_ref)
    assigned_to_id = await _resolve_user_id(assigned_to)
    return await _request(
        "GET",
        "/api/system-tasks",
        params={
            "department_id": department_id,
            "only_active": only_active,
            "assigned_to": assigned_to_id,
            "occurrence_date": occurrence_date,
            "include_overdue": include_overdue,
        },
    )


@mcp.tool()
async def list_system_task_templates() -> Any:
    """List Primeflow system task templates including recurring task definitions where visible."""
    return await _request("GET", "/api/system-tasks/templates")


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
    assignee_name: str | None = None,
    assignee_ids: list[str] | None = None,
    due_date: str | None = None,
    priority: str | None = None,
    is_1h_report: bool | None = None,
    one_h_report_slot: str | None = None,
) -> Any:
    """
    Create a Primeflow task.

    Primeflow rules:
    - Use assignee_name for names or initials such as "Laurent Hoxha" or "LH"; the MCP server resolves it to a user ID.
    - Use assignee_ids only when exact Primeflow user UUIDs are already known.
    - "1H" means set is_1h_report=true, not "due in one hour".
    - one_h_report_slot, when known, must be one of 10:00, 11:00, 11:50, 14:20, 16:00.
    - due_date should be an ISO datetime string.
    """
    resolved_assignees = list(assignee_ids or [])
    resolved_assignee = await _resolve_user_id(assignee_name or assigned_to)
    if resolved_assignee and resolved_assignee not in resolved_assignees:
        resolved_assignees.insert(0, resolved_assignee)

    return await _request(
        "POST",
        "/api/tasks",
        json={
            "title": title,
            "description": description,
            "project_id": project_id,
            "department_id": department_id,
            "assigned_to": resolved_assignees[0] if resolved_assignees else None,
            "assignees": resolved_assignees or None,
            "due_date": due_date,
            "priority": priority,
            "is_1h_report": is_1h_report,
            "one_h_report_slot": one_h_report_slot,
        },
    )


@mcp.tool()
async def create_1h_task(
    title: str,
    assignee_name: str,
    description: str | None = None,
    department_ref: str | None = None,
    due_date: str | None = None,
    one_h_report_slot: str | None = None,
    priority: str | None = None,
) -> Any:
    """
    Create a Primeflow 1H task for a user.

    Use this when the user says "krijo task 1H per LH/filan person".
    1H means is_1h_report=true. assignee_name can be initials or full name.
    """
    department_id = await _resolve_department_id(department_ref)
    return await create_task(
        title=title,
        description=description,
        department_id=department_id,
        assignee_name=assignee_name,
        due_date=due_date,
        priority=priority,
        is_1h_report=True,
        one_h_report_slot=one_h_report_slot,
    )


@mcp.tool()
async def update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    assigned_to: str | None = None,
    assignee_name: str | None = None,
    assignee_ids: list[str] | None = None,
    due_date: str | None = None,
    progress_percentage: int | None = None,
    is_1h_report: bool | None = None,
    one_h_report_slot: str | None = None,
) -> Any:
    """Update selected fields on a Primeflow task. Use assignee_name for names/initials such as LH."""
    resolved_assignees = list(assignee_ids or [])
    resolved_assignee = await _resolve_user_id(assignee_name or assigned_to)
    if resolved_assignee and resolved_assignee not in resolved_assignees:
        resolved_assignees.insert(0, resolved_assignee)
    payload = {
        "title": title,
        "description": description,
        "status": status,
        "priority": priority,
        "assigned_to": resolved_assignees[0] if resolved_assignees else None,
        "assignees": resolved_assignees or None,
        "due_date": due_date,
        "progress_percentage": progress_percentage,
        "is_1h_report": is_1h_report,
        "one_h_report_slot": one_h_report_slot,
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


@mcp.tool()
async def resolve_user(user_ref: str) -> Any:
    """Resolve a Primeflow user name, email, username, UUID, or initials like LH to a user record."""
    user_id = await _resolve_user_id(user_ref)
    users = await _request("GET", "/api/users")
    for user in users:
        if str(user.get("id")) == user_id:
            return user
    return {"id": user_id}


if __name__ == "__main__":
    transport = os.getenv("PRIMEFLOW_MCP_TRANSPORT", "stdio")
    if transport == "sse":
        mcp.run(transport="sse")
    else:
        mcp.run()
