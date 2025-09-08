import { BaseAgent } from "@interfaces";
import type { MCPMessage } from "@swarm/mcp-core";
import { bus, SafetySwitch, logAction } from "@swarm/mcp-core";
import { v4 as uuidv4 } from "uuid";
import { SMA, MACD, ADX, ATR } from "technicalindicators";
import { explainRegime } from "./utils/llm";

type PriceCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
};

export type TrendState = {
  asset: string;
  smaShort: number;
  smaLong: number;
  macd: number;
  signal: number;
  histogram: number;
  direction: "bullish" | "bearish" | "neutral";
  timestamp: number;
  regime?: "trending" | "ranging" | "volatile" | "stable";
  adx?: number;
  choppiness?: number;
  atr?: number;
  explanation?: string;
};

export class TrendAgent extends BaseAgent {
  private closes: number[] = [];
  private highs: number[] = [];
  private lows: number[] = [];

  constructor() {
    super("trend-agent", "trend");
  }

  async onCandle(candle: PriceCandle): Promise<void> {
    if (SafetySwitch.isKilled() || SafetySwitch.isFrozen(this.id)) return;
    this.closes.push(candle.close);
    this.highs.push(candle.high);
    this.lows.push(candle.low);
    if (this.closes.length > 200) { this.closes.shift(); this.highs.shift(); this.lows.shift(); }
    if (this.closes.length < 26) return;

    const smaShort = SMA.calculate({ period: 10, values: this.closes }).pop()!;
    const smaLong = SMA.calculate({ period: 30, values: this.closes }).pop()!;

    const macdRes = MACD.calculate({
      values: this.closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).pop();
    if (!macdRes) return;

    let direction: "bullish" | "bearish" | "neutral" = "neutral";
    if (smaShort > smaLong && macdRes.MACD > macdRes.signal) direction = "bullish";
    else if (smaShort < smaLong && macdRes.MACD < macdRes.signal) direction = "bearish";

    // Additional indicators
    const adxVal = ADX.calculate({ close: this.closes, high: this.highs, low: this.lows, period: 14 }).pop()?.adx;
    const atrVal = ATR.calculate({ high: this.highs, low: this.lows, close: this.closes, period: 14 }).pop();
    const choppy = choppinessIndex(this.highs, this.lows, this.closes);

    // Regime classification
    let regime: "trending" | "ranging" | "volatile" | "stable" = "stable";
    if (adxVal && adxVal > 25 && choppy < 50) regime = "trending";
    else if (choppy > 60) regime = "ranging";
    else if (atrVal && atrVal > 3) regime = "volatile";

    const explanation = await explainRegime({ adx: adxVal ?? 0, atr: atrVal ?? 0, choppiness: choppy, trend: direction, asset: "AAPL" }).catch(() => "");

    const trend: TrendState = {
      asset: "AAPL",
      smaShort,
      smaLong,
      macd: macdRes.MACD,
      signal: macdRes.signal,
      histogram: macdRes.histogram,
      direction,
      timestamp: candle.timestamp,
      regime,
      adx: adxVal ?? 0,
      choppiness: choppy,
      atr: atrVal ?? 0,
      explanation,
    };

    const message: MCPMessage<TrendState> = {
      id: uuidv4(),
      sender: this.id,
      role: this.role,
      topic: "trend_data_stream",
      timestamp: Date.now(),
      payload: trend,
    };
    logAction(this.id, message);
    bus.publish(message);
  }
}

function choppinessIndex(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period || lows.length < period || closes.length < period) return 50;
  const atrVals = ATR.calculate({ period, high: highs, low: lows, close: closes });
  const last = atrVals.slice(-period) as any[];
  const sumATR = last.reduce((a, b) => a + (typeof b === 'number' ? b : Number(b) || 0), 0);
  const highMax = Math.max(...highs.slice(-period));
  const lowMin = Math.min(...lows.slice(-period));
  const denom = Math.max(highMax - lowMin, 1e-9);
  const ci = 100 * Math.log10(sumATR / denom) / Math.log10(period);
  return parseFloat((isFinite(ci) ? ci : 50).toFixed(2));
}


