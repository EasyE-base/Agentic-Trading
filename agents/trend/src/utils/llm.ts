import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function explainRegime(data: {
  adx: number;
  atr: number;
  choppiness: number;
  trend: string;
  asset: string;
}): Promise<string> {
  if (!openai) return "";
  const prompt = `
You are a market regime explainer.

Given these indicators:
- ADX: ${data.adx}
- ATR: ${data.atr}
- Choppiness Index: ${data.choppiness}
- Current trend: ${data.trend}

Explain the current market state for ${data.asset} in 1–2 sentences.
`;
  const res = await openai.chat.completions.create({
    model: process.env.GPT_MODEL || "gpt-4-0613",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 100,
    temperature: 0.4
  });
  return res.choices[0]?.message?.content?.trim() || "";
}


