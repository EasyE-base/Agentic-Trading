import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export async function classifyMarketSignal(payload: any): Promise<{
  bias: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
} | null> {
  if (!client) return null;
  const prompt = `
You are a market signal classifier. Given technical indicator data, classify the short-term price action as either bullish, bearish, or neutral.

Return this JSON format only:
{
  "bias": "bullish",
  "confidence": 0.9,
  "reasoning": "The RSI is oversold and MACD crossover is bullish."
}

INPUT:
${JSON.stringify(payload, null, 2)}
`;

  const res = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
    max_tokens: 300,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }]
  } as any);

  const txt = (res as any)?.content?.[0]?.text || "{}";
  const m = txt.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(m ? m[0] : "{}");
    if (!parsed.bias) return null;
    return {
      bias: String(parsed.bias).toLowerCase(),
      confidence: Number(parsed.confidence ?? 0.5),
      reasoning: String(parsed.reasoning || "")
    } as any;
  } catch {
    return null;
  }
}


