"use client";
import { useSwarm } from "../store/useSwarm";

export default function OpsNotes() {
  const notes = useSwarm((s) => s.notes);
  return (
    <div className="bg-yellow-50 p-4 rounded shadow">
      <h2 className="font-bold mb-2">📝 Ops Notes</h2>
      <ul className="space-y-1">
        {notes.map((n: any) => (
          <li key={n.id}>⚠️ {n.note}</li>
        ))}
      </ul>
    </div>
  );
}


