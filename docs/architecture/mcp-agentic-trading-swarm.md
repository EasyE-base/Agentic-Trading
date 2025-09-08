# MCP-Native Agentic Trading Swarm — Architecture v1

Executive summary
- Multi-agent system where specialized agents collaborate via MCP to transform market data into executable, risk-managed trades, with continuous feedback improving performance.
- MCP is the backbone: agents are clients; shared capabilities are MCP servers (data, backtester, risk, broker, policy, telemetry, vector store).
- Separation of concerns: Python for quant ML, Rust for low-latency execution, TypeScript for orchestration and UI.

Recommended stack
- Orchestration: TypeScript Node MCP host with policy enforcement and telemetry.
- Agents: Python MCP clients (Ray optional).
- Execution gateway: Rust (Tokio) for broker connectivity and low-latency checks.
- Data: ClickHouse (ticks), Postgres/Timescale (portfolio), Redis (cache), S3 (artifacts), Qdrant/pgvector (embeddings).
- Event bus: Redpanda (Kafka-compatible).
- Observability: OpenTelemetry, Prometheus, Grafana, Loki.
- UI: Next.js TypeScript, Tailwind, shadcn/ui, visx/Recharts.

MCP-native topology
- MCP host connects to servers: market-data, feature-store, nlp-sentiment, backtester, risk-engine, broker-gateway, vector-store, policy-engine, telemetry.
- Agents: Signal, Sentiment, Trend, Strategy Builder, Risk, Execution, Portfolio & Evaluator.
- Blackboard via MCP tools backed by Kafka topics and feature store; host enforces tool scopes and policy.

Agents (roles, I/O, MCP usage)
- Signal Agent: inputs OHLCV and order book; outputs alpha signals; tools: market-data.get_ohlcv, feature-store.get_features, vector-store.upsert.
- Sentiment Agent: NLP on news and social; outputs normalized scores; tools: nlp-sentiment.ingest_stream, feature-store.write_features, vector-store.upsert.
- Trend Agent: regime and momentum detection; outputs regime_state and trend_score; tools: market-data.get_ohlcv, feature-store.write_features.
- Strategy Builder: composes strategies; backtests and selects champion vs challenger; tools: backtester.run, policy-engine.get_constraints.
- Risk Manager: pre-trade and portfolio risk; enforces limits; tools: risk-engine.calc, policy-engine.evaluate, broker-gateway.get_positions.
- Execution Agent: translates intents into orders; venue selection and child orders; tools: broker-gateway.submit_order, risk-engine.pretrade_check.
- Portfolio & Evaluator: attribution and feedback loops; tools: telemetry.metrics, broker-gateway.get_fills.

Servers (tools)
- market-data: get_ohlcv, get_orderbook, stream_trades.
- feature-store: get_features, write_features.
- nlp-sentiment: fetch_news, score_texts, stream_social.
- backtester: run, walk_forward, report.
- risk-engine: pretrade_check, portfolio_risk, stress_test.
- broker-gateway: submit_order, cancel, replace, get_positions, get_fills.
- vector-store: upsert, search.
- policy-engine: get_constraints, evaluate.
- telemetry: log, metrics.emit.

Collaboration and dataflow
- Topics: raw.market.*, features.*, signals.*, intents.*, orders.*, fills.*, risk.*, metrics.*.
- Memory: Redis (short), ClickHouse and Postgres (long), S3 (artifacts), Qdrant (embeddings).
- All writes validated by MCP servers with schemas and policy.

Self-evaluation and feedback
- Champion-challenger, online monitoring for drift, scheduled re-tuning, post-trade attribution, gated deployment.

Safeguards
- Hard limits, circuit breakers, policy engine rules, kill switches, data quality sentinels, audit trails.

Interfaces
- Command Bar for actions like backtests and deploys.
- Agent Visual Canvas for topology and health.
- Performance Dashboard for PnL, risk, and attribution.

Related documents
- Master Plan: docs/architecture/agentic-swarm-plan.md
- Schemas: docs/architecture/schemas.md
- Topics: docs/architecture/topics.md
- ADR Index: docs/architecture/ADRS.md

Deployment and operations
- Environments: dev, staging, prod; CI/CD with policy checks and gates; observability across tools with correlation IDs.

Environment defaults (dev)
- MCP host base URL: `HOST_URL=http://localhost:4000` (agents read from env)
- MCP host port: `PORT=4000` by default (overridable on the host service)
- Tool services (dev): `market-data:4001`, `feature-store:4002`, `risk-engine:4003`, `backtester:4004`

Minimal schemas (high level)
- features: ts, symbol, feature_set, feature_name, value, ver, source.
- signals: ts, symbol, signal_id, score, horizon, confidence, features_ref, strategy_ref.
- intents: ts, strategy_id, target, rationale_ref, risk_req.
- orders: ts, cl_ord_id, side, qty, price, tif, venue, strategy_id, risk_decision.
- fills: ts, cl_ord_id, exec_id, price, qty, fee, venue.
- risk: ts, portfolio_id, metric, value, window.