import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export async function summarizePeriod(lines: string[]): Promise<string> {
  if (!client) return "";
  const prompt = `Summarize this trading period in 4 bullets with 1 action item:\n${lines.join("\n")}`;
  const res = await client.messages.create({ model: process.env.CLAUDE_META_MODEL || "claude-3-haiku-20240307", max_tokens: 300, temperature: 0.2, messages: [{ role: "user", content: prompt }] } as any);
  return (res as any)?.content?.[0]?.text?.trim() || "";
}


