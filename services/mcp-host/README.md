# MCP Host — M0 Demo

Start services (in separate terminals):

```bash
pnpm --filter @swarm/market-data dev
pnpm --filter @swarm/feature-store dev
pnpm --filter @swarm/risk-engine dev
pnpm --filter @swarm/backtester dev
pnpm --filter @swarm/mcp-host dev
```

Python venv and agents:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ../../packages/python-agent-sdk -e ../agents/base-agent -e ../agents/execution-agent -e ../agents/strategy-builder -e ../agents/signal-agent
export HOST_URL=http://localhost:4000
python ../agents/signal-agent/src/signal_agent/main.py
python ../agents/strategy-builder/src/strategy_builder/main.py
python ../agents/execution-agent/src/execution_agent/main.py
```


