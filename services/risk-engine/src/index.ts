import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';

const log = pino({ name: '@swarm/risk-engine' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

const RiskCalcInput = z.object({ positions: z.array(z.object({ symbol: z.string(), qty: z.number(), price: z.number() })), limits: z.object({ maxGross: z.number(), maxSingle: z.number() }) });
const RiskCalcOutput = z.object({ gross: z.number(), breaches: z.array(z.string()) });

registerTool({
  name: 'risk-engine.calc',
  input: RiskCalcInput,
  output: RiskCalcOutput,
  handler: (input) => {
    const { positions, limits } = RiskCalcInput.parse(input);
    const gross = positions.reduce((s, p) => s + Math.abs(p.qty * p.price), 0);
    const breaches: string[] = [];
    if (gross > limits.maxGross) breaches.push('max_gross');
    if (positions.some(p => Math.abs(p.qty * p.price) > limits.maxSingle)) breaches.push('max_single');
    return { gross, breaches };
  }
});

// pretrade_check: evaluates a single proposal against simple limits
const PretradeInput = z.object({ symbol: z.string(), side: z.enum(['BUY','SELL']), qty: z.number().positive(), price: z.number().positive(), limits: z.object({ maxGross: z.number(), maxSingle: z.number() }), current: z.array(z.object({ symbol: z.string(), qty: z.number(), price: z.number() })).default([]) });
const PretradeOutput = z.object({ status: z.enum(['APPROVED','ADJUSTED','REJECTED']), breaches: z.array(z.string()), notes: z.string().optional() });

registerTool({
  name: 'risk-engine.pretrade_check',
  input: PretradeInput,
  output: PretradeOutput,
  handler: (input) => {
    const { symbol, qty, price, limits, current } = PretradeInput.parse(input);
    const gross = current.reduce((s, p) => s + Math.abs(p.qty * p.price), 0) + Math.abs(qty * price);
    const breaches: string[] = [];
    if (gross > limits.maxGross) breaches.push('max_gross');
    if (Math.abs(qty * price) > limits.maxSingle) breaches.push('max_single');
    const status = breaches.length ? 'REJECTED' : 'APPROVED';
    return { status, breaches };
  }
});

const port = Number(process.env.PORT || 4003);
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
server.listen(port, () => log.info({ port }, 'Risk Engine server listening'));
