# Feature Store

M1 adds optional ClickHouse and Postgres (Timescale) backends. Defaults to in-memory.

## Run (memory backend)
```bash
pnpm --filter @swarm/feature-store dev
```

## Run (ClickHouse backend)
Set env:
```bash
export FEATURE_STORE_BACKEND=clickhouse
export CLICKHOUSE_URL=http://localhost:8123
# optional
export CLICKHOUSE_DB=default
export CLICKHOUSE_USER=default
export CLICKHOUSE_PASSWORD=
```
Then:
```bash
pnpm --filter @swarm/feature-store dev
```

## Run (Postgres/Timescale backend)
Set env:
```bash
export FEATURE_STORE_BACKEND=postgres
export POSTGRES_URL=postgres://swarm:swarm@localhost:5432/swarm
```
Then:
```bash
pnpm --filter @swarm/feature-store dev
```

## Tools
- feature-store.write_features
- feature-store.get_features

Schemas are documented in `docs/architecture/schemas.md`.
