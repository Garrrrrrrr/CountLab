"use client";
import { useEffect, type ReactNode } from "react";
import { Settings2, Target } from "lucide-react";
import { Button, Card, ProgressBar, announce } from "@/components/ui";
import { DrillSummary, formatClock } from "@/components/drill/DrillKit";
import type { CategoryTotals } from "@/lib/statistics/drillRound";
import type { Session } from "@/lib/statistics/storage";

const SLOW_MS = 3000;

/** Accuracy per category, weakest first. */
export function CategoryBreakdown({ title, categories }: { title: string; categories: CategoryTotals }) {
  const rows = Object.entries(categories).map(([label, value]) => ({ label, ...value })).sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total);
  if (!rows.length) return null;
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <ul className="space-y-3">
        {rows.map((row) => {
          const pct = Math.round((row.correct / row.total) * 100);
          return (
            <li key={row.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{row.label}</span>
                <span className="tnum shrink-0 text-ink-2">{row.correct}/{row.total} · {pct}%</span>
              </div>
              <ProgressBar value={row.correct} max={row.total} label={`${row.label}: ${pct}% right`} tone={pct >= 90 ? "pos" : pct >= 70 ? "brand" : "neg"} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * The end of a strategy round: the score, what to do next (go again, retry
 * the misses, practise the slow ones), accuracy by category and the misses
 * with their reasons. Right-but-slow hands are listed too: the goal is plays
 * that are automatic, not just right.
 */
export function RoundSummary({ title, session, breakdownTitle, slow, onAgain, onRetry, onRetrySlow, onSetup, next, unit = "hands", children }: {
  title: string;
  session: Session;
  breakdownTitle: string;
  slow: readonly { id: number; text: string; ms: number }[];
  onAgain: () => void;
  onRetry?: () => void;
  onRetrySlow?: () => void;
  onSetup: () => void;
  next?: { href: string; label: string };
  unit?: string;
  children?: ReactNode;
}) {
  useEffect(() => { announce(`Round complete. ${session.correct} of ${session.questions} right.`); }, [session]);
  const retried = session.tags?.includes("retry");
  const misses = session.mistakes.length;
  return (
    <DrillSummary
      title={retried ? `${title}: retry done` : title}
      score={session.accuracy}
      scoreSub={<><span className="tnum font-semibold text-ink">{session.correct} of {session.questions}</span> {unit} right{misses === 0 ? ", no misses." : "."}</>}
      stats={[
        { label: "Average answer", value: `${(session.averageResponseTime / 1000).toFixed(1)} s` },
        { label: "Best streak", value: session.bestStreak },
        { label: "Misses", value: misses },
        { label: "Time answering", value: formatClock(session.averageResponseTime * session.questions) },
      ]}
      mistakes={session.mistakes}
      onAgain={onAgain}
      againLabel="Play again"
      next={next}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        {onRetry && misses > 0 && <Button variant="secondary" icon={<Target size={18} aria-hidden />} onClick={onRetry}>Retry {misses} {misses === 1 ? "miss" : "misses"}</Button>}
        <Button variant="secondary" icon={<Settings2 size={18} aria-hidden />} onClick={onSetup}>Change setup</Button>
      </div>
      <CategoryBreakdown title={breakdownTitle} categories={session.categories ?? {}} />
      {slow.length > 0 && (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Right but slow ({slow.length})</h2>
              <p className="mt-0.5 text-sm text-ink-2">Answered right, but in more than {SLOW_MS / 1000} seconds. Speed comes from seeing these often.</p>
            </div>
            {onRetrySlow && <Button variant="secondary" onClick={onRetrySlow}>Practise these</Button>}
          </div>
          <ul className="flex flex-wrap gap-2">
            {slow.map((hand) => (
              <li key={hand.id} className="tnum rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium">
                {hand.text} <span className="text-ink-3">{(hand.ms / 1000).toFixed(1)} s</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {children}
    </DrillSummary>
  );
}

export const slowAnswers = <H,>(log: readonly { ok: boolean; ms: number; number: number; hand: H }[], text: (hand: H) => string) =>
  log.filter((entry) => entry.ok && entry.ms > SLOW_MS).map((entry) => ({ id: entry.number, text: text(entry.hand), ms: entry.ms, hand: entry.hand }));
