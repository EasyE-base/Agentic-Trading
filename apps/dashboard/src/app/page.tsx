"use client";
import Leaderboard from "../components/Leaderboard";
import OpsNotes from "../components/OpsNotes";
import TuningHints from "../components/TuningHints";
import { useMockStream } from "../hooks/useMockStream";

export default function Home() {
  useMockStream();
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <Leaderboard />
      <OpsNotes />
      <TuningHints />
    </div>
  );
}


