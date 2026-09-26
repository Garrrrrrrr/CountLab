import { explainModeOf, roundLengthOf, tallyFromProgress, type CategoryTotals, type ExplainMode, type RoundTally } from "@/lib/statistics/drillRound";
import type { Mistake } from "@/lib/statistics/storage";
import type { RoundPlan } from "./useStrategyRound";

/**
 * The saved-progress fields both strategy drills share. `q` and the counters
 * keep their original names; `length`, `explain`, `queue` and `retry` are
 * optional additions that older app versions ignore (a missing length is 10
 * hands, a missing explain mode pauses on mistakes).
 */
export interface SavedRound<Q> {
  q: number;
  correctCount: number;
  streak: number;
  best: number;
  totalMs: number;
  mistakes: Mistake[];
  categories: CategoryTotals;
  length?: number;
  explain?: ExplainMode;
  queue?: Q[];
  retry?: boolean;
}

export function saveRound<Q>(plan: RoundPlan<Q>, tally: RoundTally): SavedRound<Q> {
  return {
    q: tally.answered,
    correctCount: tally.correct,
    streak: tally.streak,
    best: tally.best,
    totalMs: tally.totalMs,
    mistakes: tally.mistakes,
    categories: tally.categories,
    length: plan.length,
    explain: plan.explain,
    ...(plan.queue?.length ? { queue: plan.queue } : {}),
    ...(plan.retry ? { retry: true } : {}),
  };
}

/**
 * A saved round, checked against the current rules: queued hands the table
 * no longer deals (surrender switched off elsewhere) are dropped, and a retry
 * round shortens to what is left. Undefined when nothing is left to resume.
 */
export function restoreRound<Q>(state: Partial<SavedRound<Q>> | undefined, keep: (item: Q) => boolean): { plan: RoundPlan<Q>; tally: RoundTally } | undefined {
  if (!state) return undefined;
  const tally = tallyFromProgress(state);
  const raw = Array.isArray(state.queue) ? state.queue : [];
  const explain = explainModeOf(state.explain);
  if (state.retry === true && raw.length > 0) {
    const upcoming = raw.slice(tally.answered).filter(keep);
    const plan = { length: tally.answered + upcoming.length, explain, retry: true, queue: [...raw.slice(0, tally.answered), ...upcoming] };
    return plan.length > 0 && (tally.answered > 0 || upcoming.length > 0) ? { plan, tally } : undefined;
  }
  const queue = raw.filter(keep);
  if (tally.answered === 0 && queue.length === 0) return undefined;
  return { plan: { length: roundLengthOf(state.length), explain, retry: false, queue: queue.length ? queue : undefined }, tally };
}

/** "Hand 4 of 10" for a saved round. */
export const savedRoundDetail = <Q,>(restored: { plan: RoundPlan<Q>; tally: RoundTally }) =>
  `${restored.plan.retry ? "Retry" : "Hand"} ${Math.min(restored.tally.answered + 1, restored.plan.length)} of ${restored.plan.length}, ${restored.tally.answered} answered.`;
