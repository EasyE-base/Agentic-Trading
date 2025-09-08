import { describe, it, expect } from 'vitest';

async function call(tool: string, input: unknown) {
  const url = 'http://localhost:4003/call';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input }) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

describe('risk-engine tools', () => {
  it('health/metrics respond', async () => {
    const h = await fetch('http://localhost:4003/health');
    expect(h.ok).toBe(true);
    const m = await fetch('http://localhost:4003/metrics');
    expect(m.ok).toBe(true);
  });

  it('calc computes gross and breaches', async () => {
    const out = await call('risk-engine.calc', { positions: [{ symbol: 'AAPL', qty: 1, price: 200 }], limits: { maxGross: 50, maxSingle: 100 } });
    expect(out.gross).toBeGreaterThan(0);
    expect(Array.isArray(out.breaches)).toBe(true);
    expect(out.breaches.includes('max_gross')).toBe(true);
  });

  it('pretrade_check approves small order', async () => {
    const out = await call('risk-engine.pretrade_check', { symbol: 'AAPL', side: 'BUY', qty: 1, price: 1, limits: { maxGross: 1000, maxSingle: 500 }, current: [] });
    expect(out.status).toBe('APPROVED');
  });
});


