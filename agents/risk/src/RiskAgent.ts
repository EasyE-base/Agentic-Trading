import { BaseAgent } from "@interfaces";
import type { MCPMessage } from "@swarm/mcp-core";
import { bus, SafetySwitch, Compliance, logAction } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";

type TradePlan = {
  asset: string;
  direction: "buy" | "sell";
  size: number;
  confidence: number;
  sources: string[];
  timestamp: number;
};

type ApprovedTrade = TradePlan & {
  approvedBy: string;
  approvalTime: number;
};

type RejectionFeedback = {
  reason: string;
  plan: TradePlan;
  rejectedBy: string;
  timestamp: number;
  suggestion?: Partial<TradePlan>;
  explanation?: string;
};

export class RiskAgent extends BaseAgent {
  private portfolio: Record<string, number> = {};
  constructor() {
    super("risk-agent", "risk");
  }

  async onTradePlan(msg: MCPMessage<TradePlan>): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) {
      console.warn("🛑 RiskAgent is frozen. Skipping trade eval.");
      return;
    }
    const plan = msg.payload;

    if (!Compliance.isAssetAllowed(plan.asset) || !Compliance.isTradeLegal(this.id, plan.asset)) {
      this.reject(plan, "Compliance violation");
      return;
    }

    const evalRes = this.evaluateRisk(plan);
    if (!evalRes.allowed) {
      const explanation = await explainRejection(evalRes.reason!, evalRes.suggestion).catch(() => "");
      const feedback: RejectionFeedback = { reason: evalRes.reason!, plan, rejectedBy: this.id, timestamp: Date.now(), suggestion: evalRes.suggestion, explanation };
      const rejMsg: MCPMessage<RejectionFeedback> = { id: uuidv4(), sender: this.id, role: this.role, topic: "rejected_trades", timestamp: Date.now(), payload: feedback };
      logAction(this.id, rejMsg);
      bus.publish(rejMsg);
      console.warn("❌ RiskAgent: Rejected Trade", feedback);
      return;
    }

    const approved: ApprovedTrade = { ...plan, approvedBy: this.id, approvalTime: Date.now() };
    const message: MCPMessage<ApprovedTrade> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "approved_trades",
      timestamp: Date.now(),
      payload: approved,
    };
    logAction(this.id, message);
    bus.publish(message);
    console.log("✅ RiskAgent: Trade Approved", approved);
  }

  private reject(plan: TradePlan, reason: string, suggestion?: Partial<TradePlan>, explanation?: string) {
    const feedback: RejectionFeedback = { reason, plan, rejectedBy: this.id, timestamp: Date.now(), suggestion, explanation };
    const message: MCPMessage<RejectionFeedback> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "rejected_trades",
      timestamp: Date.now(),
      payload: feedback,
    };
    bus.publish(message);
    console.warn("❌ RiskAgent: Rejected Trade", feedback);
  }

  private evaluateRisk(plan: TradePlan): { allowed: boolean; reason?: string; suggestion?: Partial<TradePlan> } {
    const current = this.portfolio[plan.asset] || 0;
    const baseMax = 500;
    const volAdj = Number(process.env.RISK_VOL_ADJ || 1);
    const maxSize = Math.floor(baseMax / Math.max(0.5, volAdj));
    if (Math.abs(current + plan.size) > maxSize) {
      return { allowed: false, reason: `Trade would exceed position limit of ${maxSize} shares.`, suggestion: { size: Math.max(0, maxSize - Math.abs(current)) } };
    }
    if (plan.confidence < 0.35) {
      return { allowed: false, reason: `Confidence too low (${plan.confidence.toFixed(2)}).`, suggestion: { size: Math.floor(plan.size * 0.5) } };
    }
    return { allowed: true };
  }
}


