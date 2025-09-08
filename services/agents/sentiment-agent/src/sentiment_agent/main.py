import asyncio
from swarm_agent_sdk import BaseAgent, AgentConfig, get_host_base
from swarm_agent_sdk.client import HttpMCPClient
from swarm_agent_sdk.schemas import SentimentIndex

class SentimentAgent(BaseAgent):
    async def tick(self) -> None:
        host = get_host_base()
        nlp = HttpMCPClient(host, "nlp-sentiment")
        fs = HttpMCPClient(host, "feature-store")
        bus = HttpMCPClient(host, "bus")
        res = await nlp.call("nlp-sentiment.score_texts", {"provider":"stub","items":[{"id":"n1","text":"NVDA upgraded by analyst, strong outlook"},{"id":"n2","text":"CEO resigns unexpectedly, guidance cut"}]})
        # aggregate average score as daily sentiment for a symbol demo
        scores = [s["score"] for s in res["scores"]]
        avg = sum(scores)/len(scores) if scores else 0.0
        ts = "2024-01-15T00:00:00.000Z"
        row = {"ts": ts, "symbol": "NVDA", "feature_set": "sentiment_demo", "feature_name": "avg_stub", "value": float(avg), "ver": "v1"}
        sent = SentimentIndex(symbol="NVDA", ts=ts, polarity=float(avg), confidence=1.0, sources=["stub"]).model_dump()
        await fs.call("feature-store.write_features", {"feature_set": "sentiment_demo", "rows": [row]})
        await bus.call("bus.publish", {"topic": "sentiment_data_stream", "payload": sent})
        print({"sentiment": sent, "published": True})
        self.stop()

async def main():
    agent = SentimentAgent(AgentConfig(name="sentiment-agent", heartbeat_seconds=5), HttpMCPClient(get_host_base(), "noop"))
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())




