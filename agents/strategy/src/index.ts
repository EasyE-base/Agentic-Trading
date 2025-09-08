import { StrategyAgent } from "./StrategyAgent";
import { bus } from "@swarm/mcp-core";
import type { MCPMessage } from "@swarm/mcp-core";

async function main() {
  const agent = new StrategyAgent();
  await agent.init();
  bus.subscribe("signal_actions", agent.onSignal);
  bus.subscribe("sentiment_data_stream", agent.onSentiment);
  bus.subscribe("trend_data_stream", agent.onTrend);
  bus.subscribe("tuning_hints", (msg: MCPMessage<any>) => {
    console.log("⚙️ StrategyAgent received tuning hint:", msg.payload);
    // here we would adjust config weights or call config.set
  });
}

main();


