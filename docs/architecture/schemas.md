# Message Schemas (Draft)

## features
- ts: ISO string
- symbol: string
- feature_set: string
- feature_name: string
- value: number
- ver: string
- source: string (optional)

## signals
- ts, symbol
- signal_id: string
- score: number
- horizon: string
- confidence: number
- features_ref: string
- strategy_ref: string

## sentiment
- ts, symbol
- provider: string
- score: number (-1..1)
- magnitude: number
- tags: string[]

## trends
- ts, symbol
- regime: string
- momentum: number
- trend_strength: number

## proposals
- ts
- strategy_id: string
- symbol: string
- side: 'BUY'|'SELL'
- qty: number
- entry: number (optional)
- target: number (optional)
- stop: number (optional)
- rationale_ref: string
- risk_req: object

## risk_decisions
- ts
- proposal_id: string
- status: 'APPROVED'|'ADJUSTED'|'REJECTED'
- notes: string
- adjustments: object (optional)

## orders
- ts
- cl_ord_id: string
- side: 'BUY'|'SELL'
- qty: number
- price: number (optional)
- tif: string
- venue: string
- strategy_id: string
- risk_decision: string

## fills
- ts
- cl_ord_id: string
- exec_id: string
- price: number
- qty: number
- fee: number
- venue: string

## risk
- ts
- portfolio_id: string
- metric: string
- value: number
- window: string

## metrics
- ts
- name: string
- value: number
- labels: Record<string,string>
