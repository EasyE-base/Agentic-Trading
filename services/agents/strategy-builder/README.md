# Strategy Builder Agent

Dev setup:

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/strategy_builder/main.py
```


