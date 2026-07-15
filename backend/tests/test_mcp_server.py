import unittest
from unittest.mock import AsyncMock, patch

import mcp_server


class TestMcpDateHelpers(unittest.TestCase):
    def test_day_bounds_stay_inside_requested_day(self) -> None:
        day, start, end = mcp_server._day_bounds("2026-07-15")

        self.assertEqual(day, "2026-07-15")
        self.assertTrue(start.startswith("2026-07-15T00:00:00"))
        self.assertTrue(end.startswith("2026-07-15T23:59:59.999999"))

    def test_parse_day_supports_albanian_relative_words(self) -> None:
        today = mcp_server._parse_day("sot")

        self.assertEqual(mcp_server._parse_day("neser").toordinal(), today.toordinal() + 1)
        self.assertEqual(mcp_server._parse_day("dje").toordinal(), today.toordinal() - 1)

    def test_explicit_week_start_is_normalized_to_monday(self) -> None:
        self.assertEqual(mcp_server._week_start("2026-07-15"), "2026-07-13")


class TestMcpResolution(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        mcp_server._lookup_cache.clear()

    async def test_user_resolution_can_be_scoped_to_department(self) -> None:
        users = [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "full_name": "Endi Hyseni",
                "username": "endi.dev",
                "email": "endi.dev@example.com",
                "department_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            },
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "full_name": "Endi Hyseni",
                "username": "endi.other",
                "email": "endi.other@example.com",
                "department_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            },
        ]

        async def fake_request(method: str, path: str, **kwargs):
            if path == "/api/users":
                return users
            if path == "/api/departments":
                return [
                    {
                        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                        "name": "Development",
                        "code": "DEV",
                    }
                ]
            raise AssertionError(path)

        with patch.object(mcp_server, "_request", side_effect=fake_request):
            user_id = await mcp_server._resolve_user_id("Endi Hyseni", "Development")

        self.assertEqual(user_id, "11111111-1111-1111-1111-111111111111")


class TestMcpTaskTools(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        mcp_server._lookup_cache.clear()

    async def test_user_day_query_does_not_include_tomorrow_boundary(self) -> None:
        async def fake_request(method: str, path: str, **kwargs):
            if path == "/api/tasks":
                self.assertTrue(kwargs["params"]["window_from"].startswith("2026-07-15T00:00:00"))
                self.assertTrue(kwargs["params"]["window_to"].startswith("2026-07-15T23:59:59.999999"))
                return []
            if path == "/api/users":
                return [{"id": "11111111-1111-1111-1111-111111111111", "full_name": "Endi Hyseni"}]
            raise AssertionError(path)

        with (
            patch.object(mcp_server, "_request", side_effect=fake_request),
            patch.object(
                mcp_server,
                "_resolve_user_id",
                AsyncMock(return_value="11111111-1111-1111-1111-111111111111"),
            ),
        ):
            result = await mcp_server.get_user_tasks_for_day("Endi Hyseni", "2026-07-15")

        self.assertEqual(result["day"], "2026-07-15")
        self.assertEqual(result["count"], 0)

    async def test_create_task_resolves_names_and_builds_backend_payload(self) -> None:
        request = AsyncMock(return_value={"id": "task-id", "title": "Test task"})
        with (
            patch.object(mcp_server, "_request", request),
            patch.object(
                mcp_server,
                "_resolve_department_id",
                AsyncMock(return_value="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            ),
            patch.object(mcp_server, "_resolve_project_id", AsyncMock(return_value=None)),
            patch.object(
                mcp_server,
                "_resolve_user_id",
                AsyncMock(return_value="11111111-1111-1111-1111-111111111111"),
            ),
        ):
            result = await mcp_server.create_task(
                title="Test task",
                department_ref="Development",
                assignee_name="Endi Hyseni",
                priority="HIGH",
                due_date="2026-07-15T16:00:00+02:00",
            )

        self.assertEqual(result["id"], "task-id")
        payload = request.await_args.kwargs["json"]
        self.assertEqual(payload["department_id"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        self.assertEqual(payload["assigned_to"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(payload["assignees"], ["11111111-1111-1111-1111-111111111111"])
        self.assertEqual(payload["priority"], "HIGH")

    async def test_registered_write_tools_have_enum_schemas(self) -> None:
        tools = {tool.name: tool for tool in await mcp_server.mcp.list_tools()}

        self.assertIn("create_meeting", tools)
        self.assertIn("create_plan_note", tools)
        self.assertIn("create_internal_note", tools)
        self.assertIn("create_common_entry", tools)
        meeting_type = tools["create_meeting"].inputSchema["properties"]["meeting_type"]
        self.assertEqual(meeting_type["enum"], ["internal", "external"])


if __name__ == "__main__":
    unittest.main()
