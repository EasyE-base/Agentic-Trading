import { BaseAgent } from "@interfaces";
import type { MCPMessage } from "@swarm/mcp-core";
import { bus, SafetySwitch, Compliance, logAction } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";
import { classifySentiment, LLMEnhancedSentiment } from "./utils/llm";
import Sentiment from "sentiment";

const sentiment = new Sentiment();

type TextObservation = {
  source: string;
  text: string;
  asset: string;
  timestamp: number;
};

type SentimentIndex = {
  asset: string;
  score: number;
  comparative: number;
  keywords: string[];
  source: string;
  timestamp: number;
};

export class SentimentAgent extends BaseAgent {
  constructor() {
    super("sentiment-agent", "sentiment");
  }

  async onText(obs: TextObservation): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) return;
    if (!Compliance.isTradeLegal(this.id, obs.asset)) {
      console.warn("🚫 Compliance violation: illegal sentiment-source trade");
      return;
    }
    const result = sentiment.analyze(obs.text);
    const score = result.score;
    const comparative = result.comparative as number;
    const keywords = (result.words || []) as string[];
    const llm: LLMEnhancedSentiment | null = await classifySentiment(obs.text).catch(() => null);

    const llmScore = llm ? (llm.sentiment === 'bullish' ? llm.confidence : llm.sentiment === 'bearish' ? -llm.confidence : 0) : 0;
    const blended = Math.max(Math.min((score / 10) * 0.4 + comparative * 0.2 + llmScore * 0.4, 1), -1);
    const sentimentIndex: SentimentIndex = {
      asset: obs.asset,
      score: blended,
      comparative: llm?.confidence ?? comparative,
      keywords: (llm?.topics && llm.topics.length ? llm.topics : keywords),
      source: obs.source,
      timestamp: obs.timestamp
    };

    const message: MCPMessage<SentimentIndex> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "sentiment_data_stream",
      timestamp: Date.now(),
      payload: sentimentIndex
    };

    logAction(this.id, { ...message, llm });
    bus.publish(message);
  }
}


