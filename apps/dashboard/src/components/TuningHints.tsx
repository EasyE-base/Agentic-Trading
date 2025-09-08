"use client";
import { useSwarm } from "../store/useSwarm";

export default function TuningHints() {
  const hints = useSwarm((s) => s.hints);
  const removeHint = useSwarm((s) => s.removeHint);

  const handle = (h: any, action: "apply" | "dismiss") => {
    console.log("Send control:", { hint: h, action });
    // TODO: publish control msg to MCP topic `tuning_hints_control`
    removeHint(h.id);
  };

  return (
    <div className="bg-blue-50 p-4 rounded shadow">
      <h2 className="font-bold mb-2">⚙️ Tuning Hints</h2>
      <ul className="space-y-2">
        {hints.map((h: any) => (
          <li key={h.id} className="flex justify-between">
            <span>
              {h.component} → {h.action} ({h.delta}) [{h.reason}]
            </span>
            <div className="space-x-2">
              <button
                className="px-2 py-1 bg-green-600 text-white rounded"
                onClick={() => handle(h, "apply")}
              >
                Apply
              </button>
              <button
                className="px-2 py-1 bg-gray-400 text-white rounded"
                onClick={() => handle(h, "dismiss")}
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}


