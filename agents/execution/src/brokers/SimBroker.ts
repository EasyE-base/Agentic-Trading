import { IBroker, SubmitOrder, ExecReport, Fill } from "./IBroker";

export class SimBroker implements IBroker {
  private orders = new Map<string, { o: SubmitOrder; fills: Fill[]; submittedAt: number; done: boolean }>();

  async submit(o: SubmitOrder): Promise<string> {
    const id = crypto.randomUUID();
    this.orders.set(id, { o, fills: [], submittedAt: Date.now(), done: false });
    return id;
  }

  async poll(orderId: string): Promise<ExecReport> {
    const state = this.orders.get(orderId);
    if (!state) throw new Error("order not found");

    const base = 150 + Math.sin(Date.now() / 2000);
    const impact = (state.o.qty / 10000) * (state.o.side === "buy" ? +0.08 : -0.08);
    const now = Date.now();

    if (!state.done) {
      const filled = state.fills.reduce((a, b) => a + b.qty, 0);
      const remaining = Math.max(0, state.o.qty - filled);
      const chunk = Math.max(1, Math.floor(state.o.qty * 0.2));
      const fillQty = Math.min(chunk, remaining);

      const inWindow = !state.o.startMs || !state.o.endMs || (now >= state.o.startMs && now <= state.o.endMs);
      if (inWindow && fillQty > 0) {
        let px = base + impact + (Math.random() - 0.5) * 0.06;
        if (state.o.type === "LMT" && state.o.limitPrice !== undefined) {
          const ok = state.o.side === "buy" ? px <= state.o.limitPrice : px >= state.o.limitPrice;
          if (!ok) return this.report(orderId);
        }
        state.fills.push({ qty: fillQty, price: Number(px.toFixed(4)), ts: now, venue: "SIM" });
      }
      if (state.fills.reduce((a, b) => a + b.qty, 0) >= state.o.qty || (state.o.endMs && now > state.o.endMs)) {
        state.done = true;
      }
    }
    return this.report(orderId);
  }

  async cancel(orderId: string): Promise<void> {
    const s = this.orders.get(orderId); if (s) s.done = true;
  }

  private report(orderId: string): ExecReport {
    const s = this.orders.get(orderId)!;
    const qty = s.fills.reduce((a, b) => a + b.qty, 0);
    const notional = s.fills.reduce((a, b) => a + b.qty * b.price, 0);
    const avg = qty ? notional / qty : 0;
    const ref = 150;
    const slippageBps = avg ? ((avg - ref) / ref) * 1e4 * (s.o.side === "buy" ? 1 : -1) : 0;
    return {
      orderId,
      submittedAt: s.submittedAt,
      fills: s.fills,
      avgPrice: Number(avg.toFixed(4)),
      slippageBps: Number(slippageBps.toFixed(2)),
      status: qty === 0 ? "rejected" : s.done ? "filled" : "partial",
    };
  }
}


