import { create } from "zustand";

type AgentStatus = "idle" | "running" | "error" | "shadow";

export interface AgentData {
  id: string;
  role: string;
  state: AgentStatus;
  stats: {
    pnl: number;
    trades: number;
    latency: number;
    slippage: number;
  };
}

interface SwarmState {
  agents: Record<string, AgentData>;
  updateAgent: (id: string, data: Partial<AgentData>) => void;
}

interface SwarmUI {
  reports: any[];
  notes: any[];
  hints: any[];
  addReport: (r: any) => void;
  addNote: (n: any) => void;
  addHint: (h: any) => void;
  removeHint: (id: string) => void;
}

export const useSwarm = create<SwarmState & SwarmUI>((set) => ({
  agents: {},
  reports: [],
  notes: [],
  hints: [],
  updateAgent: (id, data) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: {
          ...state.agents[id],
          ...data,
        } as AgentData,
      },
    })),
  addReport: (r) => set((s) => ({ reports: [r, ...s.reports].slice(0, 50) })),
  addNote: (n) => set((s) => ({ notes: [n, ...s.notes].slice(0, 50) })),
  addHint: (h) => set((s) => ({ hints: [h, ...s.hints].slice(0, 20) })),
  removeHint: (id) => set((s) => ({ hints: s.hints.filter((h) => h.id !== id) })),
}));


