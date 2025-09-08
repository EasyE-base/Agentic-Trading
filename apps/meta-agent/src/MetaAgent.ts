import type { MCPMessage } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";
import { init, update, type AgentStats } from "./metrics/rollups";

type Exec = { tradeId:string; asset:string; direction:"buy"|"sell"; size:number; avgPrice:number; slippageBps:number; latencyMs:number; eqs:number; status:string; };
type Reward = { agent:string; tradeId:string; profitLoss:number; metrics:Record<string,number>; };
type Plan  = { asset:string; direction:"buy"|"sell"; confidence:number; sources:string[]; explanation?:string; };

const stats: Record<string, AgentStats> = {};
const lastPlans: Plan[] = [];
function get(agent:string){ return (stats[agent] ??= init()); }

export class MetaAgent {
  constructor(public id = "meta-agent") {}

  start() {
    bus.subscribe("execution_result", (msg: MCPMessage<Exec>) => this.onExec(msg.payload));
    bus.subscribe("reward", (msg: MCPMessage<Reward>) => this.onReward(msg.payload));
    bus.subscribe("trade_plan_drafts", (msg: MCPMessage<Plan>) => lastPlans.push(msg.payload));

    setInterval(() => this.publishLeaderboard(), 15_000);
    setInterval(() => this.emitTuningHints(), 30_000);
    setInterval(() => this.emitOpsSummary(), 60_000);
  }

  onExec(x: Exec) {
    if (x.slippageBps > 20) this.opsNote(`High slippage on ${x.asset} (${x.slippageBps} bps). Consider LMT/TWAP.`);
    if (x.latencyMs > 20_000) this.opsNote(`High latency on ${x.asset} (${Math.round(x.latencyMs)}ms). Check routing.`);
    update(get("execution-agent"), { eqs: x.eqs, latency: x.latencyMs, slippage: x.slippageBps });
  }

  onReward(r: Reward) {
    const isWin = r.profitLoss > 0;
    update(get(r.agent), { pnl: r.profitLoss, win: isWin, eqs: r.metrics.eqs, latency: r.metrics.latency, slippage: r.metrics.slippageBps });
  }

  publishLeaderboard() {
    const board = Object.entries(stats)
      .map(([agent,s])=>({agent, pnl:+s.pnl.toFixed(2), winRate:+(s.winRate*100).toFixed(1), eqs:+s.avgEQS.toFixed(2)}))
      .sort((a,b)=> b.pnl - a.pnl);
    bus.publish({ id: uuidv4(), sender: this.id, role:"meta", topic:"meta_reports", timestamp:Date.now(), payload:{ type:"leaderboard", board }});
    console.log("🏆 Leaderboard:", board.slice(0,5));
  }

  emitTuningHints() {
    const strat = stats["strategy-agent"]; if (!strat || strat.trades < 5) return;
    const recent = lastPlans.slice(-10);
    const bullishSent = recent.filter(p=> p.sources.some(s=>s.startsWith("Sentiment: Bullish")));
    const bearishSent = recent.filter(p=> p.sources.some(s=>s.startsWith("Sentiment: Bearish")));
    const hint = (strat.winRate < 0.5 && bullishSent.length+bearishSent.length > 5)
      ? { component:"sentiment", action:"decrease_weight", delta:0.1, reason:"low win rate; sentiment overfitting suspected" }
      : { component:"trend", action:"increase_weight", delta:0.05, reason:"stable EQS & lower slippage during trend-following" };
    bus.publish({ id: uuidv4(), sender:this.id, role:"meta", topic:"tuning_hints", timestamp:Date.now(), payload: hint });
    console.log("🧪 Tuning Hint:", hint);
  }

  opsNote(text:string){ bus.publish({ id: uuidv4(), sender:this.id, role:"meta", topic:"ops_notes", timestamp:Date.now(), payload:{ note:text } }); }

  async emitOpsSummary(){
    const summary = Object.entries(stats).map(([a,s])=>`${a}: PnL ${s.pnl.toFixed(2)}, WR ${(s.winRate*100).toFixed(1)}%, EQS ${s.avgEQS.toFixed(2)}`);
    bus.publish({ id: uuidv4(), sender:this.id, role:"meta", topic:"meta_reports", timestamp:Date.now(), payload:{ type:"summary", summary }});
    try {
      const { summarizePeriod } = await import("./utils/llm");
      const bullets = await summarizePeriod(summary);
      this.opsNote(`Summary:\n${bullets}`);
    } catch {}
  }
}


