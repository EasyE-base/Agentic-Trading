import pino from 'pino';
import { z } from 'zod';
import http from 'http';

const log = pino({ name: '@swarm/backtester' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

const RunBacktestInput = z.object({ prices: z.array(z.object({ ts: z.string(), price: z.number() })), threshold: z.number().default(0.0) });
const RunBacktestOutput = z.object({ trades: z.array(z.object({ ts: z.string(), side: z.enum(['BUY','SELL']), price: z.number() })), pnl: z.number() });

registerTool({
  name: 'backtester.run',
  input: RunBacktestInput,
  output: RunBacktestOutput,
  handler: (input) => {
    const { prices, threshold } = RunBacktestInput.parse(input);
    const trades: Array<{ ts: string; side: 'BUY'|'SELL'; price: number }> = [];
    let last = prices[0]?.price ?? 0; let pnl = 0; let inv = 0;
    for (const p of prices) {
      const delta = p.price - last;
      if (delta > threshold) { trades.push({ ts: p.ts, side: 'BUY', price: p.price }); inv -= p.price; }
      if (delta < -threshold) { trades.push({ ts: p.ts, side: 'SELL', price: p.price }); inv += p.price; }
      last = p.price;
    }
    pnl = inv + (trades.length ? prices[prices.length-1].price : 0);
    return { trades, pnl };
  }
});

const port = Number(process.env.PORT || 4004);
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok' })); return; }
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
server.listen(port, () => log.info({ port }, 'Backtester server listening'));


