from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
import asyncio
from .client import MCPClient

class AgentConfig(BaseModel):
    name: str
    version: str = "0.1.0"
    description: Optional[str] = None
    heartbeat_seconds: int = Field(default=30, ge=5, le=600)

class BaseAgent:
    def __init__(self, config: AgentConfig, client: MCPClient) -> None:
        self.config = config
        self.client = client
        self._stop_event = asyncio.Event()

    async def setup(self) -> None:
        """Override to prepare resources."""
        return None

    async def tick(self) -> None:
        """Override with agent unit of work; called in a loop."""
        raise NotImplementedError

    async def run(self) -> None:
        await self.setup()
        try:
            while not self._stop_event.is_set():
                await self.tick()
                await asyncio.sleep(self.config.heartbeat_seconds)
        except asyncio.CancelledError:
            pass

    def stop(self) -> None:
        self._stop_event.set()
