from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from mcp import ClientSession
from mcp.client.sse import sse_client


async def check(url: str, call_common_view: bool) -> None:
    async with sse_client(url) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = {tool.name for tool in tools.tools}
            required = {"get_common_view", "health_check"}
            missing = required - names
            if missing:
                raise RuntimeError("Missing MCP tools: " + ", ".join(sorted(missing)))
            print("MCP functional check: initialized; required tools are registered")
            health = await session.call_tool("health_check", {})
            health_text = "".join(str(getattr(item, "text", "")) for item in getattr(health, "content", []))
            try:
                health_payload = json.loads(health_text)
            except json.JSONDecodeError:
                health_payload = {}
            if getattr(health, "isError", False) or health_payload.get("status") != "ok":
                raise RuntimeError(f"MCP health_check failed: {health_text[:1000] or health}")
            print("MCP functional check: health_check is OK")
            if call_common_view:
                result = await session.call_tool("get_common_view", {"include": "tasks", "max_items_per_bucket": 1})
                if getattr(result, "isError", False):
                    raise RuntimeError(f"get_common_view failed: {result}")
                print("MCP functional check: get_common_view is OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=os.getenv("PRIMEFLOW_MCP_URL", "http://127.0.0.1:8010/sse"))
    parser.add_argument("--call-common-view", action="store_true")
    args = parser.parse_args()
    try:
        asyncio.run(check(args.url, args.call_common_view))
    except Exception as exc:
        print(f"MCP functional check failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print("MCP functional check OK: initialization, tools/list, health_check, get_common_view registration")


if __name__ == "__main__":
    main()
