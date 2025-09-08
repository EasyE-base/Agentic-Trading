import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export async function anomalousFillNote(data: { asset: string; side: string; avgPrice: number; slippageBps: number; parts: number; type: string }): Promise<string> {
  if (!client) return "";
  const prompt = `
You are an execution analyst. Write one concise sentence (<=25 words) to explain anomalous slippage/fills and give a suggestion.

Asset: ${data.asset}
Side: ${data.side}
Order Type: ${data.type}
Avg Price: ${data.avgPrice}
Slippage (bps): ${data.slippageBps}
Parts: ${data.parts}
`;
  const res = await client.messages.create({
    model: process.env.CLAUDE_EXEC_MODEL || "claude-3-haiku-20240307",
    max_tokens: 80,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }]
  } as any);
  return (res as any)?.content?.[0]?.text?.trim() || "";
}


