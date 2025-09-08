import asyncio
from swarm_agent_sdk import MCPClient, BaseAgent, AgentConfig

class ExampleAgent(BaseAgent):
    async def setup(self) -> None:
        self.client.register_tool("telemetry.log", lambda p: print(f"[telemetry] {p}"))

    async def tick(self) -> None:
        await self.client.call("telemetry.log", {"level": "info", "msg": "heartbeat", "agent": self.config.name})

async def main():
    client = MCPClient()
    agent = ExampleAgent(AgentConfig(name="base-agent"), client)
    await agent.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
