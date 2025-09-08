"use client";
import { useSwarm } from "../store/useSwarm";

export default function Leaderboard() {
  const reports = useSwarm((s) => s.reports);
  const board = (reports.find((r: any) => r.type === "leaderboard")?.board || []) as Array<any>;
  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="font-bold mb-2">🏆 Leaderboard</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Agent</th>
            <th>PnL</th>
            <th>Win%</th>
            <th>EQS</th>
          </tr>
        </thead>
        <tbody>
          {board.map((row: any) => (
            <tr key={row.agent}>
              <td>{row.agent}</td>
              <td>{row.pnl}</td>
              <td>{row.winRate}%</td>
              <td>{row.eqs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


