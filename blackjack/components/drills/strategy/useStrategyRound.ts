"use client";
import { useEffect, useRef, useState } from "react";
import { announce } from "@/components/ui";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { applyAnswer, EMPTY_TALLY, pausesOn, type ExplainMode, type RoundTally } from "@/lib/statistics/drillRound";
import { makeSession, storage, type Mistake, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";

export type RoundPhase = "setup" | "play" | "summary";

/** What a round deals: its length, when it pauses, and a queue for retry rounds or a focused start. */
export interface RoundPlan<Q> {
  /** 10, 20 or 50; a retry round is as long as its queue. */
  length: number;
  explain: ExplainMode;
  retry: boolean;
  queue?: Q[];
  /**
   * The drill's practice mode for this round, fixed when it starts or
   * resumes, so dealing and analytics never read a Setup choice made later
   * (or not yet committed, as when Continue round restores a saved mode).
   */
  mode?: string;
}

export interface RoundAnswer<H> {
  hand: H;
  chosen: string;
  ok: boolean;
  ms: number;
  /** 1-based hand number within the round. */
  number: number;
}

/** The drill-specific half of a round: dealing, grading, analytics and words. */
export interface RoundAdapter<H, Q> {
  drill: "Basic Strategy" | "Deviations";
  /** Deal hand `index` (0-based) of the round. */
  deal(index: number, plan: RoundPlan<Q>): H;
  grade(hand: H, chosen: string): { ok: boolean; category: string; mistake: Mistake };
  /** question_presented */
  presented(hand: H, attempt: number): void;
  /** The drill's answered event, Leitner scheduling and sound. */
  answered(answer: RoundAnswer<H>, streak: number, plan: RoundPlan<Q>): void;
  /** answer_skipped, for a hand left unanswered by End round. */
  skipped(hand: H, attempt: number, elapsedMs: number): void;
  /** The drill_started payload. */
  started(plan: RoundPlan<Q>): Record<string, string | number | boolean>;
  /** "Ace and 7 against a 9." */
  spoken(hand: H): string;
  /** "Correct. Stand." or "Not quite. You chose Hit; the play is Stand.", with the reason when `full`. */
  verdict(answer: RoundAnswer<H>, full: boolean): string;
  /** The saved progress state (`hilo:progress:<drill>`). */
  progress(plan: RoundPlan<Q>, tally: RoundTally): object;
}

export interface RoundStart<Q> {
  phase: RoundPhase;
  plan: RoundPlan<Q>;
  tally: RoundTally;
  /** When the round was resumed from saved progress, that progress's time. */
  resumedAt?: string;
}

const PAUSE_GUARD_MS = 400;

/**
 * The Setup -> Play -> Summary machine shared by the basic-strategy and
 * index-play drills.
 *
 * - The answer is counted when given; the next hand is dealt at once, or
 *   after Next when the answer pauses on its explanation. Time spent paused
 *   is never counted as answer time.
 * - The session is recorded the moment the last hand is answered, so leaving
 *   on its explanation loses nothing, and progress is cleared with it.
 * - Progress is saved only once a hand has been answered (or a retry queue
 *   exists), so viewing Setup or a fresh round never writes anything.
 */
export function useStrategyRound<H, Q>(adapter: RoundAdapter<H, Q>, initial: RoundStart<Q>) {
  const [phase, setPhase] = useState<RoundPhase>(initial.phase);
  const [plan, setPlan] = useState<RoundPlan<Q>>(initial.plan);
  const [tally, setTally] = useState<RoundTally>(initial.tally);
  const [hand, setHand] = useState<{ value: H; serial: number } | undefined>(() =>
    initial.phase === "play" && initial.tally.answered < initial.plan.length ? { value: adapter.deal(initial.tally.answered, initial.plan), serial: 1 } : undefined);
  const [paused, setPaused] = useState<RoundAnswer<H>>();
  const [last, setLast] = useState<RoundAnswer<H>>();
  const [log, setLog] = useState<RoundAnswer<H>[]>([]);
  const [session, setSession] = useState<Session>();
  const [resumedAt, setResumedAt] = useState(initial.resumedAt);
  const [notice, setNotice] = useState<"nothing-saved">();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const shownAt = useRef(Date.now());
  const pausedAt = useRef(0);
  const serial = useRef(1);

  useWakeLock(phase === "play");
  const resumable = tally.answered > 0 || Boolean(plan.queue?.length);
  useDrillProgress(adapter.drill, phase === "play" && !session && resumable, adapter.progress(plan, tally));

  const record = (final: RoundTally, current: RoundPlan<Q>) => {
    const made = makeSession(adapter.drill, final.answered, final.correct, final.totalMs, final.best, final.mistakes, final.categories, undefined, current.retry ? ["retry"] : undefined);
    storage.addSession(made);
    storage.clearProgress(adapter.drill);
    setSession(made);
    return made;
  };

  const show = (value: H, current: RoundPlan<Q>, number: number, prefix = "") => {
    serial.current += 1;
    setHand({ value, serial: serial.current });
    shownAt.current = Date.now();
    adapter.presented(value, number);
    announce(`${prefix}${current.retry ? "Retry" : "Hand"} ${number} of ${current.length}: ${adapter.spoken(value)}`);
  };

  // Mount: a resumed round is a new practice attempt in this browser session,
  // and progress saved at the old last-hand screen is recorded exactly once.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (initial.phase !== "play") return;
    if (initial.tally.answered >= initial.plan.length) {
      record(initial.tally, initial.plan);
      setPhase("summary");
      return;
    }
    track("drill_started", adapter.started(initial.plan));
    if (hand) {
      shownAt.current = Date.now();
      adapter.presented(hand.value, initial.tally.answered + 1);
      announce(`${initial.plan.retry ? "Retry" : "Hand"} ${initial.tally.answered + 1} of ${initial.plan.length}: ${adapter.spoken(hand.value)}`);
    }
    // Runs once on mount by design; later changes go through the handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setTally(EMPTY_TALLY);
    setPaused(undefined);
    setLast(undefined);
    setLog([]);
    setSession(undefined);
    setResumedAt(undefined);
    setConfirmingEnd(false);
  };

  /** Start (or restart) a round with this plan. */
  const start = (next: RoundPlan<Q>) => {
    if (storage.progress(adapter.drill)) storage.clearProgress(adapter.drill);
    reset();
    setNotice(undefined);
    setPlan(next);
    setPhase("play");
    track("drill_started", adapter.started(next));
    show(adapter.deal(0, next), next, 1);
  };

  /** Continue saved progress (e.g. synced from another device while Setup was open). */
  const resume = (next: RoundPlan<Q>, saved: RoundTally, updatedAt?: string) => {
    reset();
    setNotice(undefined);
    setPlan(next);
    setTally(saved);
    setResumedAt(updatedAt);
    if (saved.answered >= next.length) {
      record(saved, next);
      setPhase("summary");
      return;
    }
    setPhase("play");
    track("drill_started", adapter.started(next));
    show(adapter.deal(saved.answered, next), next, saved.answered + 1);
  };

  const answer = (chosen: string) => {
    if (phase !== "play" || !hand || paused || session) return;
    const ms = Date.now() - shownAt.current;
    const { ok, category, mistake } = adapter.grade(hand.value, chosen);
    const next = applyAnswer(tally, { ok, ms, category, mistake });
    const entry: RoundAnswer<H> = { hand: hand.value, chosen, ok, ms, number: next.answered };
    setTally(next);
    setLog((current) => [...current, entry]);
    setResumedAt(undefined);
    adapter.answered(entry, next.streak, plan);
    const done = next.answered >= plan.length;
    if (done) record(next, plan);
    if (pausesOn(plan.explain, ok)) {
      pausedAt.current = Date.now();
      setPaused(entry);
      setLast(undefined);
      announce(adapter.verdict(entry, true));
      return;
    }
    if (done) {
      setPhase("summary");
      return;
    }
    setLast(entry);
    show(adapter.deal(next.answered, plan), plan, next.answered + 1, `${adapter.verdict(entry, false)} `);
  };

  /** Next hand after a paused explanation. Ignored for a moment after the pause, so a double tap cannot skip it. */
  const next = () => {
    if (!paused || Date.now() - pausedAt.current < PAUSE_GUARD_MS) return;
    setPaused(undefined);
    if (tally.answered >= plan.length) {
      setPhase("summary");
      return;
    }
    show(adapter.deal(tally.answered, plan), plan, tally.answered + 1);
  };

  const skipIfShowing = () => {
    if (hand && !paused && !session) adapter.skipped(hand.value, tally.answered + 1, Date.now() - shownAt.current);
  };

  /** Discard the round without recording anything, back to Setup. */
  const discard = (reason?: "nothing-saved") => {
    if (storage.progress(adapter.drill)) storage.clearProgress(adapter.drill);
    abandonActivePractice();
    reset();
    setHand(undefined);
    setPhase("setup");
    setNotice(reason);
  };

  /** End round: with nothing answered, nothing is saved; otherwise confirm, then record what was answered. */
  const requestEnd = () => {
    if (session) {
      setPaused(undefined);
      setPhase("summary");
      return;
    }
    if (tally.answered === 0) {
      skipIfShowing();
      discard("nothing-saved");
      return;
    }
    setConfirmingEnd(true);
  };
  const confirmEnd = () => {
    setConfirmingEnd(false);
    skipIfShowing();
    record(tally, plan);
    setPaused(undefined);
    setLast(undefined);
    setPhase("summary");
  };

  return {
    phase,
    plan,
    tally,
    hand: hand?.value,
    handSerial: hand?.serial ?? 0,
    paused,
    last,
    log,
    session,
    resumedAt,
    notice,
    confirmingEnd,
    /** Milliseconds since the current hand was shown (for the keyboard-repeat guard). */
    shownFor: () => Date.now() - shownAt.current,
    setExplain: (explain: ExplainMode) => setPlan((current) => ({ ...current, explain })),
    setNotice,
    start,
    resume,
    answer,
    next,
    discard,
    requestEnd,
    confirmEnd,
    cancelEnd: () => setConfirmingEnd(false),
    changeSetup: () => { setPaused(undefined); setPhase("setup"); },
  };
}
