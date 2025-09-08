# Signal Agent

Computes a simple RSI(5) signal from synthetic OHLCV and writes to feature-store.

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/signal_agent/main.py
```


