export type StatKey = "pnl"|"trades"|"win"|"loss"|"eqsSum"|"latencySum"|"slippageSum";
export type AgentStats = Record<StatKey, number> & { winRate: number; avgLatency: number; avgSlippage: number; avgEQS: number };

export function init(): AgentStats {
  return { pnl:0, trades:0, win:0, loss:0, eqsSum:0, latencySum:0, slippageSum:0, winRate:0, avgLatency:0, avgSlippage:0, avgEQS:0 };
}

export function update(s: AgentStats, delta: {pnl?:number; win?:boolean; eqs?:number; latency?:number; slippage?:number}) {
  if (delta.pnl!==undefined) s.pnl += delta.pnl;
  if (delta.win!==undefined) { s.trades++; delta.win ? s.win++ : s.loss++; }
  if (delta.eqs!==undefined) s.eqsSum += delta.eqs;
  if (delta.latency!==undefined) s.latencySum += delta.latency;
  if (delta.slippage!==undefined) s.slippageSum += delta.slippage;

  s.winRate = s.trades ? s.win / s.trades : 0;
  s.avgLatency = s.trades ? s.latencySum / s.trades : 0;
  s.avgSlippage = s.trades ? s.slippageSum / s.trades : 0;
  s.avgEQS = s.trades ? s.eqsSum / s.trades : 0;
}


