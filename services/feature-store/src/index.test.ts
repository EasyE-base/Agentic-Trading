import { describe, it, expect } from 'vitest';

async function call(tool: string, input: unknown) {
  const url = 'http://localhost:4002/call';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, input }) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return await res.json();
}

describe('feature-store tools', () => {
  it('health and metrics endpoints respond', async () => {
    const h = await fetch('http://localhost:4002/health');
    expect(h.ok).toBe(true);
    const m = await fetch('http://localhost:4002/metrics');
    expect(m.ok).toBe(true);
  });

  it('write_features then get_features roundtrip', async () => {
    const ts = new Date().toISOString();
    const rows = [{ ts, symbol: 'AAPL', feature_set: 'test_set', feature_name: 'x', value: 1.23, ver: 'v1' }];
    const w = await call('feature-store.write_features', { feature_set: 'test_set', rows });
    expect(w.wrote).toBe(1);
    const g = await call('feature-store.get_features', { feature_set: 'test_set', symbol: 'AAPL' });
    expect(Array.isArray(g.rows)).toBe(true);
    expect(g.rows.find((r: any) => r.feature_name === 'x')).toBeTruthy();
  });
});


