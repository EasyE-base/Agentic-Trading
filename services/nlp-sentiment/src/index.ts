import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';

const log = pino({ name: '@swarm/nlp-sentiment' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

const ScoreTextsInput = z.object({ provider: z.string().default('stub'), items: z.array(z.object({ id: z.string().default(() => Math.random().toString(36).slice(2)), text: z.string().min(1) })) });
const ScoreTextsOutput = z.object({ scores: z.array(z.object({ id: z.string(), score: z.number().min(-1).max(1), magnitude: z.number().min(0).max(1) })) });

registerTool({
  name: 'nlp-sentiment.score_texts',
  input: ScoreTextsInput,
  output: ScoreTextsOutput,
  handler: (input) => {
    const { items } = ScoreTextsInput.parse(input);
    // stub: hash text length for deterministic pseudo sentiment
    const scores = items.map(({ id, text }) => {
      const h = [...text].reduce((a, c) => a + c.charCodeAt(0), 0);
      const score = ((h % 200) - 100) / 100; // -1..1
      const magnitude = Math.min(1, Math.abs(score));
      return { id, score, magnitude };
    });
    return { scores };
  }
});

const port = Number(process.env.PORT || 4005);
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok' })); return; }
    if (req.method === 'GET' && req.url === '/metrics') { const metrics = await registry.metrics(); res.writeHead(200, { 'content-type': registry.contentType }); res.end(metrics); return; }
    if (req.method === 'POST' && req.url === '/call') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { tool: string; input: unknown };
      const tool = tools[body.tool]; if (!tool) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'tool_not_found' })); return; }
      const input = tool.input.parse(body.input); const output = await tool.handler(input as any); const validated = tool.output.parse(output);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(validated)); return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not_found' }));
  } catch (err: any) { log.error({ err }, 'unhandled error'); res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) })); }
});
server.listen(port, () => log.info({ port }, 'NLP Sentiment server listening'));




