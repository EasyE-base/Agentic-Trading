import asyncio, statistics
from typing import List
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient

class StrategyBuilderAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        md = HttpMCPClient(host, "market-data")
        bt = HttpMCPClient(host, "backtester")
        risk = HttpMCPClient(host, "risk-engine")
        bus = HttpMCPClient(host, "bus")
        cfg = HttpMCPClient(host, "config")
        # fetch synthetic prices
        ohlcv = await md.call("market-data.get_ohlcv", {"symbol":"AAPL","start":"2024-01-01","end":"2024-01-10","interval":"1d"})
        prices = [{"ts": r["ts"], "price": r["close"]} for r in ohlcv["rows"]]
        # strategies as thresholds (fetch from config; fallback default)
        try:
            cfg_res = await cfg.call("config.get", {"key": "strategy.candidates"})
            candidates = cfg_res.get("value") or [0.2, 0.5, 1.0]
            if not isinstance(candidates, list):
                candidates = [0.2, 0.5, 1.0]
        except Exception:
            candidates = [0.2, 0.5, 1.0]
        reports = []
        for thr in candidates:
            res = await bt.call("backtester.run", {"prices": prices, "threshold": thr})
            reports.append((thr, res["pnl"]))
        best = max(reports, key=lambda t: t[1])
        # construct a simple proposal and call pretrade_check
        proposal = {"symbol":"AAPL","side":"BUY","qty":1,"price":prices[-1]["price"],"limits":{"maxGross":100000,"maxSingle":10000},"current":[]}
        decision = await risk.call("risk-engine.pretrade_check", proposal)
        draft = {
            "ts": prices[-1]["ts"],
            "symbol": "AAPL",
            "plan_id": "plan_demo",
            "action": "BUY",
            "qty": 1,
            "price": prices[-1]["price"],
            "score": float(best[1]),
            "risk_status": decision.get("status"),
        }
        await bus.call("bus.publish", {"topic": "trade_plan_drafts", "payload": draft})
        print({"candidates": reports, "chosen_threshold": best[0], "pnl": best[1], "risk": decision, "draft": draft})
        self.stop()

async def main():
    agent = StrategyBuilderAgent(AgentConfig(name="strategy-builder", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())
