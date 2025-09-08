import { BaseAgent } from "@interfaces";
import type { MCPMessage } from "@swarm/mcp-core";
import { bus, SafetySwitch, Compliance, logAction } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";
import type { IBroker, SubmitOrder } from "./brokers/IBroker";
import { SimBroker } from "./brokers/SimBroker";
import { anomalousFillNote } from "./utils/llm";

type ApprovedTrade = {
  asset: string;
  direction: "buy" | "sell";
  size: number;
  confidence: number;
  sources: string[];
  approvalTime: number;
};

type ExecutionResult = {
  asset: string; direction: "buy" | "sell"; size: number;
  avgPrice: number; slippageBps: number; status: "filled"|"partial"|"rejected";
  fills: { qty: number; price: number; ts: number }[];
  executedAt: number; latencyMs: number; tradeId: string; eqs: number;
};

export class ExecutionAgent extends BaseAgent {
  private broker: IBroker = new SimBroker();
  constructor() { super("execution-agent", "execution"); }

  async onApprovedTrade(msg: MCPMessage<ApprovedTrade>): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) return;
    const trade = msg.payload;
    if (!Compliance.isAssetAllowed(trade.asset)) {
      console.error("🚫 Compliance violation: disallowed asset");
      return;
    }
    const now = Date.now();
    const orderType = (trade as any).orderType || (trade.confidence > 0.7 ? "MKT" : "TWAP");
    const o: SubmitOrder = {
      asset: trade.asset,
      side: trade.direction,
      qty: trade.size,
      type: orderType as any,
      limitPrice: (trade as any).limitPrice,
      ...((orderType === "TWAP" || orderType === "VWAP") ? { startMs: now, endMs: now + 1000 * ((trade as any).durationSec ?? 20) } : {})
    };
    const orderId = await this.broker.submit(o);
    let report = await this.broker.poll(orderId);
    const t0 = Date.now(); const TIMEOUT = 25_000;
    while (report.status === "partial" && Date.now() - t0 < TIMEOUT) {
      await new Promise(r => setTimeout(r, 1200));
      report = await this.broker.poll(orderId);
    }

    const eqs = this.scoreExecution(report.slippageBps, report.fills.length, Date.now() - trade.approvalTime);
    const result: ExecutionResult = {
      asset: trade.asset,
      direction: trade.direction,
      size: trade.size,
      avgPrice: report.avgPrice,
      slippageBps: report.slippageBps,
      status: report.status,
      fills: report.fills.map(f => ({ qty: f.qty, price: f.price, ts: f.ts })),
      executedAt: Date.now(),
      latencyMs: Date.now() - trade.approvalTime,
      tradeId: uuidv4(),
      eqs
    };

    const message: MCPMessage<ExecutionResult> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "execution_result",
      timestamp: Date.now(),
      payload: result,
    };
    logAction(this.id, message);
    bus.publish(message);
    console.log("📦 ExecutionAgent: ExecReport", result);

    // Optional anomaly note
    if (result.slippageBps > Number(process.env.EQS_NOTE_SLIP_BPS || 20)) {
      const note = await anomalousFillNote({ asset: result.asset, side: result.direction, avgPrice: result.avgPrice, slippageBps: result.slippageBps, parts: result.fills.length, type: (o.type as string) });
      if (note) {
        bus.publish({ id: uuidv4(), sender: this.id, role: this.role, topic: "ops_notes", timestamp: Date.now(), payload: { component: "execution", asset: result.asset, note } });
      }
    }

    const rewardMessage: MCPMessage<any> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "reward",
      timestamp: Date.now(),
      payload: {
        agent: "strategy-agent",
        tradeId: result.tradeId,
        profitLoss: 0,
        metrics: { slippageBps: result.slippageBps, latency: result.latencyMs, eqs },
      },
    };
    logAction(this.id, rewardMessage);
    bus.publish(rewardMessage);
  }

  private calculatePnL(direction: string, price: number): number {
    const entry = 150;
    return direction === "buy" ? price - entry : entry - price;
  }
}


