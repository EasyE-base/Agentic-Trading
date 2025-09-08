# Sentiment Agent

Calls `nlp-sentiment.score_texts` and writes an average sentiment feature to feature-store.

```bash
export HOST_URL=${HOST_URL:-http://localhost:4000}
python -m venv .venv && source .venv/bin/activate
pip install -e ../../../../packages/python-agent-sdk -e .
python src/sentiment_agent/main.py
```



