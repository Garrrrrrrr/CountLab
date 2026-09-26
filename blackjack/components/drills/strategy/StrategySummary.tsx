"use client";
import Link from "next/link";
import { ReactNode, useEffect } from "react";
import { DrillSummary, type SummaryTile } from "@/components/drill";
import { announce, Callout, GhostButton, Panel, PanelHeader } from "@/components/ui";
import type { Mistake, Session } from "@/lib/statistics/storage";

export interface SlowHand {
  id: number;
  text: string;
  ms: number;
}

/**
 * The end of a round: the drill's score first, then Play again (the Enter
 * action), retry and setup, the breakdown, and the hands to review with a
 * link to each one's chart cell. Correct-but-slow hands are listed too,
 * since the goal is decisions that are automatic, not just right.
 */
export function StrategySummary({ session, drillTitle, onPlayAgain, onRetry, onChangeSetup, breakdownTitle, mistakeHref, slow, onRetrySlow, footer, tiles }: {
  session: Session;
  drillTitle: string;
  onPlayAgain: () => void;
  onRetry?: () => void;
  onChangeSetup: () => void;
  breakdownTitle: string;
  mistakeHref: (mistake: Mistake) => string | undefined;
  slow: readonly SlowHand[];
  onRetrySlow?: () => void;
  footer?: ReactNode;
  tiles?: ReadonlyArray<SummaryTile>;
}) {
  // The page returns to the top and the heading takes focus on entering Summary (usePhaseEntry).
  useEffect(() => {
    announce(`Round complete. ${session.correct} of ${session.questions} correct.`);
  }, [session]);
  const rows = Object.entries(session.categories ?? {}).map(([label, value]) => ({ label, ...value }));
  const retried = session.tags?.includes("retry");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <DrillSummary
        session={session}
        eyebrow={retried ? "Retry complete" : "Round complete"}
        title={`${drillTitle}: ${session.correct} of ${session.questions}`}
        newLabel="Play again"
        onNew={onPlayAgain}
        onRetry={onRetry}
        retryLabel={`Retry mistakes (${session.mistakes.length})`}
        onChangeSetup={onChangeSetup}
        tiles={tiles ?? [
          { label: "Accuracy", value: `${session.accuracy}%`, tone: session.accuracy >= 85 ? "good" : session.accuracy >= 70 ? "neutral" : "bad" },
          { label: "Avg. answer time", value: `${(session.averageResponseTime / 1000).toFixed(1)} s` },
          { label: "Best streak", value: session.bestStreak, sub: "right in a row" },
        ]}
        breakdown={rows.length ? { title: breakdownTitle, rows } : undefined}
        mistakesTitle="Hands to review"
        mistakeHref={(mistake) => mistakeHref(mistake)}
        detail={session.mistakes.length ? undefined : <Callout tone="good" title="No mistakes this round." />}
      />
      {slow.length > 0 && (
        <Panel>
          <PanelHeader
            title={`Right but slow (${slow.length})`}
            description="Answered correctly, but in more than 3 seconds. Speed comes from seeing these often."
            actions={onRetrySlow && <GhostButton size="compact" onClick={onRetrySlow}>Retry slow hands</GhostButton>}
          />
          <ul className="flex flex-wrap gap-2">
            {slow.map((hand) => (
              <li key={hand.id} className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1 font-data text-xs text-[var(--ink)]">
                {hand.text} <span className="text-[var(--ink-muted)]">{(hand.ms / 1000).toFixed(1)} s</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--ink-muted)]">
        <div>{footer}</div>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
          <i className="fa-solid fa-house text-xs" aria-hidden="true" />Dashboard
        </Link>
      </div>
    </div>
  );
}
