# ADR-001: MCP Collaboration Patterns

## Decision
Adopt a hybrid approach: Mediator (mcp-host) for tool routing and authorization; Pub/Sub (Redpanda) for blackboard data exchange; Observer subscriptions for agent-specific updates; Broker abstraction for future multi-venue execution routing.

## Context
Agents exchange structured JSON via MCP tools. We need scalable coordination, discoverability, and decoupling for data streams and commands.

## Consequences
- Clear separation of concerns; scalable topic distribution; traceable tool invocations.
- Slight complexity in maintaining both request/response and pub/sub channels.
