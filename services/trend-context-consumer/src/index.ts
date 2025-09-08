import { Kafka } from 'kafkajs';
import pino from 'pino';

const log = pino({ name: '@swarm/trend-context-consumer' });

const brokers = (process.env.KAFKA_BROKERS || 'localhost:19092').split(',');
const kafka = new Kafka({ clientId: 'trend-context-consumer', brokers });
const consumer = kafka.consumer({ groupId: 'trend-context-group' });

const REQUEST_TOPIC = process.env.CONTEXT_REQ_TOPIC || 'market_context_requests';
const RESPONSE_TOPIC = process.env.CONTEXT_RESP_TOPIC || 'market_context_responses';

const CONTEXT_KEY = process.env.CONTEXT_KEY || '';
const CONTEXT_ROLE = process.env.CONTEXT_ROLE || 'context';
const AGENT_ID = process.env.AGENT_ID || 'trend-context-consumer';

async function forwardToBus(payload: Record<string, any>) {
  const host = process.env.HOST_URL || 'http://localhost:4000';
  const res = await fetch(`${host}/call/bus`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': CONTEXT_KEY ? `Bearer ${CONTEXT_KEY}` : '', 'x-agent-role': CONTEXT_ROLE, 'x-agent-id': AGENT_ID },
    body: JSON.stringify({ tool: 'bus.publish', input: { topic: RESPONSE_TOPIC, payload } }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`bus.publish failed: ${res.status} ${txt}`);
  }
}

async function getTrendFeatures(symbol: string) {
  const host = process.env.HOST_URL || 'http://localhost:4000';
  const res = await fetch(`${host}/call/feature-store`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': CONTEXT_KEY ? `Bearer ${CONTEXT_KEY}` : '', 'x-agent-role': CONTEXT_ROLE, 'x-agent-id': AGENT_ID },
    body: JSON.stringify({ tool: 'feature-store.get_features', input: { feature_set: 'trend_demo', symbol } }),
  });
  if (!res.ok) throw new Error(`feature-store get failed: ${res.status}`);
  const json = await res.json();
  return json.rows as Array<{ ts: string; feature_name: string; value: number }>;
}

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: REQUEST_TOPIC, fromBeginning: true });
  log.info({ brokers, topic: REQUEST_TOPIC }, 'listening');
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value?.toString();
        if (!value) return;
        const req = JSON.parse(value) as { symbol: string; horizon?: string; trace_id?: string };
        const rows = await getTrendFeatures(req.symbol);
        const momentum = rows.find(r => r.feature_name === 'momentum3')?.value ?? 0;
        const regime = rows.find(r => r.feature_name === 'regime_neutral')?.value ?? 0;
        const summary = {
          symbol: req.symbol,
          horizon: req.horizon || 'short',
          momentum3: momentum,
          regime_neutral: regime,
          trace_id: req.trace_id,
          _ts: new Date().toISOString(),
        };
        await forwardToBus(summary);
        log.info({ summary }, 'context_response');
      } catch (err: any) {
        log.error({ err }, 'failed to handle context request');
      }
    },
  });
}

run().catch((e) => log.error({ err: e }, 'fatal'));


