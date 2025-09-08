# Risk Agent

Calls `risk-engine.pretrade_check` then `broker-gateway.submit_order` if approved.

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/risk_agent/main.py
```



