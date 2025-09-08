import asyncio
from typing import List, Dict
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient

class ExecutionAgent(BaseAgent):
    def __init__(self, config: AgentConfig, threshold: float) -> None:
        super().__init__(config, HttpMCPClient(get_host_base(), "noop"))
        self.threshold = threshold
        host = get_host_base()
        self.md = HttpMCPClient(host, "market-data")
        self.fs = HttpMCPClient(host, "feature-store")

    async def tick(self) -> None:
        ohlcv = await self.md.call("market-data.get_ohlcv", {"symbol":"AAPL","start":"2024-01-01","end":"2024-01-10","interval":"1d"})
        prices = [{"ts": r["ts"], "price": r["close"]} for r in ohlcv["rows"]]
        last = prices[0]["price"]
        cash = 0.0
        position = 0
        orders: List[Dict] = []
        for p in prices:
            delta = p["price"] - last
            if delta > self.threshold:
                # BUY 1 unit
                orders.append({"ts": p["ts"], "side": "BUY", "price": p["price"]})
                position += 1
                cash -= p["price"]
            elif delta < -self.threshold and position > 0:
                # SELL 1 unit
                orders.append({"ts": p["ts"], "side": "SELL", "price": p["price"]})
                position -= 1
                cash += p["price"]
            last = p["price"]
        # mark to market
        if prices:
            cash += position * prices[-1]["price"]
        # write orders as features
        rows = [
            {"ts": o["ts"], "symbol": "AAPL", "feature_set": "orders_sim", "feature_name": o["side"].lower(), "value": o["price"], "ver": "v1"}
            for o in orders
        ]
        if rows:
            await self.fs.call("feature-store.write_features", {"feature_set": "orders_sim", "rows": rows})
        # write analytics stat
        try:
            analytics = HttpMCPClient(get_host_base(), "analytics")
            import os, uuid
            corr = os.environ.get("TRACE_ID") or str(uuid.uuid4())
            # pick last timestamp if exists else now
            ts = rows[-1]["ts"] if rows else "2024-01-10T00:00:00.000Z"
            await analytics.call("analytics.write_exec_stat", {"ts": ts, "symbol": "AAPL", "orders_count": len(orders), "pnl": float(round(cash, 2)), "trace_id": corr})
        except Exception:
            pass
        print({"orders": len(orders), "pnl": round(cash, 2)})
        self.stop()

async def main():
    agent = ExecutionAgent(AgentConfig(name="execution-agent", heartbeat_seconds=5), threshold=0.2)
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())
