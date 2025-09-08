import { Kafka } from 'kafkajs';
import pino from 'pino';

const log = pino({ name: '@swarm/context-responses-consumer' });

const brokers = (process.env.KAFKA_BROKERS || 'localhost:19092').split(',');
const TOPIC = process.env.TOPIC || 'market_context_responses';
const kafka = new Kafka({ clientId: 'context-responses-consumer', brokers });
const consumer = kafka.consumer({ groupId: 'context-responses-group' });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (message.value) log.info({ topic, partition, value: message.value.toString() }, 'response');
    },
  });
  log.info({ topic: TOPIC }, 'listening');
}

run().catch(e => log.error({ err: e }, 'fatal'));


