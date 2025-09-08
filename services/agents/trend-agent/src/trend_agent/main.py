import asyncio
from typing import List
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient
from swarm_agent_sdk.schemas import TrendState

def momentum(values: List[float], lookback: int = 3) -> float:
    if len(values) < lookback + 1:
        return 0.0
    return values[-1] - values[-1 - lookback]

def regime(values: List[float], window: int = 5) -> str:
    if len(values) < window + 1:
        return "neutral"
    diffs = [values[i] - values[i-1] for i in range(-window+1, 0)]
    s = sum(1 for d in diffs if d > 0) - sum(1 for d in diffs if d < 0)
    if s >= 2:
        return "UP"
    if s <= -2:
        return "DOWN"
    return "SIDEWAYS"

class TrendAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        md = HttpMCPClient(host, "market-data")
        fs = HttpMCPClient(host, "feature-store")
        bus = HttpMCPClient(host, "bus")
        ohlcv = await md.call("market-data.get_ohlcv", {"symbol":"AAPL","start":"2024-01-01","end":"2024-01-15","interval":"1d"})
        closes = [r["close"] for r in ohlcv["rows"]]
        mom = momentum(closes, 3)
        reg = regime(closes, 5)
        ts = ohlcv["rows"][-1]["ts"]
        rows = [
            {"ts": ts, "symbol": "AAPL", "feature_set": "trend_demo", "feature_name": "momentum3", "value": float(mom), "ver": "v1"},
            {"ts": ts, "symbol": "AAPL", "feature_set": "trend_demo", "feature_name": f"regime_{reg}", "value": 1.0, "ver": "v1"},
        ]
        await fs.call("feature-store.write_features", {"feature_set": "trend_demo", "rows": rows})
        trend = TrendState(symbol="AAPL", ts=ts, regime=reg, slope=float(mom), strength=None).model_dump()
        await bus.call("bus.publish", {"topic": "trends.state", "payload": trend})
        print({"trend": trend})
        self.stop()

async def main():
    agent = TrendAgent(AgentConfig(name="trend-agent", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())




