import http from 'http';
import client from 'prom-client';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const routes = {
  'market-data': { url: process.env.MARKET_DATA_URL || 'http://localhost:4001' },
  'feature-store': { url: process.env.FEATURE_STORE_URL || 'http://localhost:4002' },
  'risk-engine': { url: process.env.RISK_ENGINE_URL || 'http://localhost:4003' },
  'backtester': { url: process.env.BACKTESTER_URL || 'http://localhost:4004' },
  'nlp-sentiment': { url: process.env.NLP_SENTIMENT_URL || 'http://localhost:4005' },
  'broker-gateway': { url: process.env.BROKER_GATEWAY_URL || 'http://localhost:4006' },
  'bus': { url: process.env.BUS_URL || 'http://localhost:4007' },
  'config': { url: process.env.CONFIG_URL || 'http://localhost:4008' },
  'analytics': { url: process.env.ANALYTICS_URL || 'http://localhost:4009' },
  'command-agent': { url: process.env.COMMAND_AGENT_URL || 'http://localhost:4010' },
};

const CallInput = z.object({ tool: z.string(), input: z.any() });

// --- RBAC config ---
type Policy = Record<string, string[]>; // role -> allowed tool names

const RBAC_ENABLED = (process.env.RBAC_ENABLED || 'false').toLowerCase() === 'true';
// RBAC_KEYS format: "key1:roleA,key2:roleB"
const RBAC_KEYS: Record<string, string> = (process.env.RBAC_KEYS || '')
  .split(',')
  .map((pair) => pair.trim())
  .filter(Boolean)
  .reduce<Record<string, string>>((acc, pair) => {
    const [key, role] = pair.split(':');
    if (key && role) acc[key] = role;
    return acc;
  }, {});

// RBAC_POLICY is JSON like: {"publisher":["bus.publish"],"risk":["risk-engine.*"]}
let POLICY: Policy = {};
try {
  if (process.env.RBAC_POLICY) {
    POLICY = JSON.parse(process.env.RBAC_POLICY);
  }
} catch {
  POLICY = {};
}

// Provide sensible defaults if RBAC is enabled and no policy was provided
if (RBAC_ENABLED && Object.keys(POLICY).length === 0) {
  POLICY = {
    // Readers/feature writers
    "signal_agent": [
      "market-data.*",
      "feature-store.write_features",
      "config.get",
      "bus.publish",
    ],
    "sentiment_agent": [
      "nlp-sentiment.*",
      "feature-store.write_features",
      "bus.publish",
    ],
    "trend_agent": [
      "market-data.*",
      "feature-store.write_features",
      "bus.publish",
    ],
    // Orchestrator
    "strategy_builder": [
      "market-data.*",
      "feature-store.*",
      "backtester.run",
      "risk-engine.pretrade_check",
      "config.get",
      "bus.publish",
    ],
    // Risk & execution
    "risk_agent": [
      "risk-engine.*",
      "bus.publish",
    ],
    "execution_agent": [
      "broker-gateway.*",
      "feature-store.write_features",
      "analytics.*",
      "bus.publish",
    ],
    // Natural language interface
    "neural_command": [
      "market-data.*",
      "risk-engine.*",
      "config.*",
      "bus.publish",
      "command-agent.*"
    ],
    // Observability / admin
    "telemetry": ["analytics.*"],
    "admin": ["*"],
  } as Policy;
}

function getRoleFromHeaders(req: http.IncomingMessage): string | undefined {
  const auth = req.headers['authorization'];
  if (auth && typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) {
      const key = m[1];
      const role = RBAC_KEYS[key];
      if (role) return role;
    }
  }
  const headerRole = req.headers['x-agent-role'];
  if (typeof headerRole === 'string') return headerRole;
  return undefined;
}

function isToolAllowed(role: string | undefined, tool: string): boolean {
  if (!RBAC_ENABLED) return true;
  if (!role) return false;
  const allowed = POLICY[role];
  if (!allowed || allowed.length === 0) return false;
  // allow exact match or simple namespace wildcard like "risk-engine.*"
  for (const pattern of allowed) {
    if (pattern === tool) return true;
    if (pattern.endsWith('.*')) {
      const ns = pattern.slice(0, -2);
      if (tool.startsWith(ns + '.')) return true;
    }
    if (pattern === '*') return true;
  }
  return false;
}

async function forwardCall(targetBaseUrl: string, tool: string, input: unknown, correlationId: string, role?: string, agentId?: string) {
  const url = new URL('/call', targetBaseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
      ...(role ? { 'x-agent-role': role } : {}),
      ...(agentId ? { 'x-agent-id': agentId } : {}),
    },
    body: JSON.stringify({ tool, input }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upstream ${targetBaseUrl} error ${res.status}: ${txt}`);
  }
  return await res.json();
}

const requestCounter = new client.Counter({ name: 'mcp_host_http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'path', 'status'] });
const errorCounter = new client.Counter({ name: 'mcp_host_errors_total', help: 'Unhandled errors' });
const registry = new client.Registry();
registry.registerMetric(requestCounter);
registry.registerMetric(errorCounter);
client.collectDefaultMetrics({ register: registry });

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      requestCounter.inc({ method: req.method, path: '/health', status: '200' });
      return;
    }
    if (req.method === 'GET' && req.url === '/metrics') {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'content-type': registry.contentType });
      res.end(metrics);
      requestCounter.inc({ method: req.method, path: '/metrics', status: '200' });
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/call/')) {
      const parts = req.url.split('/');
      const service = parts[2]; // /call/{service}
      const route = (routes as any)[service];
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'service_not_found' }));
        requestCounter.inc({ method: req.method, path: '/call', status: '404' });
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = CallInput.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const role = getRoleFromHeaders(req);
      if (!isToolAllowed(role, body.tool)) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden', message: 'RBAC denied' }));
        requestCounter.inc({ method: req.method, path: '/call', status: '403' });
        return;
      }
      const corr = (req.headers['x-correlation-id'] as string | undefined) || randomUUID();
      const agentId = (req.headers['x-agent-id'] as string | undefined);
      const data = await forwardCall(route.url, body.tool, body.input, corr, role, agentId);
      res.writeHead(200, { 'content-type': 'application/json', 'x-correlation-id': corr });
      res.end(JSON.stringify(data));
      requestCounter.inc({ method: req.method, path: '/call', status: '200' });
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    requestCounter.inc({ method: req.method || 'UNKNOWN', path: 'unknown', status: '404' });
  } catch (err: any) {
    errorCounter.inc();
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) }));
    requestCounter.inc({ method: req.method || 'UNKNOWN', path: req.url || 'unknown', status: '500' });
  }
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`MCP host listening on http://localhost:${port}`);
});
