import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export async function explainTrade(input: {
  asset: string;
  direction: string;
  confidence: number;
  sources: string[];
}): Promise<string> {
  if (!client) return "";
  const prompt = `
You are an AI trading strategist. Explain the following trade plan in 2 short sentences:

- Asset: ${input.asset}
- Direction: ${input.direction}
- Confidence: ${(input.confidence * 100).toFixed(1)}%
- Rationale:
${input.sources.join("\n")}

Be clear, professional, and concise.
`;
  const res = await client.messages.create({
    model: process.env.CLAUDE_STRATEGY_MODEL || "claude-3-opus-20240229",
    max_tokens: 200,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }]
  } as any);
  return (res as any)?.content?.[0]?.text?.trim() || "";
}


