"use client";
import { useEffect } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DrillSummary, formatClock } from "@/components/drill/DrillKit";
import { announce, Button, Callout } from "@/components/ui";
import { countdownBest } from "@/lib/blackjack/countingTraining";
import { useSessions } from "@/lib/hooks/useSessions";
import type { Session } from "@/lib/statistics/storage";
import { BenchmarkNote, Breakdown, CauseCard, displayMistakes, verdict } from "../counting-shared/parts";

/** The end of a Running Count session. The session is already saved when this shows. */
export function RunningSummary({ session, totalCards, interruptionUsed, onAgain, onChangeSetup }: {
  session: Session; totalCards: number; interruptionUsed: boolean; onAgain: () => void; onChangeSetup: () => void;
}) {
  const metrics = session.metrics ?? {};
  const elapsed = Number(metrics.elapsedSeconds ?? 0);
  const latency = Number(metrics.averageAnswerLatency ?? 0) / 1000;
  useEffect(() => { announce(`Session complete. ${session.correct} of ${session.questions} checks right.`); }, [session]);
  const history = useSessions("Running Count");
  const countdown = metrics.countdown === true;
  const decks = Number(metrics.decks);
  const best = countdown ? countdownBest(history, decks, session.id) : undefined;
  const perfect = session.questions > 0 && session.correct === session.questions;
  const stats = [
    { label: "Answer time", value: `${latency.toFixed(1)} s` },
    { label: "Best streak", value: String(session.bestStreak) },
    { label: "Time", value: formatClock(elapsed * 1000) },
    { label: "Cards", value: `${metrics.cardsSeen ?? 0} of ${totalCards}` },
    ...(interruptionUsed ? [{ label: "After the interruption", value: metrics.interruptionAccuracy === 100 ? "Held it" : "Lost it" }] : []),
  ];
  return (
    <DrillSummary
      title="Running Count"
      score={session.accuracy}
      scoreLabel="Checks right"
      scoreSub={<><span className="tnum font-semibold text-ink">{session.correct} of {session.questions}.</span> {verdict(session.accuracy)}</>}
      stats={stats}
      mistakes={displayMistakes(session.mistakes)}
      onAgain={onAgain}
      next={session.accuracy >= 85 ? { href: "/train/deck-estimation", label: "Next: Deck Estimation" } : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={onChangeSetup}>Change setup</Button>
      </div>
      {metrics.perfectDeck ? <Callout tone="pos" title={`Perfect deck in ${elapsed.toFixed(1)} s`}>Every check right across a whole deck.</Callout> : null}
      {countdown && (perfect
        ? <Callout tone="pos" title={best === undefined || elapsed < best ? `New best: ${decks} decks in ${elapsed.toFixed(1)} s` : `${decks} decks in ${elapsed.toFixed(1)} s`}>
            {best === undefined ? "Your first perfect count-down at this size. Beat it next time." : elapsed < best ? `${(best - elapsed).toFixed(1)} s faster than your last best.` : `Your best is ${best.toFixed(1)} s.`}
          </Callout>
        : <Callout tone="info" title="No time this run: the count was off at the end">Only a right count sets a time. {best === undefined ? `No perfect ${decks}-deck run yet.` : `Your best for ${decks} decks is ${best.toFixed(1)} s.`}</Callout>)}
      <CauseCard mistakes={session.mistakes} />
      <Breakdown categories={session.categories} />
      <BenchmarkNote drill="Running Count" />
      {!session.mistakes.length && session.questions > 0 && <Callout tone="pos" title="No misses. Clean session." />}
    </DrillSummary>
  );
}
