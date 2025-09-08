import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';

const log = pino({ name: '@swarm/feature-store' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) {
  tools[tool.name] = tool;
  log.info({ tool: tool.name }, 'registered tool');
}

// Simple in-memory feature store and optional ClickHouse/Postgres backends
const FeatureRow = z.object({ ts: z.string(), symbol: z.string(), feature_set: z.string(), feature_name: z.string(), value: z.number(), ver: z.string().default('v1'), source: z.string().optional() });

const WriteFeaturesInput = z.object({ feature_set: z.string(), rows: z.array(FeatureRow) });
const WriteFeaturesOutput = z.object({ wrote: z.number() });

const GetFeaturesInput = z.object({ feature_set: z.string(), symbol: z.string() });
const GetFeaturesOutput = z.object({ rows: z.array(FeatureRow) });

const MEMORY: Record<string, Array<z.infer<typeof FeatureRow>>> = {};

type Backend = 'memory' | 'clickhouse' | 'postgres';
const BACKEND: Backend = (process.env.FEATURE_STORE_BACKEND as Backend) || 'memory';
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB || 'default';
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER;
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD;

// Postgres / Timescale
let PG_POOL: any | null = null;
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
async function pgGetPool() {
  if (!PG_POOL) {
    const pg = await import('pg');
    PG_POOL = new (pg as any).Pool({ connectionString: POSTGRES_URL });
  }
  return PG_POOL;
}

async function chQuery(sql: string, body?: string): Promise<any> {
  const base = new URL(CLICKHOUSE_URL);
  base.searchParams.set('database', CLICKHOUSE_DB);
  if (CLICKHOUSE_USER) base.searchParams.set('user', CLICKHOUSE_USER);
  if (CLICKHOUSE_PASSWORD) base.searchParams.set('password', CLICKHOUSE_PASSWORD);
  base.searchParams.set('query', sql);
  const res = await fetch(base, { method: 'POST', body });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ClickHouse error ${res.status}: ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  return await res.text();
}

async function chEnsureTable(): Promise<void> {
  const sql = `CREATE TABLE IF NOT EXISTS features (
    ts DateTime,
    symbol String,
    feature_set String,
    feature_name String,
    value Float64,
    ver String,
    source Nullable(String)
  ) ENGINE = MergeTree
  ORDER BY (feature_set, symbol, ts, feature_name)`;
  await chQuery(sql);
}

async function chWriteFeatures(feature_set: string, rows: Array<z.infer<typeof FeatureRow>>): Promise<number> {
  await chEnsureTable();
  const sql = `INSERT INTO features FORMAT JSONEachRow`;
  const body = rows.map(r => JSON.stringify({
    ts: r.ts,
    symbol: r.symbol,
    feature_set: r.feature_set,
    feature_name: r.feature_name,
    value: r.value,
    ver: r.ver,
    source: r.source ?? null,
  })).join('\n');
  await chQuery(sql, body);
  return rows.length;
}

async function chGetFeatures(feature_set: string, symbol: string): Promise<Array<z.infer<typeof FeatureRow>>> {
  await chEnsureTable();
  const sql = `SELECT ts, symbol, feature_set, feature_name, value, ver, source FROM features WHERE feature_set = {fs:String} AND symbol = {sym:String} ORDER BY ts FORMAT JSON`;
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('database', CLICKHOUSE_DB);
  if (CLICKHOUSE_USER) url.searchParams.set('user', CLICKHOUSE_USER);
  if (CLICKHOUSE_PASSWORD) url.searchParams.set('password', CLICKHOUSE_PASSWORD);
  url.searchParams.set('param_fs', feature_set);
  url.searchParams.set('param_sym', symbol);
  url.searchParams.set('query', sql);
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ClickHouse error ${res.status}: ${txt}`);
  }
  const json = await res.json() as { data: any[] };
  return json.data.map(r => ({ ts: r.ts, symbol: r.symbol, feature_set: r.feature_set, feature_name: r.feature_name, value: r.value, ver: r.ver, source: r.source ?? undefined }));
}

async function pgEnsureTable(): Promise<void> {
  const pool = await pgGetPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS features (
    ts timestamptz NOT NULL,
    symbol text NOT NULL,
    feature_set text NOT NULL,
    feature_name text NOT NULL,
    value double precision NOT NULL,
    ver text NOT NULL,
    source text
  );`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_features_keys ON features (feature_set, symbol, ts, feature_name);`);
}

async function pgWriteFeatures(feature_set: string, rows: Array<z.infer<typeof FeatureRow>>): Promise<number> {
  const pool = await pgGetPool();
  await pgEnsureTable();
  const text = `INSERT INTO features (ts, symbol, feature_set, feature_name, value, ver, source)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(text, [r.ts, r.symbol, r.feature_set, r.feature_name, r.value, r.ver, r.source ?? null]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}

async function pgGetFeatures(feature_set: string, symbol: string): Promise<Array<z.infer<typeof FeatureRow>>> {
  const pool = await pgGetPool();
  await pgEnsureTable();
  const res = await pool.query(
    `SELECT ts, symbol, feature_set, feature_name, value, ver, source
     FROM features
     WHERE feature_set = $1 AND symbol = $2
     ORDER BY ts`,
    [feature_set, symbol]
  );
  return res.rows.map((r: any) => ({ ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts, symbol: r.symbol, feature_set: r.feature_set, feature_name: r.feature_name, value: Number(r.value), ver: r.ver, source: r.source ?? undefined }));
}

registerTool({
  name: 'feature-store.write_features',
  input: WriteFeaturesInput,
  output: WriteFeaturesOutput,
  handler: (input) => {
    const parsed = WriteFeaturesInput.parse(input);
    if (BACKEND === 'clickhouse') {
      return chWriteFeatures(parsed.feature_set, parsed.rows).then((n) => ({ wrote: n }));
    } else if (BACKEND === 'postgres') {
      return pgWriteFeatures(parsed.feature_set, parsed.rows).then((n) => ({ wrote: n }));
    }
    const key = parsed.feature_set;
    MEMORY[key] = MEMORY[key] || [];
    MEMORY[key].push(...parsed.rows);
    return { wrote: parsed.rows.length };
  }
});

registerTool({
  name: 'feature-store.get_features',
  input: GetFeaturesInput,
  output: GetFeaturesOutput,
  handler: (input) => {
    const { feature_set, symbol } = GetFeaturesInput.parse(input);
    if (BACKEND === 'clickhouse') {
      return chGetFeatures(feature_set, symbol).then(rows => ({ rows }));
    } else if (BACKEND === 'postgres') {
      return pgGetFeatures(feature_set, symbol).then(rows => ({ rows }));
    }
    const rows = (MEMORY[feature_set] || []).filter(r => r.symbol === symbol);
    return { rows };
  }
});

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

(async () => {
  const port = Number(process.env.PORT || 4002);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.method === 'GET' && req.url === '/metrics') {
        const metrics = await registry.metrics();
        res.writeHead(200, { 'content-type': registry.contentType });
        res.end(metrics);
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
  server.listen(port, () => log.info({ port }, 'Feature Store server listening'));
})();
