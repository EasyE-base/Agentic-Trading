# Agentic Trading Swarm — Master Plan

## Principles
- Agentic Swarm AI (modular, decentralized, MCP-native)
- Patterns: Mediator, Observer, Pub/Sub, Broker

## Agents (MVP)
- Signal, Sentiment, Trend, Strategy Builder, Risk, Execution, Self-Eval/Meta

## MCP Collaboration
- Mediator: mcp-host routing to services
- Pub/Sub: Redpanda topics (blackboard)
- Structured JSON contracts + versioning

## Schemas (draft)
- features, signals, sentiment, trends, proposals, risk_decisions, orders, fills, metrics

## Topics (draft)
- raw.market.*, features.*, signals.*, intents.*, orders.*, fills.*, risk.*, metrics.*

## Data layer
- ClickHouse (ticks/features), Timescale (portfolio), Redis (cache), Qdrant (embeddings)

## Servers (tools)
- market-data, feature-store, nlp-sentiment, backtester, risk-engine, broker-gateway, policy-engine, telemetry

## E2E Flows
- Proposal → Risk → Execution loop; feedback to Self-Eval; shadow vs live

## UI
- Command Bar, Agent Canvas, Performance Dashboard

## Safeguards
- Risk limits, circuit breakers, policy checks, audit logs, drift monitoring

## Milestones
- M0: Synthetic E2E
- M1: Persistence + schemas
- M2: NLP + Policy + basic UI
- M3: Execution sim + risk checks + dashboards
