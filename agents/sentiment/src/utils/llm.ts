import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export type LLMEnhancedSentiment = {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
  topics: string[];
};

export async function classifySentiment(text: string): Promise<LLMEnhancedSentiment | null> {
  if (!client) return null;
  const prompt = `
You are a financial sentiment classifier.

Given the headline:
"${text}"

Classify the sentiment as bullish, bearish, or neutral. Return this JSON format only:

{
  "sentiment": "bullish",
  "confidence": 0.9,
  "reasoning": "Strong revenue growth and raised guidance.",
  "topics": ["earnings", "guidance"]
}
`;

  const res = await client.messages.create({
    model: process.env.CLAUDE_SENTIMENT_MODEL || "claude-3-opus-20240229",
    max_tokens: 300,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }]
  } as any);
  const txt = (res as any)?.content?.[0]?.text || "{}";
  const m = txt.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(m ? m[0] : "{}");
    if (!parsed.sentiment) return null;
    return {
      sentiment: String(parsed.sentiment).toLowerCase(),
      confidence: Number(parsed.confidence ?? 0.5),
      reasoning: String(parsed.reasoning || ""),
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : []
    };
  } catch {
    return null;
  }
}


