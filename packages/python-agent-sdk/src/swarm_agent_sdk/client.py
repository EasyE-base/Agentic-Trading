from typing import Any, Dict, Optional, Callable
import asyncio
from dataclasses import dataclass
import json
import os

@dataclass
class Tool:
    name: str
    call: Callable[[Dict[str, Any]], Any]

class MCPClient:
    """Lightweight placeholder MCP client facade.

    Replace with real MCP client when available; this abstracts tool invocation.
    """

    def __init__(self, tool_registry: Optional[Dict[str, Tool]] = None) -> None:
        self._tools: Dict[str, Tool] = tool_registry or {}

    def register_tool(self, name: str, func: Callable[[Dict[str, Any]], Any]) -> None:
        self._tools[name] = Tool(name=name, call=func)

    async def call(self, tool_name: str, payload: Dict[str, Any]) -> Any:
        if tool_name not in self._tools:
            raise KeyError(f"Tool not found: {tool_name}")
        func = self._tools[tool_name].call
        if asyncio.iscoroutinefunction(func):
            return await func(payload)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: func(payload))
class HttpMCPClient(MCPClient):
    """HTTP client that talks to the MCP host router.

    host_base: e.g., http://localhost:4000
    service: e.g., "market-data" or "feature-store"
    """
    def __init__(self, host_base: str, service: str) -> None:
        super().__init__()
        self._host_base = host_base.rstrip('/')
        self._service = service

    async def call(self, tool_name: str, payload: Dict[str, Any]) -> Any:
        import httpx
        headers = {}
        # Optional agent metadata
        agent_id = os.environ.get("AGENT_ID")
        agent_role = os.environ.get("AGENT_ROLE")
        api_key = os.environ.get("API_KEY")
        trace_id = os.environ.get("TRACE_ID")
        if agent_id:
            headers["x-agent-id"] = agent_id
        if agent_role:
            headers["x-agent-role"] = agent_role
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"
        if trace_id:
            headers["x-correlation-id"] = trace_id
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{self._host_base}/call/{self._service}"
            resp = await client.post(url, headers=headers, json={"tool": tool_name, "input": payload})
            resp.raise_for_status()
            return resp.json()


def get_host_base(default: str = "http://localhost:4000"):
    """Return MCP host base URL from env HOST_URL or provided default.

    This central helper ensures agents consistently derive the host URL.
    """
    return os.environ.get("HOST_URL", default)
