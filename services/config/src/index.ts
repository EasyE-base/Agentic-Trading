import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';

const log = pino({ name: '@swarm/config' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

type Backend = 'memory' | 'redis' | 'postgres';
const BACKEND: Backend = (process.env.CONFIG_BACKEND as Backend) || 'memory';
const CONFIG: Record<string, any> = {};
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
let redis: any;
let pgPool: any;

async function initBackends() {
  if (BACKEND === 'redis') {
    const Redis = (await import('ioredis')).default;
    redis = new Redis(REDIS_URL);
  } else if (BACKEND === 'postgres') {
    const pg = await import('pg');
    pgPool = new (pg as any).Pool({ connectionString: POSTGRES_URL });
    await pgPool.query('CREATE TABLE IF NOT EXISTS kv_config (key text PRIMARY KEY, value jsonb NOT NULL)');
  }
}

async function getValue(key: string): Promise<any> {
  if (BACKEND === 'redis' && redis) {
    const v = await redis.get(`cfg:${key}`);
    return v ? JSON.parse(v) : undefined;
  }
  if (BACKEND === 'postgres' && pgPool) {
    const r = await pgPool.query('SELECT value FROM kv_config WHERE key = $1', [key]);
    return r.rows[0]?.value;
  }
  return CONFIG[key];
}

async function setValue(key: string, value: any): Promise<void> {
  if (BACKEND === 'redis' && redis) {
    await redis.set(`cfg:${key}`, JSON.stringify(value));
    return;
  }
  if (BACKEND === 'postgres' && pgPool) {
    await pgPool.query('INSERT INTO kv_config (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
    return;
  }
  CONFIG[key] = value;
}

const GetInput = z.object({ key: z.string() });
const GetOutput = z.object({ key: z.string(), value: z.any().optional() });
const SetInput = z.object({ key: z.string(), value: z.any() });
const SetOutput = z.object({ ok: z.boolean() });

registerTool({
  name: 'config.get',
  input: GetInput,
  output: GetOutput,
  handler: async (input) => {
    const { key } = GetInput.parse(input);
    const value = await getValue(key);
    return { key, value };
  }
});

registerTool({
  name: 'config.set',
  input: SetInput,
  output: SetOutput,
  handler: async (input) => {
    const { key, value } = SetInput.parse(input);
    await setValue(key, value);
    return { ok: true };
  }
});

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

(async () => {
  await initBackends();
  const port = Number(process.env.PORT || 4008);
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
  server.listen(port, () => log.info({ port }, 'Config server listening'));
})();


