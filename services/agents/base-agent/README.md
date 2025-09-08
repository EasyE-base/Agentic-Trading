# Base Agent

Dev setup:

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/base_agent/roundtrip.py
```

# Base Agent Service

An example agent using the Swarm Agent SDK. It logs a heartbeat via a telemetry tool.

## Run
```bash
python -m base_agent.main
```
