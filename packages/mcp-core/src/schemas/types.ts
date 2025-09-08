export type MCPRole = 'signal' | 'sentiment' | 'trend' | 'strategy' | 'risk' | 'execution' | 'meta';

export interface MCPMessage<T = any> {
  id: string;
  sender: string;
  role: MCPRole;
  topic: string;
  timestamp: number;
  payload: T;
}

export interface Observation {
  asset: string;
  metrics: Record<string, number>;
  timestamp: number;
}

export interface Action {
  actionType: 'buy' | 'sell' | 'hold';
  asset: string;
  size: number;
  confidence: number;
  notes?: string;
}

export interface Reward {
  agent: string;
  tradeId: string;
  profitLoss: number;
  metrics: Record<string, number>;
}


