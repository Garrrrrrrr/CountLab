"use client";
import Link from "next/link";
import { ReactNode } from "react";
import type { DrillType, Mistake, Session } from "@/lib/statistics/storage";
import { Button, ButtonLink, Disclosure, GhostButton, Panel, PanelHeader, ProgressMeter, StatTile, type Tone } from "../ui";

/** Where to go after each drill: the beginner path, then toward the full shoe. */
export const NEXT_DRILL: Partial<Record<DrillType, { label: string; href: string }>> = {
  "Running Count": { label: "Basic strategy", href: "/training/basic-strategy" },
  "Basic Strategy": { label: "True count", href: "/training/true-count" },
  "True Count": { label: "Deck estimation", href: "/training/deck-estimation" },
  "Deck Estimation": { label: "Index deviations", href: "/training/deviations" },
  "Deviations": { label: "H17 chart", href: "/training/h17-chart" },
  "H17 Chart": { label: "Full shoe", href: "/training/full-shoe" },
  "Counting Benchmark": { label: "Full shoe", href: "/training/full-shoe" },
};

const verdict = (accuracy: number) => accuracy >= 95 ? "Excellent. You are ready for more speed or a harder mode." : accuracy >= 85 ? "Solid. A little more practice will make it automatic." : accuracy >= 70 ? "Getting there. Review the misses below, then go again." : "Worth another round. Slow down and focus on the misses below.";

export type SummaryTile = { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; help?: ReactNode };

/**
 * The end of a round, the same for every drill: the score and what it means,
 * the key figures, where the misses cluster, each miss with its explanation,
 * and what to do next. "Go again" is the page's Enter action.
 */
export function DrillSummary({ session, onNew, onRetry, onChangeSetup, newLabel = "Go again", retryLabel = "Retry mistakes", eyebrow = "Session complete", title, message, tiles, breakdown, detail, mistakesTitle = "Mistakes", mistakeHref, next }: {
  session: Session;
  onNew: () => void;
  onRetry?: () => void;
  onChangeSetup?: () => void;
  newLabel?: string;
  retryLabel?: string;
  eyebrow?: string;
  title?: ReactNode;
  /** One sentence on what the score means; a default is derived from accuracy. */
  message?: ReactNode;
  tiles?: ReadonlyArray<SummaryTile>;
  breakdown?: { title: string; rows: ReadonlyArray<{ label: string; correct: number; total: number; href?: string }>; limit?: number };
  /** Replaces the mistakes list (e.g. a graded chart). */
  detail?: ReactNode;
  mistakesTitle?: string;
  mistakeHref?: (mistake: Mistake, index: number) => string | undefined;
  /** Overrides the default next drill; null hides it. */
  next?: { label: string; href: string } | null;
}) {
  const defaults: SummaryTile[] = [
    { label: "Accuracy", value: `${session.accuracy}%`, tone: session.accuracy >= 85 ? "good" : session.accuracy >= 70 ? "neutral" : "bad" },
    { label: "Average response", value: `${(session.averageResponseTime / 1000).toFixed(1)}s` },
    { label: "Best streak", value: session.bestStreak, sub: "correct in a row" },
  ];
  const nextDrill = next === undefined ? NEXT_DRILL[session.drill] : next;
  const rows = breakdown ? [...breakdown.rows].filter((row) => row.total > 0).sort((a, b) => a.correct / a.total - b.correct / b.total) : [];
  const shownRows = breakdown?.limit ? rows.slice(0, breakdown.limit) : rows;
  const mistakes = session.mistakes;
  const mistakeList = (items: readonly Mistake[], offset = 0) => (
    <ol className="space-y-2.5">
      {items.map((mistake, index) => {
        const href = mistakeHref?.(mistake, index + offset);
        return (
          <li key={index + offset} className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3.5 text-sm">
            <b className="text-[var(--ink)]">{mistake.question}</b>
            <p className="mt-1"><span className="text-[var(--negative)]">You: {mistake.userAnswer}</span> <span className="text-[var(--ink-muted)]">·</span> <span className="text-[var(--accent)]">Correct: {mistake.correctAnswer}</span></p>
            {mistake.explanation && <p className="mt-1 leading-6 text-[var(--ink-muted)]">{mistake.explanation}</p>}
            {href && <Link href={href} className="mt-1 inline-block text-xs font-semibold text-[var(--accent)] hover:underline">See it on the chart</Link>}
          </li>
        );
      })}
    </ol>
  );
  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-5">
      <div>
        <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">{eyebrow}</p>
        <h1 tabIndex={-1} data-drill-focus="" className="mt-2 font-display text-4xl font-semibold outline-none">{title ?? `${session.correct} / ${session.questions}`}</h1>
        <p className="mt-2 text-[var(--ink-muted)]">{message ?? verdict(session.accuracy)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(tiles ?? defaults).map((tile, index, all) => <StatTile key={tile.label} {...tile} className={all.length % 2 && index === all.length - 1 ? "col-span-2 sm:col-span-1" : ""} />)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onNew} className="w-full sm:w-auto">{newLabel}</Button>
        {onRetry && mistakes.length > 0 && <GhostButton onClick={onRetry} className="w-full sm:w-auto">{retryLabel}</GhostButton>}
        {onChangeSetup && <GhostButton onClick={onChangeSetup} className="w-full sm:w-auto">Change setup</GhostButton>}
        {nextDrill && <ButtonLink href={nextDrill.href} variant="quiet" className="w-full sm:w-auto">Next: {nextDrill.label} <i className="fa-solid fa-arrow-right ml-2 text-xs" aria-hidden="true" /></ButtonLink>}
      </div>
      {shownRows.length > 0 && (
        <Panel>
          <PanelHeader title={breakdown!.title} description="Weakest first." />
          <ul className="space-y-3">
            {shownRows.map((row) => {
              const share = row.correct / row.total;
              const label = `${row.label}: ${row.correct} of ${row.total} correct`;
              return (
                <li key={row.label}>
                  <div className="mb-1 flex justify-between gap-3 text-sm"><span>{row.href ? <Link href={row.href} className="hover:underline">{row.label}</Link> : row.label}</span><span className="font-data text-[var(--ink-muted)]">{row.correct}/{row.total}</span></div>
                  <ProgressMeter label={label} value={row.correct} max={row.total} tone={share >= 0.85 ? "good" : share >= 0.7 ? "warn" : "bad"} valueText={`${Math.round(share * 100)}%`} />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {detail ?? (mistakes.length > 0 && (
        <Panel>
          <PanelHeader title={`${mistakesTitle} (${mistakes.length})`} />
          {mistakeList(mistakes.slice(0, 5))}
          {mistakes.length > 5 && <Disclosure className="mt-3" summary={`Show ${mistakes.length - 5} more`}>{mistakeList(mistakes.slice(5), 5)}</Disclosure>}
        </Panel>
      ))}
    </div>
  );
}
