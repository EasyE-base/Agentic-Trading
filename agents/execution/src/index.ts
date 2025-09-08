import { ExecutionAgent } from "./ExecutionAgent";
import { bus } from "@swarm/mcp-core";
import type { MCPMessage } from "@swarm/mcp-core";
import type { ExecReport } from "./brokers/IBroker";
import { SimBroker } from "./brokers/SimBroker";

async function main() {
  const agent = new ExecutionAgent();
  await agent.init();
  bus.subscribe("approved_trades", async (msg) => {
    await agent.onApprovedTrade(msg as any);
  });
  // Operator control: cancel all (sim example)
  bus.subscribe("execution_controls", async (msg: MCPMessage<any>) => {
    const cmd = (msg.payload?.cmd || "").toLowerCase();
    if (cmd === "cancel_all") {
      // SimBroker keeps state; for demo we recreate and ignore; real broker would track IDs
      console.log("🛑 ExecutionAgent: cancel_all requested (sim broker)");
    }
  });
}

main();


