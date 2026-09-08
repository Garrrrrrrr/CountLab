"use client";

import type { ReactNode } from "react";
import type { SimulatedShoe } from "@/lib/blackjack/shoeSimulation";
import type { FullShoeGradingCategory, FullShoeReport } from "@/lib/blackjack/fullShoeSession";
import { HandReplayer } from "./HandReplayer";
import { Panel } from "./ui";

const durationLabel = (milliseconds: number) => {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * One shoe's score card and replayer. Shared by the report shown the moment a
 * shoe ends and by the report reopened from the saved-shoe archive, so the two
 * cannot drift apart.
 */
export function ShoeReportView({
  eyebrow,
  title,
  subtitle,
  actions,
  report,
  shoe,
  onBack,
  backLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  report: FullShoeReport;
  shoe: SimulatedShoe;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-zinc-400">{subtitle}</p>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Overall accuracy", `${report.accuracy}%`],
            ["Hands played", report.handsPlayed],
            ["Duration", durationLabel(report.durationMs)],
            ["Net result", `${report.netResult >= 0 ? "+" : ""}$${report.netResult.toFixed(2)}`],
            ["Decisions", report.decisions],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p><strong className="mt-1 block text-2xl">{value}</strong></div>)}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(Object.entries(report.categories) as Array<[FullShoeGradingCategory, { correct: number; total: number; accuracy: number }]>).map(([category, result]) => (
            <div key={category} className="rounded-xl border border-white/[.06] bg-white/[.025] p-4">
              <p className="text-sm font-semibold">{category}</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-300">{result.accuracy}%</p>
              <p className="mt-1 text-xs text-zinc-500">{result.correct} of {result.total} correct</p>
            </div>
          ))}
        </div>
      </Panel>

      <HandReplayer shoe={shoe} onBack={onBack} backLabel={backLabel} title="Hand Review" />
    </div>
  );
}
