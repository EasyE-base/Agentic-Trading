import asyncio
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient

class RoundtripAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        md = HttpMCPClient(host, "market-data")
        fs = HttpMCPClient(host, "feature-store")
        ohlcv = await md.call("market-data.get_ohlcv", {"symbol": "AAPL", "start": "2024-01-01", "end": "2024-01-03", "interval": "1d"})
        rows = [
            {"ts": r["ts"], "symbol": "AAPL", "feature_set": "demo", "feature_name": "close", "value": r["close"], "ver": "v1"}
            for r in ohlcv["rows"]
        ]
        res = await fs.call("feature-store.write_features", {"feature_set": "demo", "rows": rows})
        print({"wrote": res.get("wrote", 0)})
        self.stop()

async def main():
    agent = RoundtripAgent(AgentConfig(name="roundtrip-agent", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())
