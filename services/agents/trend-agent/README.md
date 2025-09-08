# Trend Agent

Computes simple momentum and regime features from OHLCV and writes to feature-store.

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/trend_agent/main.py
```



