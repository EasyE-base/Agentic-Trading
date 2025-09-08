import { BaseAgent } from "@interfaces";
import type { MCPMessage } from "@swarm/mcp-core";
import { bus, SafetySwitch, logAction } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";

type SignalAction = {
  actionType: "buy" | "sell" | "hold";
  asset: string;
  size: number;
  confidence: number;
  notes?: string;
};

type SentimentIndex = {
  asset: string;
  score: number;
  comparative: number;
  keywords: string[];
  source: string;
  timestamp: number;
};

type TrendState = {
  asset: string;
  smaShort: number;
  smaLong: number;
  macd: number;
  signal: number;
  histogram: number;
  direction: "bullish" | "bearish" | "neutral";
  timestamp: number;
};

type TradePlan = {
  asset: string;
  direction: "buy" | "sell";
  size: number;
  confidence: number;
  sources: string[];
  timestamp: number;
  explanation?: string;
};
import { explainTrade } from "./utils/llm";

export class StrategyAgent extends BaseAgent {
  private latestSignal: SignalAction | null = null;
  private latestSentiment: SentimentIndex | null = null;
  private latestTrend: TrendState | null = null;

  constructor() {
    super("strategy-agent", "strategy");
  }

  onSignal = async (msg: MCPMessage<SignalAction>) => {
    this.latestSignal = msg.payload;
    await this.generatePlan();
  };

  onSentiment = async (msg: MCPMessage<SentimentIndex>) => {
    this.latestSentiment = msg.payload;
  };

  onTrend = async (msg: MCPMessage<TrendState>) => {
    this.latestTrend = msg.payload;
  };

  async generatePlan(): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) return;
    const s = this.latestSignal;
    const m = this.latestSentiment;
    const t = this.latestTrend;
    if (!s || !m || !t) return;

    let buyScore = 0; let sellScore = 0; let totalWeight = 0; const reasons: string[] = [];
    // signal (weight 2)
    if (s.actionType === "buy") { buyScore += s.confidence * 2; totalWeight += 2; reasons.push(`Signal: Buy (confidence ${s.confidence.toFixed(2)})`); }
    if (s.actionType === "sell") { sellScore += s.confidence * 2; totalWeight += 2; reasons.push(`Signal: Sell (confidence ${s.confidence.toFixed(2)})`); }
    // sentiment (weight 1)
    if (m.score > 0) { buyScore += m.score; reasons.push(`Sentiment: Bullish (${m.score.toFixed(2)})`); }
    if (m.score < 0) { sellScore += Math.abs(m.score); reasons.push(`Sentiment: Bearish (${m.score.toFixed(2)})`); }
    totalWeight += 1;
    // trend (weight 1)
    if (t.direction === "bullish") { buyScore += 1; reasons.push(`Trend: Bullish`); }
    if (t.direction === "bearish") { sellScore += 1; reasons.push(`Trend: Bearish`); }
    totalWeight += 1;

    const netScore = buyScore - sellScore;
    let direction: "buy" | "sell" | "hold" = "hold";
    let confidence = Math.abs(netScore) / (totalWeight || 1);
    if (netScore > 1) direction = "buy"; else if (netScore < -1) direction = "sell";
    if (direction === "hold") return;

    const explanation = await explainTrade({ asset: s.asset, direction, confidence, sources: reasons }).catch(() => "");
    const plan: TradePlan = {
      asset: s.asset,
      direction,
      size: 100,
      confidence,
      sources: reasons,
      timestamp: Date.now(),
      explanation,
    };

    const planMsg: MCPMessage<TradePlan> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "trade_plan_drafts",
      timestamp: Date.now(),
      payload: plan,
    };
    logAction(this.id, planMsg);
    bus.publish(planMsg);
    console.log("\ud83d\udcca StrategyAgent: Published Trade Plan", plan);
  }
}


