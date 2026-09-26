"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { DrillSummary, type SummaryTile } from "@/components/drill";
import { announce, Callout, Disclosure, Panel, PanelHeader } from "@/components/ui";
import { countingBenchmarkDetails, countingCategoryLabel, ERROR_CATEGORY_LABEL } from "@/lib/blackjack/countingTraining";
import type { Mistake, Session } from "@/lib/statistics/storage";
import { useStoredSessions } from "./hooks";

const verdict = (accuracy: number) => accuracy >= 95 ? "Excellent. Try more speed or a harder session." : accuracy >= 85 ? "Solid. A little more practice will make it automatic." : accuracy >= 70 ? "Getting there. Look at the misses below, then go again." : "Worth another round. Slow down and focus on the misses below.";

function MistakeItem({ mistake }: { mistake: Mistake }) {
  return (
    <li className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <b className="text-[var(--ink)]">{mistake.question}</b>
        {mistake.category && <span className="rounded-full border border-[var(--rule)] px-2 py-px text-[.7rem] font-semibold text-[var(--ink-muted)]">{ERROR_CATEGORY_LABEL[mistake.category] ?? mistake.category}</span>}
      </div>
      <p className="mt-1 font-data text-[.8rem]">
        <span className="text-[var(--negative)]"><i className="fa-solid fa-xmark mr-1" aria-hidden="true" />You: {mistake.userAnswer}</span>
        <span className="text-[var(--ink-muted)]"> · </span>
        <span className="text-[var(--accent)]"><i className="fa-solid fa-check mr-1" aria-hidden="true" />Correct: {mistake.correctAnswer}</span>
      </p>
      {mistake.explanation && <p className="mt-1 leading-6 text-[var(--ink-muted)]">{mistake.explanation}</p>}
    </li>
  );
}

/** The misses, most common slip first; the first five show and the rest fold away. */
function Mistakes({ mistakes }: { mistakes: readonly Mistake[] }) {
  const tally = new Map<string, number>();
  for (const mistake of mistakes) if (mistake.category) tally.set(mistake.category, (tally.get(mistake.category) ?? 0) + 1);
  const [common, count] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [];
  return (
    <Panel>
      <PanelHeader title={`Mistakes (${mistakes.length})`} description={common && count && count > 1 ? <>Most common slip: <b className="text-[var(--ink)]">{ERROR_CATEGORY_LABEL[common as keyof typeof ERROR_CATEGORY_LABEL] ?? common}</b> ({count})</> : undefined} />
      <ol className="space-y-2.5">{mistakes.slice(0, 5).map((mistake, index) => <MistakeItem key={index} mistake={mistake} />)}</ol>
      {mistakes.length > 5 && (
        <Disclosure className="mt-3" summary={`Show all ${mistakes.length} mistakes`}>
          <ol start={6} className="space-y-2.5">{mistakes.slice(5).map((mistake, index) => <MistakeItem key={index + 5} mistake={mistake} />)}</ol>
        </Disclosure>
      )}
    </Panel>
  );
}

/**
 * The end of a counting session: the shared drill summary with a readable
 * breakdown, the misses grouped by cause, and where the session leaves the
 * reader against its Counting Benchmark target. The session is already saved
 * when this shows.
 */
export function CountingSummary({ session, title, tiles, onNew, onChangeSetup, highlight }: {
  session: Session;
  title: "Running Count" | "True Count" | "Deck Estimation";
  tiles: ReadonlyArray<SummaryTile>;
  onNew: () => void;
  onChangeSetup: () => void;
  /** A result worth celebrating, such as a perfect deck. */
  highlight?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sessions = useStoredSessions();
  const target = countingBenchmarkDetails(sessions).find((detail) => detail.drill === title)!;
  useEffect(() => {
    scrollTo({ top: 0 });
    root.current?.querySelector<HTMLElement>("[data-drill-focus]")?.focus({ preventScroll: true });
    announce(`Session complete. ${session.correct} of ${session.questions} correct.`);
  }, [session]);
  const rows = Object.entries(session.categories ?? {}).map(([key, value]) => ({ label: countingCategoryLabel(key), correct: value.correct, total: value.total }));
  return (
    <div ref={root}>
      <DrillSummary
        session={session}
        title={title}
        message={<><b className="font-data text-[var(--ink)]">{session.correct} of {session.questions} correct.</b> {verdict(session.accuracy)}</>}
        tiles={tiles}
        newLabel="Try again"
        onNew={onNew}
        onChangeSetup={onChangeSetup}
        breakdown={rows.length ? { title: "Breakdown", rows } : undefined}
        detail={
          <div className="space-y-5">
            {highlight && <Callout tone="good" title={highlight} />}
            <Callout tone={target.met ? "good" : "info"} title={target.met ? `Benchmark met: ${target.label}` : `${target.label}: not yet`} action={<Link href="/training/benchmark" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--accent)] hover:underline">Counting Benchmark <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" /></Link>}>
              Latest: {target.latest}.{target.note && ` ${target.note}`}
            </Callout>
            {session.mistakes.length ? <Mistakes mistakes={session.mistakes} /> : <Callout tone="good" title="No mistakes. Clean session." />}
          </div>
        }
      />
    </div>
  );
}
