import { describe, it, expect } from 'vitest';

async function call(tool: string, input: unknown) {
  const url = 'http://localhost:4004/call';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input }) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

describe('backtester tools', () => {
  it('health responds', async () => {
    const h = await fetch('http://localhost:4004/health');
    expect(h.ok).toBe(true);
  });

  it('run returns trades and pnl', async () => {
    const prices = [
      { ts: '2024-01-01T00:00:00Z', price: 100 },
      { ts: '2024-01-02T00:00:00Z', price: 101 },
      { ts: '2024-01-03T00:00:00Z', price: 99 }
    ];
    const out = await call('backtester.run', { prices, threshold: 0.5 });
    expect(Array.isArray(out.trades)).toBe(true);
    expect(typeof out.pnl).toBe('number');
  });
});


