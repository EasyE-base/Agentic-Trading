import { TrendAgent } from "./TrendAgent";
import { bus } from "@swarm/mcp-core";
import type { MCPMessage } from "@swarm/mcp-core";

async function main() {
  const agent = new TrendAgent();
  await agent.init();

  bus.subscribe("ohlcv_candles", async (msg: MCPMessage<any>) => {
    await agent.onCandle(msg.payload);
  });

  setInterval(() => {
    const candle = {
      open: 150 + Math.random(),
      high: 151 + Math.random(),
      low: 149 + Math.random(),
      close: 150 + Math.random() * 2 - 1,
      volume: 1000 + Math.random() * 100,
      timestamp: Date.now(),
    };
    const candleMsg: MCPMessage<any> = {
      id: crypto.randomUUID(),
      sender: "candle-feed",
      role: "trend",
      topic: "ohlcv_candles",
      timestamp: Date.now(),
      payload: candle,
    };
    bus.publish(candleMsg);
  }, 2000);
}

main();


