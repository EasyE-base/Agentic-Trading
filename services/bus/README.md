# MCP Bus Service

Publishes JSON messages to Kafka/Redpanda via `bus.publish`.

Env:
```
KAFKA_BROKERS=localhost:19092
PORT=4007
```

Run:
```bash
pnpm --filter @swarm/bus dev
```

Smoke test via host (with mcp-host running):
```bash
pnpm --filter @swarm/mcp-host cli bus bus.publish '{"topic":"sentiment_data_stream","payload":{"msg":"hello"}}'
```
