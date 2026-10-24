"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { announce } from "@/components/ui";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { applyAnswer, EMPTY_TALLY, explainModeOf, pausesOn, roundLengthOf, tallyFromProgress, type CategoryTotals, type ExplainMode, type RoundTally } from "@/lib/statistics/drillRound";
import { makeSession, storage, type DrillType, type Mistake, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { DEFAULT_TABLE_RULES, type TableRules } from "@/lib/strategy";

export type RoundPhase = "setup" | "play" | "summary";

export interface RoundPlan<Q, O> {
  /** 10, 20 or 50; a retry round is as long as its queue. */
  length: number;
  explain: ExplainMode;
  retry: boolean;
  /** Dealt first, in order: a retry round's misses, or a focused start. */
  queue?: Q[];
  /** Fixed when the round starts, so a rules change elsewhere never re-grades a hand on screen. */
  rules: TableRules;
  options: O;
}

export interface Answered<H> {
  hand: H;
  chosen: string;
  ok: boolean;
  ms: number;
  /** 1-based. */
  number: number;
}

/** The drill-specific half of a round. */
export interface RoundAdapter<Q, H, O> {
  drill: Extract<DrillType, "Basic Strategy" | "Deviations">;
  /** A fresh question for hand `index`; `dealt` is every question shown this round, oldest first. */
  deal(index: number, plan: RoundPlan<Q, O>, dealt: readonly Q[]): Q | null;
  resolve(question: Q, rules: TableRules): H | null;
  /** The serializable question behind a hand. */
  question(hand: H): Q;
  grade(hand: H, chosen: string, rules: TableRules): { ok: boolean; category: string; mistake: Mistake };
  /** Analytics, spaced repetition, sound. */
  answered?(entry: Answered<H>, plan: RoundPlan<Q, O>, tally: RoundTally): void;
  presented?(hand: H, number: number): void;
  started(plan: RoundPlan<Q, O>): Record<string, string | number | boolean | undefined>;
  /** "Ace and 7 against a 9." */
  spoken(hand: H): string;
  /** "Right: stand." / "The play was stand." */
  verdict(entry: Answered<H>): string;
  isQuestion(value: unknown): value is Q;
  cleanOptions(value: unknown): O;
}

/**
 * Saved progress. The counters keep the names the earlier drills used, so a
 * round saved by the previous version still resumes with its score.
 */
export interface SavedRound<Q, O> {
  q: number;
  correctCount: number;
  streak: number;
  best: number;
  totalMs: number;
  mistakes: Mistake[];
  categories: CategoryTotals;
  length: number;
  explain: ExplainMode;
  retry?: boolean;
  queue?: Q[];
  rules?: TableRules;
  options?: O;
  /** The hand on screen, so a reload shows the same cards. */
  current?: Q;
}

const PAUSE_GUARD_MS = 350;

const validRules = (value: unknown): TableRules | undefined => {
  const rules = value as TableRules | null;
  if (!rules || typeof rules !== "object" || typeof rules.decks !== "number" || typeof rules.hitSoft17 !== "boolean" || typeof rules.das !== "boolean" || !["none", "late", "early"].includes(rules.surrender)) return undefined;
  return { ...DEFAULT_TABLE_RULES, ...rules };
};

/** A saved round, checked against this version's shapes; undefined when there is nothing to resume. */
export function restoreRound<Q, O>(adapter: Pick<RoundAdapter<Q, unknown, O>, "isQuestion" | "cleanOptions">, state: Partial<SavedRound<Q, O>> | undefined, fallbackRules: TableRules): { plan: RoundPlan<Q, O>; tally: RoundTally; current?: Q } | undefined {
  if (!state || typeof state !== "object") return undefined;
  const tally = tallyFromProgress(state);
  const queue = Array.isArray(state.queue) ? state.queue.filter((item) => adapter.isQuestion(item)) : [];
  const retry = state.retry === true && queue.length > 0;
  const length = retry ? queue.length : roundLengthOf(state.length);
  if (tally.answered === 0 && !retry) return undefined;
  if (tally.answered >= length) return undefined;
  const plan: RoundPlan<Q, O> = { length, explain: explainModeOf(state.explain), retry, queue: queue.length ? queue : undefined, rules: validRules(state.rules) ?? fallbackRules, options: adapter.cleanOptions(state.options) };
  return { plan, tally, current: adapter.isQuestion(state.current) ? state.current : undefined };
}

/**
 * Setup → play → summary for the basic-strategy and index-play drills.
 *
 * - An answer counts the moment it is given. The next hand follows at once,
 *   or after Next when the answer stops on its explanation; time spent reading
 *   an explanation is not answer time.
 * - The session is saved the moment the last hand is answered, so leaving on
 *   the final explanation loses nothing, and progress is cleared with it.
 * - Progress is saved only once a hand has been answered (or a retry queue
 *   exists), so opening setup or a fresh round never writes anything.
 */
export function useStrategyRound<Q, H, O>(adapter: RoundAdapter<Q, H, O>) {
  const live = useRef(adapter);
  useEffect(() => { live.current = adapter; });
  const [phase, setPhase] = useState<RoundPhase>("setup");
  const [plan, setPlan] = useState<RoundPlan<Q, O>>();
  const [tally, setTally] = useState<RoundTally>(EMPTY_TALLY);
  const [hand, setHand] = useState<{ value: H; serial: number }>();
  const [paused, setPaused] = useState<Answered<H>>();
  const [last, setLast] = useState<Answered<H>>();
  const [log, setLog] = useState<Answered<H>[]>([]);
  const [session, setSession] = useState<Session>();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const shownAt = useRef(0);
  const pausedAt = useRef(0);
  const serial = useRef(0);
  const dealt = useRef<Q[]>([]);

  useWakeLock(phase === "play");
  const saved = useMemo(() => plan && ({
    q: tally.answered, correctCount: tally.correct, streak: tally.streak, best: tally.best, totalMs: tally.totalMs,
    mistakes: tally.mistakes, categories: tally.categories, length: plan.length, explain: plan.explain,
    ...(plan.retry ? { retry: true } : {}), ...(plan.queue?.length ? { queue: plan.queue } : {}),
    rules: plan.rules, options: plan.options, ...(hand ? { current: live.current.question(hand.value) } : {}),
  } satisfies SavedRound<Q, O>), [plan, tally, hand]);
  const resumable = Boolean(plan && (tally.answered > 0 || plan.retry));
  const progress = useDrillProgress(adapter.drill, phase === "play" && !session && resumable, saved ?? {});

  const dealAt = (index: number, current: RoundPlan<Q, O>): H | null => {
    const queued = current.queue?.[index];
    if (queued) {
      const resolved = live.current.resolve(queued, current.rules);
      if (resolved) return resolved;
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const question = live.current.deal(index, current, dealt.current);
      const resolved = question && live.current.resolve(question, current.rules);
      if (resolved) return resolved;
    }
    return null;
  };

  const show = (value: H | null, current: RoundPlan<Q, O>, number: number, prefix = "") => {
    if (!value) { setPhase("summary"); return; }
    serial.current += 1;
    dealt.current = [...dealt.current, live.current.question(value)];
    setHand({ value, serial: serial.current });
    shownAt.current = Date.now();
    live.current.presented?.(value, number);
    announce(`${prefix}${current.retry ? "Retry" : "Hand"} ${number} of ${current.length}. ${live.current.spoken(value)}`);
  };

  const reset = () => {
    setPaused(undefined);
    setLast(undefined);
    setLog([]);
    setSession(undefined);
    setConfirmingEnd(false);
    dealt.current = [];
  };

  const record = (final: RoundTally, current: RoundPlan<Q, O>) => {
    const made = makeSession(live.current.drill, final.answered, final.correct, final.totalMs, final.best, final.mistakes, final.categories, undefined, current.retry ? ["retry"] : undefined);
    storage.addSession(made);
    progress.cancel();
    storage.clearProgress(live.current.drill);
    setSession(made);
    return made;
  };

  /** Start a fresh round. */
  const start = (next: RoundPlan<Q, O>) => {
    if (storage.progress(live.current.drill)) storage.clearProgress(live.current.drill);
    reset();
    setTally(EMPTY_TALLY);
    setPlan(next);
    setPhase("play");
    track("drill_started", live.current.started(next));
    show(dealAt(0, next), next, 1);
  };

  /** Continue a saved round. */
  const resume = (restored: { plan: RoundPlan<Q, O>; tally: RoundTally; current?: Q }) => {
    reset();
    setPlan(restored.plan);
    setTally(restored.tally);
    setPhase("play");
    track("drill_started", live.current.started(restored.plan));
    const current = restored.current && live.current.resolve(restored.current, restored.plan.rules);
    show(current || dealAt(restored.tally.answered, restored.plan), restored.plan, restored.tally.answered + 1, "Picked up where you left off. ");
  };

  const answer = (chosen: string) => {
    if (phase !== "play" || !plan || !hand || paused || session) return;
    const ms = Date.now() - shownAt.current;
    const { ok, category, mistake } = live.current.grade(hand.value, chosen, plan.rules);
    const next = applyAnswer(tally, { ok, ms, category, mistake });
    const entry: Answered<H> = { hand: hand.value, chosen, ok, ms, number: next.answered };
    setTally(next);
    setLog((current) => [...current, entry]);
    live.current.answered?.(entry, plan, next);
    const done = next.answered >= plan.length;
    if (done) record(next, plan);
    if (pausesOn(plan.explain, ok)) {
      pausedAt.current = Date.now();
      setPaused(entry);
      setLast(undefined);
      return;
    }
    if (done) {
      announce(live.current.verdict(entry));
      setPhase("summary");
      return;
    }
    setLast(entry);
    show(dealAt(next.answered, plan), plan, next.answered + 1, `${live.current.verdict(entry)} `);
  };

  /** Next hand after an explanation. Ignored for a moment, so a double tap cannot skip one unread. */
  const next = () => {
    if (!paused || !plan || Date.now() - pausedAt.current < PAUSE_GUARD_MS) return;
    setPaused(undefined);
    if (tally.answered >= plan.length) { setPhase("summary"); return; }
    show(dealAt(tally.answered, plan), plan, tally.answered + 1);
  };

  /** Back to setup without saving anything. */
  const discard = () => {
    progress.cancel();
    if (storage.progress(live.current.drill)) storage.clearProgress(live.current.drill);
    abandonActivePractice();
    reset();
    setHand(undefined);
    setTally(EMPTY_TALLY);
    setPhase("setup");
  };

  /** The X: nothing answered leaves quietly; otherwise confirm, then save what was answered. */
  const requestEnd = () => {
    if (session) { setPaused(undefined); setPhase("summary"); return; }
    if (tally.answered === 0) { discard(); return; }
    setConfirmingEnd(true);
  };
  const confirmEnd = () => {
    if (!plan) return;
    setConfirmingEnd(false);
    record(tally, plan);
    setPaused(undefined);
    setPhase("summary");
  };

  return {
    phase, plan, tally, hand: hand?.value, handSerial: hand?.serial ?? 0, paused, last, log, session, confirmingEnd,
    start, resume, answer, next, discard, requestEnd, confirmEnd,
    cancelEnd: () => setConfirmingEnd(false),
    toSetup: () => { setPaused(undefined); setHand(undefined); setPhase("setup"); },
  };
}

export type StrategyRound<Q, H, O> = ReturnType<typeof useStrategyRound<Q, H, O>>;
