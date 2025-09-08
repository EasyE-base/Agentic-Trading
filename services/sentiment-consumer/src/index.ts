import { Kafka, logLevel } from 'kafkajs';
import pino from 'pino';

const log = pino({ name: '@swarm/sentiment-consumer' });

const brokers = (process.env.KAFKA_BROKERS || 'localhost:19092').split(',');
const kafka = new Kafka({ clientId: 'sentiment-consumer', brokers, logLevel: logLevel.NOTHING });
const consumer = kafka.consumer({ groupId: 'sentiment-consumers' });

async function main() {
  const topic = process.env.SENTIMENT_TOPIC || 'sentiment_data_stream';
  const drafts = process.env.DRAFTS_TOPIC || 'trade_plan_drafts';
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.subscribe({ topic: drafts, fromBeginning: true });
  log.info({ brokers, topics: [topic, drafts] }, 'listening');
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key?.toString();
      const value = message.value?.toString();
      log.info({ topic, partition, key, value }, 'message');
    }
  });
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});


