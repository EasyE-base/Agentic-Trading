import { SentimentAgent } from "./SentimentAgent";
import { bus } from "@swarm/mcp-core";
import type { MCPMessage } from "@swarm/mcp-core";

async function main() {
  const agent = new SentimentAgent();
  await agent.init();

  bus.subscribe("news_feed_texts", async (msg: MCPMessage<any>) => {
    await agent.onText(msg.payload);
  });

  const headlines = [
    "Apple announces groundbreaking new AI chip",
    "Tesla stock plummets after earnings miss expectations",
    "Federal Reserve hints at interest rate pause",
    "Massive layoffs shake major tech firms",
    "Bitcoin surges past $30K on ETF optimism"
  ];

  setInterval(() => {
    const headline = headlines[Math.floor(Math.random() * headlines.length)];
    const textMessage: MCPMessage<any> = {
      id: crypto.randomUUID(),
      sender: "news-scraper",
      role: "sentiment",
      topic: "news_feed_texts",
      timestamp: Date.now(),
      payload: {
        source: "HeadlineStream",
        text: headline,
        asset: "AAPL",
        timestamp: Date.now()
      }
    };
    bus.publish(textMessage);
  }, 3000);
}

main();


