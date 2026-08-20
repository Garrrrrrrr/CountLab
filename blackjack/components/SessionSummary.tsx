"use client";

import Link from "next/link";
import { Session } from "@/lib/statistics/storage";
import { Button, GhostButton, Panel } from "./ui";

export function SessionSummary({
  session,
  onNew,
  onRetry,
}: {
  session: Session;
  onNew: () => void;
  onRetry?: () => void;
}) {
  const metrics = [
    ["Accuracy", `${session.accuracy}%`],
    ["Average response", `${(session.averageResponseTime / 1000).toFixed(1)}s`],
    ["Best streak", session.bestStreak],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <span className="text-xs font-bold uppercase tracking-[.25em] text-emerald-400">Session complete</span>
        <h1 className="mt-2 text-4xl font-semibold">{session.correct} / {session.questions}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map(([label, value], index) => (
          <div key={label} className={`surface rounded-2xl p-4 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
            <p className="text-sm text-zinc-500">{label}</p>
            <b className="mt-1 block text-2xl">{value}</b>
          </div>
        ))}
      </div>
      {session.mistakes.length > 0 && (
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Mistakes</h2>
          <div className="max-h-[50svh] space-y-3 overflow-y-auto pr-1">
            {session.mistakes.map((mistake, index) => (
              <div key={index} className="rounded-xl bg-black/20 p-4 text-sm">
                <b>{mistake.question}</b>
                <p className="mt-1 text-red-300">You: {mistake.userAnswer} · Correct: {mistake.correctAnswer}</p>
                <p className="mt-1 text-zinc-400">{mistake.explanation}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <div className="grid gap-3 sm:flex sm:flex-wrap">
        {onRetry && session.mistakes.length > 0 && <GhostButton className="w-full sm:w-auto" onClick={onRetry}>Retry mistakes</GhostButton>}
        <Button className="w-full sm:w-auto" onClick={onNew}>New session</Button>
        <Link className="block" href="/dashboard"><GhostButton className="w-full sm:w-auto">Dashboard</GhostButton></Link>
      </div>
    </div>
  );
}
