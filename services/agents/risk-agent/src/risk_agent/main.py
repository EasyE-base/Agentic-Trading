import asyncio
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient

class RiskAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        risk = HttpMCPClient(host, "risk-engine")
        broker = HttpMCPClient(host, "broker-gateway")
        # demo proposal
        proposal = {"symbol":"AAPL","side":"BUY","qty":1,"price":100,"limits":{"maxGross":100000,"maxSingle":10000},"current":[]}
        decision = await risk.call("risk-engine.pretrade_check", proposal)
        order = None
        if decision.get("status") == "APPROVED":
            order = await broker.call("broker-gateway.submit_order", {"symbol":"AAPL","side":"BUY","qty":1})
        positions = await broker.call("broker-gateway.get_positions", {})
        fills = await broker.call("broker-gateway.get_fills", {})
        print({"risk_decision": decision, "order": order, "positions": positions, "fills": fills})
        self.stop()

async def main():
    agent = RiskAgent(AgentConfig(name="risk-agent", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())


