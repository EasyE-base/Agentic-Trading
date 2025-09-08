export type OrderSide = "buy" | "sell";
export type OrderType = "MKT" | "LMT" | "TWAP" | "VWAP";

export interface SubmitOrder {
  asset: string; side: OrderSide; qty: number; type: OrderType;
  limitPrice?: number;
  startMs?: number; endMs?: number;
}

export interface Fill { qty: number; price: number; ts: number; venue: string; }

export interface ExecReport {
  orderId: string; submittedAt: number; fills: Fill[];
  avgPrice: number; slippageBps: number; status: "filled"|"partial"|"rejected"|"cancelled";
}

export interface IBroker {
  submit(o: SubmitOrder): Promise<string>;
  poll(orderId: string): Promise<ExecReport>;
  cancel(orderId: string): Promise<void>;
}


