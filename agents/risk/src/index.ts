import { RiskAgent } from "./RiskAgent";
import { bus } from "@swarm/mcp-core";

async function main() {
  const agent = new RiskAgent();
  await agent.init();
  bus.subscribe("trade_plan_drafts", async (msg) => {
    await agent.onTradePlan(msg as any);
  });
}

main();


