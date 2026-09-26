"use client";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { Callout, GhostButton, Panel, PanelHeader } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { countingBenchmarkDetails } from "@/lib/blackjack/countingTraining";
import type { DrillProgress, Session } from "@/lib/statistics/storage";
import { relativeTime } from "./hooks";

/** The sentence above Start that says exactly what is about to happen. */
export function SessionSentence({ parts }: { parts: readonly string[] }) {
  return (
    <p className="border-t border-[var(--rule)] pt-4 text-sm leading-6 text-[var(--ink)]">
      <span className="sr-only">This session: </span>
      {parts.map((part, index) => (
        <span key={part}>{index > 0 && <span aria-hidden="true" className="text-[var(--ink-muted)]"> · </span>}{index > 0 && <span className="sr-only">, </span>}{part}</span>
      ))}
    </p>
  );
}

/** Shown when the values match no session card, so an unchecked list does not look broken. */
export function CustomNote({ resetLabel, onReset }: { resetLabel: string; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink-muted)]">
      <span><i className="fa-solid fa-sliders mr-1.5 text-xs" aria-hidden="true" />Custom settings: none of the sessions above matches.</span>
      <GhostButton size="compact" onClick={onReset}>{resetLabel}</GhostButton>
    </div>
  );
}

/**
 * Unfinished progress the drill did not resume by itself: too old to drop
 * the reader straight back into, or synced from another device after the
 * page opened. Resuming or discarding is the reader's choice.
 */
export function UnfinishedCallout({ progress, detail, onResume, onDiscard }: { progress: DrillProgress; detail: string; onResume: () => void; onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const when = relativeTime(progress.updatedAt);
  return (
    <>
      <Callout
        tone="info"
        title="You have an unfinished session"
        action={<><GhostButton size="compact" onClick={onResume}><i className="fa-solid fa-play mr-1.5 text-xs" aria-hidden="true" />Resume it</GhostButton><GhostButton size="compact" onClick={() => setConfirming(true)}>Discard it</GhostButton></>}
      >
        {detail}{when && ` · saved ${when}`}
      </Callout>
      <ConfirmModal open={confirming} tone="danger" title="Discard this session?" description="Your answers so far will not be saved to your stats." confirmLabel="Discard session" cancelLabel="Keep it" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onDiscard(); }} />
    </>
  );
}

/** Why the setup is pre-configured when the reader came from a target, a weak spot or the Test Out report. */
export function FocusCallout({ children, action, onDismiss }: { children: ReactNode; action?: ReactNode; onDismiss: () => void }) {
  return <Callout tone="info" title="Focused practice" action={action} onDismiss={onDismiss}>{children}</Callout>;
}

const HI_LO = [
  { ranks: ["2", "3", "4", "5", "6"], value: "+1", tone: "text-[var(--info)]" },
  { ranks: ["7", "8", "9"], value: "0", tone: "text-[var(--ink-muted)]" },
  { ranks: ["10", "J", "Q", "K", "A"], value: "−1", tone: "text-[var(--count-hot)]" },
] as const;

/** The Hi-Lo card values: the whole method in three rows. */
export function HiLoValues({ compact = false }: { compact?: boolean }) {
  return (
    <dl className={compact ? "grid gap-1.5 sm:grid-cols-3" : "grid gap-2"}>
      {HI_LO.map((row) => (
        <div key={row.value} className="flex items-center justify-between gap-3 rounded-lg bg-overlay/[.04] px-2.5 py-1.5">
          <dt className="flex flex-wrap gap-1 font-data text-xs font-semibold text-[var(--ink)]">
            {row.ranks.map((rank) => <span key={rank} className="grid h-6 min-w-6 place-items-center rounded border border-[var(--rule)] bg-[var(--paper-raised)] px-1">{rank}</span>)}
          </dt>
          <dd className={`font-data text-sm font-semibold ${row.tone}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Phones see the aside only below the setup, so first-timers get the values up front. */
export function HiLoStrip() {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3 lg:hidden">
      <p className="mb-2 text-xs font-semibold text-[var(--ink)]">Hi-Lo: add each card&apos;s value as it appears</p>
      <HiLoValues compact />
    </div>
  );
}

/** A setup aside card (a plain section, not <aside>, so it prints). */
export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="!p-4 sm:!p-5">
      <PanelHeader title={title} level={2} />
      <div className="-mt-1 text-sm leading-6 text-[var(--ink-muted)]">{children}</div>
    </Panel>
  );
}

/**
 * The reader's history with this drill and where it stands against its
 * Counting Benchmark target.
 */
export function YourProgress({ drill, sessions, allSessions, best }: { drill: "Running Count" | "True Count" | "Deck Estimation"; sessions: Session[]; allSessions: Session[]; best: { label: string; value: string } }) {
  const last = sessions[0];
  const target = countingBenchmarkDetails(allSessions).find((detail) => detail.drill === drill)!;
  return (
    <AsideCard title="Your progress">
      <dl className="divide-y divide-[var(--rule)]">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt>Last session</dt>
          <dd className={`text-right ${last ? "font-data text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>{last ? `${last.accuracy}% · ${relativeTime(last.date)}` : "No sessions yet"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt>{best.label}</dt>
          <dd className="text-right font-data text-[var(--ink)]">{best.value}</dd>
        </div>
        <div className="py-2">
          <dt className="flex items-center justify-between gap-3">
            <span>Benchmark</span>
            {target.met
              ? <span className="text-xs font-semibold text-[var(--accent)]"><i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />Met</span>
              : <span className="text-xs font-semibold text-[var(--ink-muted)]"><i className="fa-regular fa-circle mr-1" aria-hidden="true" />Not yet</span>}
          </dt>
          <dd className="mt-1 text-xs leading-5">{target.label}. {target.latest}.</dd>
        </div>
      </dl>
      <Link href="/training/benchmark" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--accent)] hover:underline">Counting Benchmark <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" /></Link>
    </AsideCard>
  );
}
