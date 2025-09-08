import pino from 'pino';
import { z } from 'zod';
import http from 'http';

const log = pino({ name: '@swarm/market-data' });

// Simple in-memory tool registry with zod validation
type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};

function registerTool<I, O>(tool: Tool<I, O>) {
  tools[tool.name] = tool;
  log.info({ tool: tool.name }, 'registered tool');
}

// Schemas for get_ohlcv
const GetOhlcvInput = z.object({
  symbol: z.string().min(1),
  start: z.string().min(8), // ISO date
  end: z.string().min(8),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d'])
});

const OhlcvRow = z.object({ ts: z.string(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() });
const GetOhlcvOutput = z.object({ rows: z.array(OhlcvRow) });

function intervalMs(interval: z.infer<typeof GetOhlcvInput>['interval']): number {
  switch (interval) {
    case '1m': return 60_000;
    case '5m': return 5 * 60_000;
    case '15m': return 15 * 60_000;
    case '1h': return 60 * 60_000;
    case '1d': return 24 * 60 * 60_000;
  }
}

registerTool({
  name: 'market-data.get_ohlcv',
  input: GetOhlcvInput,
  output: GetOhlcvOutput,
  handler: (input) => {
    const { symbol, start, end, interval } = GetOhlcvInput.parse(input);
    const startTs = new Date(start).getTime();
    const endTs = new Date(end).getTime();
    const step = intervalMs(interval);
    const rows: Array<z.infer<typeof OhlcvRow>> = [];
    let price = 100;
    for (let t = startTs; t <= endTs; t += step) {
      const drift = (Math.random() - 0.5) * 0.5;
      const open = price;
      const close = Math.max(1, open + drift);
      const high = Math.max(open, close) + Math.random();
      const low = Math.min(open, close) - Math.random();
      const volume = Math.floor(1000 + Math.random() * 5000);
      price = close;
      rows.push({ ts: new Date(t).toISOString(), open, high, low, close, volume });
    }
    return GetOhlcvOutput.parse({ rows });
  }
});

// Example invocation to verify wiring during dev
(async () => {
  const port = Number(process.env.PORT || 4001);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.method === 'POST' && req.url === '/call') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { tool: string; input: unknown };
        const tool = tools[body.tool];
        if (!tool) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'tool_not_found' }));
          return;
        }
        const input = tool.input.parse(body.input);
        const output = await tool.handler(input as any);
        const validated = tool.output.parse(output);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(validated));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    } catch (err: any) {
      log.error({ err }, 'unhandled error');
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) }));
    }
  });
  server.listen(port, () => log.info({ port }, 'Market Data server listening'));
})();
