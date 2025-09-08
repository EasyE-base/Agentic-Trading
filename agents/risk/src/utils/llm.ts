import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function explainRejection(reason: string, suggestion?: Record<string, any>): Promise<string> {
  if (!openai) return "";
  const prompt = `
You are a trading risk officer. A trade was rejected for the following reason:

${reason}

${suggestion ? `A possible fix is: ${JSON.stringify(suggestion)}` : ""}

Write a 1-2 sentence explanation for the trader.
`;
  const res = await openai.chat.completions.create({
    model: process.env.GPT_MODEL || "gpt-4-turbo-preview",
    max_tokens: 150,
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }]
  });
  return res.choices[0]?.message?.content?.trim() || "";
}


