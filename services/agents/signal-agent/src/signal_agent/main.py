import asyncio
from typing import List
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient
from swarm_agent_sdk.schemas import SignalScore

def rsi(values: List[float], period: int = 5) -> float:
    if len(values) < period + 1:
        return 50.0
    gains = []
    losses = []
    for i in range(1, period + 1):
        delta = values[-i] - values[-i-1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period if sum(losses) > 0 else 1e-9
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def sma(values: List[float], period: int) -> float:
    if len(values) < period:
        return sum(values) / max(len(values), 1)
    return sum(values[-period:]) / period

class SignalAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        md = HttpMCPClient(host, "market-data")
        fs = HttpMCPClient(host, "feature-store")
        bus = HttpMCPClient(host, "bus")
        ohlcv = await md.call("market-data.get_ohlcv", {"symbol":"AAPL","start":"2024-01-01","end":"2024-01-15","interval":"1d"})
        closes = [r["close"] for r in ohlcv["rows"]]
        ts = ohlcv["rows"][-1]["ts"]
        rsi5 = rsi(closes, 5)
        sma5 = sma(closes, 5)
        sma10 = sma(closes, 10)
        slope = sma5 - sma10
        # Simple composite score in [-1,1]
        rsi_norm = (rsi5 - 50.0) / 50.0
        slope_norm = max(min(slope / max(closes[-1], 1e-9), 1.0), -1.0)
        score_val = float(max(min(0.7 * rsi_norm + 0.3 * slope_norm, 1.0), -1.0))
        sig = SignalScore(symbol="AAPL", ts=ts, strategy="rsi_sma_combo", score=score_val, features={"rsi5": float(rsi5), "sma5": float(sma5), "sma10": float(sma10)}).model_dump()
        await bus.call("bus.publish", {"topic": "signals.rsi_sma", "payload": sig})
        # Also persist as feature for demo
        rows = [
            {"ts": ts, "symbol": "AAPL", "feature_set": "signals_demo", "feature_name": "rsi5", "value": float(rsi5), "ver": "v1"},
            {"ts": ts, "symbol": "AAPL", "feature_set": "signals_demo", "feature_name": "score", "value": float(score_val), "ver": "v1"},
        ]
        await fs.call("feature-store.write_features", {"feature_set": "signals_demo", "rows": rows})
        print({"signal": sig})
        self.stop()

async def main():
    agent = SignalAgent(AgentConfig(name="signal-agent", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())




