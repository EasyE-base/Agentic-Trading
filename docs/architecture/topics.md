# Topic Taxonomy & Conventions (Draft)

## Naming
- raw.market.<stream>
- features.<set>
- signals.<strategy>
- intents.<strategy>
- orders.<venue>
- fills.<venue>
- risk.<portfolio>
- metrics.<component>

## Conventions
- Messages carry `ts` (ISO), `cid` (correlation id), `source`, `version`
- Partition by `symbol` or `strategy_id` where applicable
- Use consumer groups per agent type; idempotent writes with keys

## Retention
- raw/feeds: short (hours–days)
- features/signals/orders/fills: medium (days–weeks) with archival to S3
- risk/metrics: per compliance and observability needs

## Security
- Topic ACLs per component; write/read scopes enforced by host/policy engine
