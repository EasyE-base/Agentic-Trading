import { BaseAgent } from "@interfaces";
import type { Action, Observation, MCPMessage } from "@swarm/mcp-core";
import { bus, createDriftMonitor, updateDrift, logAction, SafetySwitch } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";
import { RSI, MACD, BollingerBands, EMA, VWAP } from "technicalindicators";
import { classifyMarketSignal } from "./utils/llm";

type EnsembleFeatures = {
  rsi14?: number;
  macd?: number;
  macdSignal?: number;
  bbPos?: number;
  ema9?: number;
  ema21?: number;
  emaCross?: number;
  volume?: number;
  volumeZ?: number;
};

export class SignalAgent extends BaseAgent {
  private prices: number[] = [];
  private volumes: number[] = [];
  private highs: number[] = [];
  private lows: number[] = [];
  private closes: number[] = [];
  private candles: Array<{ high: number; low: number; close: number; volume: number }> = [];
  private lastObImb: number = 0;
  private drift = createDriftMonitor();

  constructor() {
    super("signal-agent", "signal");
  }

  async onObservation(obs: Observation): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) return;
    await super.onObservation(obs);
    const price = obs.metrics["price"] as number | undefined;
    const volume = obs.metrics["volume"] as number | undefined;
    let high = obs.metrics["high"] as number | undefined;
    let low = obs.metrics["low"] as number | undefined;
    let close = obs.metrics["close"] as number | undefined;
    if (typeof price !== "number") return;
    if (typeof close !== "number") close = price;
    if (typeof high !== "number") high = Math.max(close, this.closes[this.closes.length - 1] ?? close);
    if (typeof low !== "number") low = Math.min(close, this.closes[this.closes.length - 1] ?? close);

    this.prices.push(price);
    if (typeof volume === "number") this.volumes.push(volume);
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);
    this.candles.push({ high, low, close, volume: volume ?? 0 });

    const maxLen = 200;
    if (this.prices.length > maxLen) this.prices.shift();
    if (this.volumes.length > maxLen) this.volumes.shift();
    if (this.highs.length > maxLen) this.highs.shift();
    if (this.lows.length > maxLen) this.lows.shift();
    if (this.closes.length > maxLen) this.closes.shift();
    if (this.candles.length > maxLen) this.candles.shift();

    const bidSz = obs.metrics["bid_size"];
    const askSz = obs.metrics["ask_size"];
    if (typeof bidSz === "number" && typeof askSz === "number" && bidSz + askSz > 0) {
      this.lastObImb = clamp((bidSz - askSz) / (bidSz + askSz), -1, 1);
    }
  }

  async generateAction(): Promise<Action | null> {
    if (this.closes.length < 30) return null;
    const lastPrice = this.closes[this.closes.length - 1];
    // Indicators
    const rsi14 = last(RSI.calculate({ values: this.closes, period: 14 }));
    const macdRes = last(MACD.calculate({ values: this.closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }));
    const bbRes = last(BollingerBands.calculate({ period: 20, values: this.closes, stdDev: 2 }));
    const ema9 = last(EMA.calculate({ period: 9, values: this.closes }));
    const ema21 = last(EMA.calculate({ period: 21, values: this.closes }));
    const ema12 = last(EMA.calculate({ period: 12, values: this.closes })) ?? 0;
    const ema26 = last(EMA.calculate({ period: 26, values: this.closes })) ?? 0;

    if (typeof rsi14 !== "number" || !macdRes || !bbRes || typeof ema9 !== "number" || typeof ema21 !== "number") return null;

    // Feature engineering → [-1, 1]
    const rsiFeature = clamp((50 - rsi14) / 50, -1, 1) * -1; // bullish when RSI < 50
    const macdDiff = macdRes.MACD - macdRes.signal;
    const macdFeature = clamp(tanh(macdDiff / (lastPrice * 0.01)), -1, 1);
    const bbWidth = Math.max(bbRes.upper - bbRes.lower, 1e-9);
    const bbPos = clamp((lastPrice - bbRes.middle) / (bbWidth / 2), -1, 1); // <0 near lower band → bullish
    const emaCross = clamp(tanh(((ema9 - ema21) / Math.max(lastPrice, 1e-9)) * 10), -1, 1);
    let volumeZ = 0;
    if (this.volumes.length >= 20) volumeZ = zscore(this.volumes.slice(-20));
    const vwapArr = VWAP.calculate({ close: this.closes, high: this.highs, low: this.lows, volume: this.volumes });
    const vwap20 = last(vwapArr) ?? vwap(this.closes.slice(-20), this.volumes.slice(-20));
    const vwapFeature = isFinite(vwap20) && lastPrice > 0 ? clamp((lastPrice - vwap20) / (lastPrice * 0.01), -1, 1) : 0; // 1% bands

    const features: EnsembleFeatures = {
      rsi14,
      macd: macdRes.MACD,
      macdSignal: macdRes.signal,
      bbPos,
      ema9,
      ema21,
      emaCross,
      volume: this.volumes[this.volumes.length - 1],
      volumeZ,
    };

    // Rule-based composite score + reasons (for interpretability)
    let ruleScore = 0; const reasons: string[] = [];
    const rsiVal = rsi14 ?? 50;
    if (rsiVal < 30) { ruleScore += 1; reasons.push("RSI Oversold"); }
    else if (rsiVal > 70) { ruleScore -= 1; reasons.push("RSI Overbought"); }
    if (macdRes && macdRes.MACD > macdRes.signal) { ruleScore += 1; reasons.push("MACD Bullish"); }
    else if (macdRes && macdRes.MACD < macdRes.signal) { ruleScore -= 1; reasons.push("MACD Bearish"); }
    if (ema12 > ema26) { ruleScore += 1; reasons.push("EMA Bullish Cross"); }
    else if (ema12 < ema26) { ruleScore -= 1; reasons.push("EMA Bearish Cross"); }
    if (bbRes && lastPrice > bbRes.upper) { ruleScore -= 1; reasons.push("Above Bollinger Upper Band"); }
    else if (bbRes && lastPrice < bbRes.lower) { ruleScore += 1; reasons.push("Below Bollinger Lower Band"); }
    if (lastPrice > vwap20) { ruleScore += 0.5; reasons.push("Above VWAP"); }
    else { ruleScore -= 0.5; reasons.push("Below VWAP"); }

    // Weights (env overrides optional)
    const weights = await this.getWeights();
    const { wRSI, wMACD, wBB, wEMA, wVOL, wLLM, wVWAP, wOBI } = weights;

    // Deterministic ensemble
    const deterministicScore =
      wRSI * rsiFeature +
      wMACD * macdFeature +
      wBB * (-bbPos) + // below middle = bullish
      wEMA * emaCross +
      wVOL * clamp(volumeZ / 3, -1, 1) +
      wVWAP * vwapFeature +
      wOBI * this.lastObImb;

    // LLM meta-signal (optional)
    const llmPayload = {
      asset: "AAPL",
      indicators: {
        rsi: rsi14,
        macd: macdRes.MACD,
        macdSignal: macdRes.signal,
        ema12,
        ema26,
        bollinger: { upper: bbRes.upper, lower: bbRes.lower },
        vwap: vwap20,
        price: lastPrice,
      }
    };
    const llm = await classifyMarketSignal(llmPayload).catch(() => null);
    const metaScore = llm ? (llm.bias === 'bullish' ? 1 : llm.bias === 'bearish' ? -1 : 0) * Math.min(1, Math.max(0, llm.confidence)) : 0;

    const totalScore = clamp(deterministicScore + wLLM * metaScore, -1, 1);
    let actionType: "buy" | "sell" | "hold" = totalScore > 0.25 ? "buy" : totalScore < -0.25 ? "sell" : "hold";
    // Use rule-based decision if decisive
    if (ruleScore >= 2) actionType = "buy"; else if (ruleScore <= -2) actionType = "sell";
    if (actionType === "hold") return null;

    // Drift check on RSI
    if (updateDrift(this.drift, rsi14)) {
      console.warn("📉 RSI drift detected");
    }

    let confidence = Math.min(1, Math.max(Math.abs(totalScore), Math.abs(ruleScore) / 5));
    if (llm && ((llm.bias === actionType && llm.confidence > 0.5) || (llm.bias === 'neutral' && confidence < 0.4))) {
      confidence = Math.min(1, (confidence + llm.confidence) / 2);
    }
    const action: Action = {
      actionType,
      asset: "AAPL",
      size: 100,
      confidence,
      notes: (reasons.join(", ") + (llm ? ` | LLM: ${llm.reasoning}` : "")) || `score=${totalScore.toFixed(3)} rsi=${(rsi14??0).toFixed(1)}`,
    };

    // Publish action
    const actionMsg: MCPMessage<Action> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "signal_actions",
      timestamp: Date.now(),
      payload: action,
    };
    logAction(this.id, actionMsg);
    bus.publish(actionMsg);

    // Publish SignalScore details (observability)
    const detailsMsg: MCPMessage<any> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "signals.ensemble",
      timestamp: Date.now(),
      payload: {
        asset: "AAPL",
        score: totalScore,
        deterministicScore,
        metaScore,
        weights: { rsi: wRSI, macd: wMACD, bb: wBB, ema: wEMA, vol: wVOL, vwap: wVWAP, obi: wOBI, llm: wLLM },
        features: { ...features, vwapFeature, orderbookImbalance: this.lastObImb },
      },
    };
    logAction(this.id, detailsMsg);
    bus.publish(detailsMsg);
    return action;
  }

  private async metaSignal(ind: { rsi14: number; macdDiff: number; bbPos: number; emaCross: number; volumeZ: number }): Promise<{ score: number } | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) return null;
    try {
      const body = {
        model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
        max_tokens: 64,
        system: 'You are a trading microstructure classifier. Classify short-term direction as bullish, bearish, or neutral with confidence 0..1 from compact indicators.',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: `Indicators: ${JSON.stringify(ind)}\nReturn JSON: {"class":"bullish|bearish|neutral","confidence":0..1}` }]
          }
        ]
      } as any;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`claude ${res.status}`);
      const data: any = await res.json();
      const text: string = data?.content?.[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      if (!parsed) return null;
      const cls = String(parsed.class || parsed.label || 'neutral').toLowerCase();
      const conf = Number(parsed.confidence ?? 0.5);
      const dir = cls.includes('bull') ? 1 : cls.includes('bear') ? -1 : 0;
      return { score: clamp(dir * conf, -1, 1) };
    } catch (e) {
      console.warn('LLM meta-signal failed', e);
      return null;
    }
  }

  private async getWeights(): Promise<{ wRSI: number; wMACD: number; wBB: number; wEMA: number; wVOL: number; wVWAP: number; wOBI: number; wLLM: number }> {
    try {
      const host = process.env.HOST_URL || 'http://localhost:4000';
      const res = await fetch(`${host}/call/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'config.get', input: { key: 'signal.weights' } }) });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const v = (j && j.value) || {};
      return {
        wRSI: num(v.rsi, envFloat('SIGNAL_W_RSI', 0.25)),
        wMACD: num(v.macd, envFloat('SIGNAL_W_MACD', 0.25)),
        wBB: num(v.bb, envFloat('SIGNAL_W_BB', 0.15)),
        wEMA: num(v.ema, envFloat('SIGNAL_W_EMA', 0.2)),
        wVOL: num(v.vol, envFloat('SIGNAL_W_VOL', 0.05)),
        wVWAP: num(v.vwap, envFloat('SIGNAL_W_VWAP', 0.05)),
        wOBI: num(v.obi, envFloat('SIGNAL_W_OBI', 0.05)),
        wLLM: num(v.llm, envFloat('SIGNAL_W_LLM', 0.1)),
      };
    } catch {
      return {
        wRSI: envFloat('SIGNAL_W_RSI', 0.25),
        wMACD: envFloat('SIGNAL_W_MACD', 0.25),
        wBB: envFloat('SIGNAL_W_BB', 0.15),
        wEMA: envFloat('SIGNAL_W_EMA', 0.2),
        wVOL: envFloat('SIGNAL_W_VOL', 0.05),
        wVWAP: envFloat('SIGNAL_W_VWAP', 0.05),
        wOBI: envFloat('SIGNAL_W_OBI', 0.05),
        wLLM: envFloat('SIGNAL_W_LLM', 0.1),
      };
    }
  }
}


function last<T>(arr: T[]): T | undefined { return arr[arr.length - 1]; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function tanh(x: number): number { const e2x = Math.exp(2 * x); return (e2x - 1) / (e2x + 1); }
function zscore(vals: number[]): number {
  const n = vals.length; if (!n) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n) || 1;
  return (vals[n - 1] - mean) / sd;
}
function envFloat(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const f = Number(v);
  return Number.isFinite(f) ? f : def;
}
function num(v: any, d: number): number { const n = Number(v); return Number.isFinite(n) ? n : d; }

