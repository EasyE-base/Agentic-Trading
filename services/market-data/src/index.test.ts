import { describe, it, expect } from 'vitest';

async function call(tool: string, input: unknown) {
  const url = 'http://localhost:4001/call';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input }) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

describe('market-data tools', () => {
  it('health endpoint responds', async () => {
    const res = await fetch('http://localhost:4001/health');
    expect(res.ok).toBe(true);
  });

  it('get_ohlcv returns rows', async () => {
    const out = await call('market-data.get_ohlcv', { symbol: 'AAPL', start: '2024-01-01', end: '2024-01-03', interval: '1d' });
    expect(Array.isArray(out.rows)).toBe(true);
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.rows[0]).toHaveProperty('close');
  });
});


