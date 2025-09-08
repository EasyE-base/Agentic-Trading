import { useEffect } from "react";
import { useSwarm } from "../store/useSwarm";

export function useMockStream() {
  const { addReport, addNote, addHint } = useSwarm();
  useEffect(() => {
    const rep = { id: "r1", type: "leaderboard", board: [{ agent: "strategy-agent", pnl: 1200, winRate: 62, eqs: 0.82 }] };
    const note = { id: "n1", note: "High slippage on TSLA trade" };
    const hint = { id: "h1", component: "sentiment", action: "decrease_weight", delta: 0.1, reason: "overfitting" };
    addReport(rep);
    addNote(note);
    addHint(hint);
  }, [addReport, addNote, addHint]);
}


