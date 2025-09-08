import pino from 'pino';
import { z } from 'zod';
import http from 'http';
import client from 'prom-client';
import { Kafka, logLevel } from 'kafkajs';

const log = pino({ name: '@swarm/bus' });

type Tool<I, O> = { name: string; input: z.ZodType<I>; output: z.ZodType<O>; handler: (input: I) => Promise<O> | O };
const tools: Record<string, Tool<any, any>> = {};
function registerTool<I, O>(tool: Tool<I, O>) { tools[tool.name] = tool; log.info({ tool: tool.name }, 'registered tool'); }

const PublishInput = z.object({ topic: z.string().min(1), key: z.string().optional(), payload: z.any() });
const PublishOutput = z.object({ topic: z.string(), partition: z.number(), offset: z.string() });

const brokers = (process.env.KAFKA_BROKERS || 'localhost:19092').split(',');
const kafka = new Kafka({ clientId: 'swarm-bus', brokers, logLevel: logLevel.NOTHING });
const producer = kafka.producer();

registerTool({
  name: 'bus.publish',
  input: PublishInput,
  output: PublishOutput,
  handler: async (input, req?: http.IncomingMessage) => {
    const { topic, key, payload } = PublishInput.parse(input);
    await producer.connect();
    const corr = (req?.headers['x-correlation-id'] as string | undefined) || Math.random().toString(36).slice(2);
    const agentRole = req?.headers['x-agent-role'] as string | undefined;
    const agentId = req?.headers['x-agent-id'] as string | undefined;
    const nowIso = new Date().toISOString();
    const enriched = {
      ...payload,
      ts: payload?.ts || nowIso,
      cid: payload?.cid || corr,
      source: payload?.source || agentId || agentRole || 'unknown',
      version: payload?.version || 'v1',
      _agent_role: agentRole,
      _agent_id: agentId,
    } as Record<string, any>;
    const res = await producer.send({ topic, messages: [{ key, value: JSON.stringify(enriched) }] });
    const first = res[0];
    return { topic, partition: first.partition, offset: String(first.baseOffset) };
  }
});

const port = Number(process.env.PORT || 4007);
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
      const input = tool.input.parse(body.input); const output = await tool.handler(input as any, req); const validated = tool.output.parse(output);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(validated)); return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'not_found' }));
  } catch (err: any) { log.error({ err }, 'unhandled error'); res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'internal_error', message: String(err?.message || err) })); }
});
server.listen(port, () => log.info({ port, brokers }, 'Bus server listening'));


