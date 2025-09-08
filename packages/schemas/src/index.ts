import { z } from 'zod';

export const Message = z.object({
  ts: z.string(),
  cid: z.string().optional(),
  source: z.string().optional(),
  version: z.string().default('v1')
});
export type Message = z.infer<typeof Message>;

export const SignalScore = z.object({
  symbol: z.string(),
  ts: z.string(),
  strategy: z.string(),
  score: z.number(),
  features: z.record(z.number()).optional(),
  version: z.string().default('v1')
});
export type SignalScore = z.infer<typeof SignalScore>;

export const SentimentIndex = z.object({
  symbol: z.string(),
  ts: z.string(),
  polarity: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1).default(1),
  sources: z.array(z.string()).optional(),
  version: z.string().default('v1')
});
export type SentimentIndex = z.infer<typeof SentimentIndex>;

export const TrendState = z.object({
  symbol: z.string(),
  ts: z.string(),
  regime: z.enum(['UP','DOWN','SIDEWAYS']),
  macd: z.number().optional(),
  slope: z.number().optional(),
  strength: z.number().min(0).max(1).optional(),
  version: z.string().default('v1')
});
export type TrendState = z.infer<typeof TrendState>;

export const TradePlan = z.object({
  plan_id: z.string(),
  ts: z.string(),
  symbol: z.string(),
  action: z.enum(['BUY','SELL']),
  qty: z.number().positive(),
  price: z.number().positive(),
  score: z.number().optional(),
  risk_status: z.string().optional(),
  version: z.string().default('v1')
});
export type TradePlan = z.infer<typeof TradePlan>;

export const ApprovedTrade = z.object({
  approval_id: z.string(),
  ts: z.string(),
  plan_id: z.string(),
  status: z.enum(['APPROVED','ADJUSTED','REJECTED']),
  notes: z.string().optional(),
  version: z.string().default('v1')
});
export type ApprovedTrade = z.infer<typeof ApprovedTrade>;


