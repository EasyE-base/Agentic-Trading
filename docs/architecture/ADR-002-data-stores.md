# ADR-002: Data Stores Selection

## Decision
- ClickHouse for ticks and high-volume features
- Timescale/Postgres for portfolio state, orders, fills, risk
- Redis for low-latency caches and ephemeral coordination
- Qdrant for embedding/vector operations

## Context
Different access patterns and volumes demand purpose-fit stores.

## Consequences
- Optimized cost/perf per workload; more infra to operate; need ETL and schema governance.
