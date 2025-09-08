import { SignalAgent } from "./SignalAgent";
import type { Observation, MCPMessage } from "@swarm/mcp-core";
import { bus } from "@swarm/mcp-core";

async function main() {
  const agent = new SignalAgent();
  await agent.init();

  bus.subscribe<Observation>("market_tick_stream", async (msg) => {
    await agent.onObservation(msg.payload);
    const action = await agent.generateAction();
    if (action) console.log("SignalAgent emitted:", action);
  });

  setInterval(() => {
    const price = 150 + Math.random() * 5;
    const obs: MCPMessage<Observation> = {
      id: crypto.randomUUID(),
      sender: "market-feed",
      role: "signal",
      topic: "market_tick_stream",
      timestamp: Date.now(),
      payload: {
        asset: "AAPL",
        timestamp: Date.now(),
        metrics: { price }
      }
    };
    bus.publish(obs);
  }, 1000);
}

main();


