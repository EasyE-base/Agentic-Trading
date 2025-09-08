import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';

const log = pino({ name: '@swarm/analytics' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgres://swarm:swarm@localhost:5432/swarm';
let pgPool: any;
async function getPool() {
  if (!pgPool) {
    const pg = await import('pg');
    pgPool = new (pg as any).Pool({ connectionString: POSTGRES_URL });
  }
  return pgPool;
}
async function ensureTables() {
  const pool = await getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS exec_stats (
    ts timestamptz NOT NULL,
    symbol text NOT NULL,
    orders_count int NOT NULL,
    pnl double precision NOT NULL,
    trace_id text,
    PRIMARY KEY (ts, symbol)
  )`);
}

const WriteExecInput = z.object({ ts: z.string(), symbol: z.string(), orders_count: z.number().int(), pnl: z.number(), trace_id: z.string().nullable().optional() });
const WriteExecOutput = z.object({ ok: z.boolean() });

registerTool({
  name: 'analytics.write_exec_stat',
  input: WriteExecInput,
  output: WriteExecOutput,
  handler: async (input) => {
    const { ts, symbol, orders_count, pnl, trace_id } = WriteExecInput.parse(input);
    await ensureTables();
    const pool = await getPool();
    await pool.query('INSERT INTO exec_stats (ts, symbol, orders_count, pnl, trace_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (ts, symbol) DO UPDATE SET orders_count = EXCLUDED.orders_count, pnl = EXCLUDED.pnl, trace_id = EXCLUDED.trace_id', [ts, symbol, orders_count, pnl, trace_id ?? null]);
    execWrites.inc({ symbol });
    return { ok: true };
  }
});

const GetRecentInput = z.object({ limit: z.number().int().min(1).max(100).default(5) });
const GetRecentOutput = z.object({ rows: z.array(z.object({ ts: z.string(), symbol: z.string(), orders_count: z.number(), pnl: z.number(), trace_id: z.string().nullable() })) });

registerTool({
  name: 'analytics.get_recent',
  input: GetRecentInput,
  output: GetRecentOutput,
  handler: async (input) => {
    const { limit } = GetRecentInput.parse(input);
    await ensureTables();
    const pool = await getPool();
    const r = await pool.query('SELECT ts, symbol, orders_count, pnl, trace_id FROM exec_stats ORDER BY ts DESC LIMIT $1', [limit]);
    const rows = r.rows.map((x: any) => ({ ts: x.ts instanceof Date ? x.ts.toISOString() : x.ts, symbol: x.symbol, orders_count: Number(x.orders_count), pnl: Number(x.pnl), trace_id: x.trace_id }));
    return { rows };
  }
});

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const execWrites = new client.Counter({ name: 'exec_stats_written_total', help: 'Number of exec stats writes', labelNames: ['symbol'] });
registry.registerMetric(execWrites);

(async () => {
  const port = Number(process.env.PORT || 4009);
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
    } catch (err: any) {
      log.error({ err }, 'unhandled error');
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) }));
    }
  });
  server.listen(port, () => log.info({ port }, 'Analytics server listening'));
})();


