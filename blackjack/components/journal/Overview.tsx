"use client";
import { GhostButton, Panel } from "../ui";

/** The first two things to do in an empty journal (or an empty bankroll), instead of a page of $0 figures. */
export function GetStarted({ bankrollName, onCash, onLog, onImport }: { bankrollName?: string; onCash: () => void; onLog: () => void; onImport?: () => void }) {
  const steps = [
    { title: bankrollName ? `Record ${bankrollName}'s starting amount` : "Record your starting bankroll", body: "Risk of ruin is priced on real money, so add what you've set aside for play.", action: <GhostButton onClick={onCash}><i className="fa-solid fa-money-bill-transfer mr-2 text-xs" aria-hidden="true" />Deposit / withdrawal</GhostButton> },
    { title: "Log your first session", body: "After you play, enter the date, hours and what you won or lost. You'll see how it compares with what the game should pay.", action: <GhostButton onClick={onLog}><i className="fa-solid fa-plus mr-2 text-xs" aria-hidden="true" />Log your first session</GhostButton> },
  ];
  return (
    <Panel aria-labelledby="journal-start-title">
      <h2 id="journal-start-title" className="text-lg font-semibold">{bankrollName ? `Nothing in “${bankrollName}” yet` : "Start your journal"}</h2>
      {bankrollName && <p className="mt-1 text-sm text-[var(--ink-muted)]">Record its starting amount or log a session to it.</p>}
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-2xl border border-[var(--rule)] p-4">
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-data text-xs font-semibold text-[var(--paper)]">{index + 1}</span>
            <div className="grid min-w-0 content-start gap-2">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm leading-6 text-[var(--ink-muted)]">{step.body}</p>
              <div>{step.action}</div>
            </div>
          </li>
        ))}
      </ol>
      {onImport && (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">
          Have a backup? <button type="button" onClick={onImport} className="min-h-11 font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">Import it</button>
        </p>
      )}
    </Panel>
  );
}

/** Stands in for the overview until the journal has been read, so it never flashes "$0" and "No sessions". */
export function OverviewSkeleton({ message }: { message?: string }) {
  const block = "animate-pulse rounded-xl bg-overlay/[.07] motion-reduce:animate-none";
  return (
    <div aria-busy="true" className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel className="grid gap-3"><div className={`${block} h-6 w-40`} /><div className={`${block} h-24`} /><div className="grid grid-cols-2 gap-3"><div className={`${block} h-20`} /><div className={`${block} h-20`} /></div></Panel>
      <Panel className="grid gap-3"><div className={`${block} h-6 w-48`} /><div className={`${block} h-64`} /></Panel>
      <p role="status" className="text-sm text-[var(--ink-muted)] xl:col-span-2">{message ?? "Loading your journal…"}</p>
    </div>
  );
}
