"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrillFrame, DrillHud, DrillStage, FeedbackPanel, formatClock, ResumeBanner, useDrillKeys, useDrillSetupPref } from "@/components/drill";
import { announce, Button, GhostButton, KeyHint } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { classifyCountError, type CountBias, type CountingPreset, isPerfectDeck, makeCountSequence, runningCountCause } from "@/lib/blackjack/countingTraining";
import {
  matchRunningPreset,
  normalizeRunningFocus,
  RUNNING_SESSION_CARDS,
  SELF_PACED,
  type FeedbackMode,
  type RunningCardId,
  type RunningCheckpoint,
  type RunningGroup,
  type RunningValues,
} from "@/lib/blackjack/countingSetup";
import { runningCount, signed } from "@/lib/blackjack/hiLo";
import type { Card } from "@/lib/blackjack/types";
import { makeSession, storage, type CountingErrorCategory, type Mistake, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { displaySigned } from "@/lib/blackjack/numericAnswer";
import { addCategory } from "@/components/DrillKit";
import { AnswerPad } from "./AnswerPad";
import { CountingSummary } from "./CountingSummary";
import { isRecent, readArrival, useEntryFocus, useReducedMotion, useStoredSessions, useUnfinishedProgress } from "./hooks";
import { AsideCard, FocusCallout, HiLoValues, UnfinishedCallout, YourProgress } from "./SetupParts";
import { CardGroup, CardRecap, cardName, InterruptionView, nextCheckText, PausedView, ReadyCountdown } from "./running/RunningStage";
import { RunningSetup, type RunningSetupState } from "./running/RunningSetup";

const DRILL = "Running Count" as const;

/**
 * Saved progress ("hilo:progress:Running Count"). The phase stays
 * "answer" | "paused" so older app versions can still resume it; every other
 * play phase is saved as "paused". The last three fields are optional
 * additions read with fallbacks.
 */
type RunningSaved = {
  preset: CountingPreset; decks: number; amount: number; speed: number;
  group: RunningGroup; checkpoint: RunningCheckpoint;
  bias: CountBias; feedbackMode: FeedbackMode;
  phase: "answer" | "paused"; cards: Card[]; cursor: number; size: number; answer: string;
  checks: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  elapsed: number; interruptionUsed: boolean;
  interruption?: boolean; hints?: boolean; lastCheckCursor?: number;
};

/** The last setup started on this device, so an experienced counter's custom session comes back. */
type RunningPref = {
  last?: RunningCardId | "custom";
  values?: Pick<RunningSetupState, "decks" | "amount" | "speed" | "group" | "checkpoint" | "interruption" | "bias" | "hints">;
  /** settings.countingPreset when this was saved; a change in Settings wins over it. */
  basis?: CountingPreset;
};
const PREF_KEY = "countlab:drill-setup:running-count";

type Phase = "setup" | "ready" | "show" | "interruption" | "paused" | "answer" | "feedback" | "done";
type Feedback = { ok: boolean; expected: number; answer: string | null; category?: CountingErrorCategory; explanation?: string; recapFrom?: number; to: number; last: boolean };
type Arrival = ReturnType<typeof readArrival>;

const cardSetup = (id: RunningCardId, current: Pick<RunningSetupState, "bias" | "feedbackMode">): RunningSetupState & { preset: CountingPreset } => {
  const card = RUNNING_SESSION_CARDS.find((option) => option.id === id)!;
  return id === "starter"
    ? { ...card.values, bias: "none", feedbackMode: "immediate", hints: true, preset: "one-deck-speed" }
    : { ...card.values, bias: current.bias, feedbackMode: current.feedbackMode, hints: false, preset: id };
};
const valuesOf = (setup: RunningSetupState): RunningValues => ({ decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, interruption: setup.interruption });
const isUsable = (saved: RunningSaved | undefined): saved is RunningSaved => Boolean(saved && Array.isArray(saved.cards) && saved.cards.length > 0 && Number.isFinite(saved.cursor));

export function RunningCountDrill() {
  const [pref, remember, restored] = useDrillSetupPref<RunningPref>(PREF_KEY, {});
  const [boot, setBoot] = useState(() => ({ key: 0, arrival: readArrival(DRILL), resume: false }));
  const restart = useCallback((options: { resume?: boolean; keepArrival?: boolean }) => setBoot((current) => ({ key: current.key + 1, arrival: options.keepArrival ? current.arrival : { starter: false }, resume: Boolean(options.resume) })), []);
  // The remembered setup is read after mount; render nothing for that one frame.
  if (!restored) return null;
  return <RunningCountSession key={boot.key} arrival={boot.arrival} forceResume={boot.resume} remounted={boot.key > 0} pref={pref} remember={remember} restart={restart} />;
}

function RunningCountSession({ arrival, forceResume, remounted, pref, remember, restart }: { arrival: Arrival; forceResume: boolean; remounted: boolean; pref: RunningPref; remember: (next: RunningPref) => void; restart: (options: { resume?: boolean; keepArrival?: boolean }) => void }) {
  const settings = storage.settings();
  const history = useStoredSessions(DRILL);
  const allSessions = useStoredSessions();
  const reducedMotion = useReducedMotion();

  const [initial] = useState(() => {
    const progress = storage.progress<RunningSaved>(DRILL);
    const saved = progress && (forceResume || isRecent(progress)) && isUsable(progress.state) ? progress.state : undefined;
    const focusCard = normalizeRunningFocus(arrival.focus);
    const arrivalCard: RunningCardId | undefined = focusCard ?? (arrival.starter ? "starter" : undefined);
    const base = { bias: "none" as CountBias, feedbackMode: settings.countingFeedback };
    let setup: RunningSetupState & { preset: CountingPreset };
    if (saved) {
      setup = { decks: saved.decks, amount: saved.amount, speed: saved.speed, group: saved.group, checkpoint: saved.checkpoint, interruption: saved.interruption ?? runningPresetInterruption(saved.preset), bias: saved.bias, feedbackMode: saved.feedbackMode, hints: saved.hints ?? false, preset: saved.preset };
    } else if (arrivalCard) {
      setup = cardSetup(arrivalCard, base);
    } else if (pref.last && pref.basis === settings.countingPreset) {
      setup = pref.last === "custom" && pref.values
        ? { ...pref.values, feedbackMode: settings.countingFeedback, preset: settings.countingPreset }
        : cardSetup(pref.last === "custom" ? settings.countingPreset : pref.last, base);
    } else if (!storage.sessions().some((session) => session.drill === DRILL)) {
      setup = cardSetup("starter", base);
    } else {
      setup = cardSetup(settings.countingPreset, base);
    }
    return { saved, progress, setup, arrivalCard, focusCard };
  });
  const saved = initial.saved;

  const [setup, setSetup] = useState<RunningSetupState>(initial.setup);
  /** The preset last picked, for the session tag when the values are custom. */
  const [preset, setPreset] = useState<CountingPreset>(initial.setup.preset);
  const matched = matchRunningPreset(valuesOf(setup));
  const lastCard = useRef<RunningCardId | null>(matchRunningPreset(valuesOf(initial.setup)));
  /** The session card last chosen, which "Reset to …" returns to from custom values. */
  const [lastPicked, setLastPicked] = useState<RunningCardId>(() => lastCard.current ?? initial.setup.preset);
  const [customizeOpen, setCustomizeOpen] = useState(() => !saved && !initial.focusCard && lastCard.current === null);
  const [focusNote, setFocusNote] = useState(() => (!saved && initial.focusCard ? initial.focusCard : undefined));

  const [phase, setPhase] = useState<Phase>(saved ? saved.phase : "setup");
  const [cards, setCards] = useState<Card[]>(saved?.cards ?? []);
  const [cursor, setCursor] = useState(saved?.cursor ?? 0);
  const [size, setSize] = useState(saved?.size ?? 1);
  const [answer, setAnswer] = useState(saved?.phase === "answer" ? saved.answer : "");
  const [checks, setChecks] = useState(saved?.checks ?? 0);
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0);
  // Unknown after resuming an older save; the recap is then skipped for one check.
  const [lastCheckCursor, setLastCheckCursor] = useState<number | undefined>(saved ? saved.lastCheckCursor : 0);
  const [feedback, setFeedback] = useState<Feedback>();
  const [result, setResult] = useState<Session>();
  const [ending, setEnding] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [resumed, setResumed] = useState(() => Boolean(saved));

  const startRef = useRef(Date.now() - (saved?.elapsed ?? 0));
  const answerStart = useRef(Date.now());
  const pausedAt = useRef(saved?.phase === "paused" ? Date.now() : 0);
  const pausedTotal = useRef(0);
  const answerTotal = useRef(0);
  const interrupted = useRef(false);
  const interruptionUsed = useRef(saved?.interruptionUsed ?? false);
  const randomCheckpointGap = () => 10 + Math.floor(Math.random() * 16);
  const handsSinceCheckpoint = useRef(0);
  const nextRandomCheckpoint = useRef(randomCheckpointGap());
  const feedbackShownAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  /** Keep keyboard focus on the stage when the button that was pressed goes away. */
  const focusStage = () => root.current?.querySelector<HTMLElement>("[data-drill-focus]")?.focus({ preventScroll: true });
  useEntryFocus(root, phase === "setup" ? "setup" : phase === "done" ? "done" : "play", remounted);

  const playing = phase !== "setup" && phase !== "done";
  useWakeLock(playing && phase !== "paused");
  const progress = useDrillProgress(DRILL, playing && !result, {
    preset, decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, bias: setup.bias, feedbackMode: setup.feedbackMode,
    phase: phase === "answer" ? "answer" : "paused",
    cards, cursor, size, answer: phase === "answer" ? answer : "",
    checks, correct, streak, best, mistakes, categories, elapsed,
    interruptionUsed: interruptionUsed.current,
    interruption: setup.interruption, hints: setup.hints, lastCheckCursor,
  } satisfies RunningSaved, { throttleMs: 10_000 });
  // Save at once at the moments worth resuming from, not only on the 10 s throttle.
  useEffect(() => { if (phase === "answer" || phase === "paused" || phase === "feedback" || phase === "interruption") progress.flush(); }, [phase, progress]);

  const visible = cards.slice(cursor, Math.min(cards.length, cursor + size));
  const pickSize = () => setup.group === "random" ? 1 + Math.floor(Math.random() * 4) : Number(setup.group);
  const expected = runningCount(cards.slice(0, cursor));

  useEffect(() => {
    if (phase !== "show" && phase !== "answer" && phase !== "feedback") return;
    const id = window.setInterval(() => setElapsed(Date.now() - startRef.current - pausedTotal.current), 100);
    return () => clearInterval(id);
  }, [phase]);

  const rememberSetup = (card: RunningCardId | null) => {
    const basis = card && card !== "starter" ? card : storage.settings().countingPreset;
    remember(card ? { last: card, basis, values: undefined } : { last: "custom", basis, values: { decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, interruption: setup.interruption, bias: setup.bias, hints: setup.hints } });
  };

  const finish = (nextChecks = checks, nextCorrect = correct, nextMistakes = mistakes, nextCategories = categories, nextBest = best) => {
    const total = Date.now() - startRef.current - pausedTotal.current;
    const seen = cursor;
    const session = makeSession(DRILL, nextChecks, nextCorrect, total, nextBest, nextMistakes, nextCategories, {
      cardsPerSecond: seen / Math.max(0.001, total / 1000), elapsedSeconds: total / 1000,
      perfectDeck: isPerfectDeck({ cardsLength: cards.length, seen, correct: nextCorrect, checks: nextChecks }), cardsSeen: seen,
      averageAnswerLatency: answerTotal.current / Math.max(1, nextChecks),
      interruptionAccuracy: interruptionUsed.current ? Number(nextMistakes.every((m) => m.category !== "interruption recovery")) * 100 : 100,
    }, [preset, setup.group, setup.checkpoint, setup.bias]);
    progress.cancel();
    storage.addSession(session);
    storage.clearProgress(DRILL);
    setResult(session);
    return session;
  };

  /** Leave without saving a session (nothing was graded, or the reader chose to). */
  const discard = () => {
    progress.cancel();
    storage.clearProgress(DRILL);
    abandonActivePractice();
    setCards([]); setCursor(0); setChecks(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setElapsed(0);
    setFeedback(undefined); setEnding(false); setResumed(false); setAnswer("");
    setPhase("setup");
  };

  const advance = () => {
    const next = Math.min(cards.length, cursor + size);
    const before = runningCount(cards.slice(0, cursor)), after = runningCount(cards.slice(0, next));
    handsSinceCheckpoint.current += 1;
    const { checkpoint } = setup;
    const due = next === cards.length || checkpoint === "5" && Math.floor(next / 5) > Math.floor(cursor / 5) || checkpoint === "10" && Math.floor(next / 10) > Math.floor(cursor / 10) || checkpoint === "random" && handsSinceCheckpoint.current >= nextRandomCheckpoint.current || checkpoint === "sign" && before !== 0 && Math.sign(before) !== Math.sign(after);
    setCursor(next);
    setResumed(false);
    if (setup.interruption && !interruptionUsed.current && next >= cards.length / 2) {
      interruptionUsed.current = true; interrupted.current = true; setPhase("interruption");
      announce("Interruption. Hold your count, then return to the table.");
      return;
    }
    if (due) {
      if (checkpoint === "random") { handsSinceCheckpoint.current = 0; nextRandomCheckpoint.current = randomCheckpointGap(); }
      answerStart.current = Date.now(); setAnswer(""); setPhase("answer");
      announce(`What's the running count after card ${next} of ${cards.length}?`);
      track("question_presented", { drill: DRILL, category: "running_count", scenario: `checkpoint_${checkpoint}`, attempt: checks + 1 });
    } else setSize(pickSize());
  };
  // The timer is intentionally recreated only when the displayed group changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase !== "show" || setup.speed === SELF_PACED) return; const id = window.setTimeout(advance, setup.speed); return () => clearTimeout(id); }, [phase, cursor, size, setup.speed]);
  // Screen readers hear each group as it appears.
  useEffect(() => { if (phase === "show" && visible.length) announce(visible.map(cardName).join(", ")); }, [phase, cursor, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const card = matchRunningPreset(valuesOf(setup));
    const tag: CountingPreset = card === "starter" ? "one-deck-speed" : card ?? preset;
    // One preset change per session started (not per card browsed), saved as the Settings default.
    if (card !== lastCard.current) track("difficulty_changed", { drill: DRILL, from: lastCard.current ?? "custom", to: card ?? "custom" });
    lastCard.current = card;
    if (card && card !== "starter" && card !== storage.settings().countingPreset) storage.saveSettings({ ...storage.settings(), countingPreset: card });
    rememberSetup(card);
    setPreset(tag);
    setCards(makeCountSequence(setup.decks, setup.amount, setup.bias));
    setCursor(0); setSize(pickSize()); setChecks(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setElapsed(0);
    setLastCheckCursor(0); setFeedback(undefined); setResult(undefined); setEnding(false); setResumed(false); setAnswer("");
    pausedTotal.current = 0; answerTotal.current = 0; interruptionUsed.current = false; interrupted.current = false;
    handsSinceCheckpoint.current = 0; nextRandomCheckpoint.current = randomCheckpointGap();
    setPhase("ready");
    track("drill_started", { drill: DRILL, preset: tag, decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, bias: setup.bias });
  };
  const beginDealing = useCallback(() => { startRef.current = Date.now(); pausedTotal.current = 0; setPhase("show"); }, []);

  const pause = () => {
    if (phase === "ready") { startRef.current = Date.now(); pausedTotal.current = 0; }
    pausedAt.current = Date.now();
    setPhase("paused");
    announce("Paused. Your place is saved.");
  };
  const resume = () => {
    pausedTotal.current += Date.now() - pausedAt.current;
    setSize((current) => current || pickSize());
    setPhase("show");
    focusStage();
    announce("Resumed.");
  };
  // Switching tabs pauses the deal, so no cards pass unseen.
  const pauseRef = useRef(pause);
  useEffect(() => { pauseRef.current = pause; });
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden" && (phaseRef.current === "show" || phaseRef.current === "ready")) pauseRef.current(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const selfPaced = setup.speed === SELF_PACED;
  const keysOn = phase === "show" || phase === "paused" || phase === "ready";
  useDrillKeys({ p: () => (phaseRef.current === "paused" ? resume() : pause()) }, keysOn);
  // Space deals the next group when self-paced, and otherwise pauses or resumes.
  // Handled here rather than as a drill key so Space on a focused button still presses it.
  const spaceRef = useRef<() => void>(() => {});
  useEffect(() => { spaceRef.current = () => (phase === "paused" ? resume() : phase === "show" && selfPaced ? advance() : pause()); });
  useEffect(() => {
    if (!keysOn) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if ((event.target as Element | null)?.closest("input, textarea, select, button, a, [role='radio'], [contenteditable='true']")) return;
      if (document.querySelector("[aria-modal='true']") || !storage.settings().shortcuts) return;
      event.preventDefault();
      spaceRef.current();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [keysOn]);

  const submit = (value: number | null, text: string | null) => {
    const responseTimeMs = Date.now() - answerStart.current;
    answerTotal.current += responseTimeMs;
    const ok = value !== null && value === expected;
    const nextChecks = checks + 1, nextCorrect = correct + Number(ok), nextStreak = ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak);
    const lastCards = cards.slice(Math.max(0, cursor - size), cursor);
    const category = ok ? undefined : classifyCountError({ expected, actual: value ?? 0, previous: runningCount(cards.slice(0, Math.max(0, cursor - size))), cards: lastCards, interrupted: interrupted.current });
    const explanation = category === "missed cancellation" ? "Cancel low and high cards before carrying the net value forward." : "Recount from the previous checkpoint and watch the sign.";
    const nextMistakes = ok ? mistakes : [...mistakes, { question: `Running count after ${cursor} cards`, userAnswer: text ?? "blank", correctAnswer: signed(expected), explanation, category }];
    const signGroup = expected < 0 ? "negative" : expected > 0 ? "positive" : "zero";
    const nextCategories = addCategory(categories, `${setup.group}-card groups, ${signGroup}`, ok);
    setChecks(nextChecks); setCorrect(nextCorrect); setStreak(nextStreak); setBest(nextBest); setMistakes(nextMistakes); setCategories(nextCategories);
    interrupted.current = false;
    const recapFrom = lastCheckCursor;
    setLastCheckCursor(cursor);
    setResumed(false);
    track("running_count_answered", { ok, expected, actual: value, group: setup.group, checkpoint: setup.checkpoint, category, responseTimeMs, attempt: nextChecks, streak: nextStreak });
    const last = cursor >= cards.length || ending;
    if (last) finish(nextChecks, nextCorrect, nextMistakes, nextCategories, nextBest);
    if (setup.feedbackMode === "immediate") {
      setFeedback({ ok, expected, answer: text, category, explanation: ok ? undefined : explanation, recapFrom, to: cursor, last });
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(ok ? `Correct. The running count is ${signed(expected)}.` : `Not quite. ${text === null ? "You skipped this check" : `You said ${text}`}; the running count is ${signed(expected)}.`);
    } else if (last) setPhase("done");
    else { setSize(pickSize()); setPhase("show"); }
  };
  const continueAfterFeedback = () => {
    // A second Enter right after the verdict appears should not skip it.
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (feedback?.last) { setPhase("done"); return; }
    setFeedback(undefined);
    setSize(pickSize());
    setPhase("show");
    focusStage();
  };

  /**
   * End drill. With checks answered, the session is saved as today. With cards
   * seen but nothing checked yet, ask for the count once so the work counts.
   * With nothing dealt, leave without saving.
   */
  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (checks > 0) { finish(); setPhase("done"); return; }
    if (cursor > 0) {
      setEnding(true);
      if (phase !== "answer") { answerStart.current = Date.now(); setAnswer(""); setPhase("answer"); }
      announce("Give your running count to save this session.");
      return;
    }
    discard();
  };

  const onPickCard = (id: RunningCardId) => {
    const next = cardSetup(id, setup);
    setSetup(next);
    setPreset(next.preset);
    setLastPicked(id);
    setFocusNote(undefined);
  };
  const resetTitle = RUNNING_SESSION_CARDS.find((card) => card.id === lastPicked)!.title;

  const unfinished = useUnfinishedProgress(DRILL, phase === "setup");
  const arrivalLabel = initial.arrivalCard ? RUNNING_SESSION_CARDS.find((card) => card.id === initial.arrivalCard)!.title : undefined;

  if (phase === "done" && result) {
    const metrics = result.metrics ?? {};
    const interruptionTile = interruptionUsed.current ? [{ label: "After the interruption", value: metrics.interruptionAccuracy === 100 ? "Held the count" : "Lost the count", tone: metrics.interruptionAccuracy === 100 ? "good" as const : "bad" as const }] : [];
    return (
      <CountingSummary
        session={result}
        title={DRILL}
        tiles={[
          { label: "Accuracy", value: `${result.accuracy}%`, tone: result.accuracy >= 85 ? "good" : result.accuracy >= 70 ? "neutral" : "bad" },
          { label: "Avg answer time", value: `${(Number(metrics.averageAnswerLatency ?? 0) / 1000).toFixed(1)} s`, help: "How long you took to give your count at each check." },
          { label: "Best streak", value: result.bestStreak, sub: "checks right in a row" },
          { label: "Time", value: formatClock(Number(metrics.elapsedSeconds ?? 0) * 1000), sub: "includes answering" },
          { label: "Cards", value: `${metrics.cardsSeen ?? cursor} of ${cards.length}` },
          ...interruptionTile,
        ]}
        highlight={metrics.perfectDeck ? `Perfect deck in ${Number(metrics.elapsedSeconds).toFixed(1)} s` : undefined}
        onNew={start}
        onChangeSetup={() => { setResult(undefined); setPhase("setup"); }}
      />
    );
  }

  const fastestPerfect = history.filter((session) => session.metrics?.perfectDeck).map((session) => Number(session.metrics?.elapsedSeconds)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const endMode = setup.feedbackMode === "end";

  if (phase === "setup") {
    return (
      <div ref={root} data-counting-drill="">
        <DrillFrame eyebrow="Counting drill" title={DRILL} description="Keep the Hi-Lo count while cards flash by, then give it when we ask." phase="setup">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <RunningSetup
              setup={setup}
              matched={matched}
              onChange={(next) => setSetup((current) => ({ ...current, ...next }))}
              onPickCard={onPickCard}
              onReset={() => onPickCard(lastPicked)}
              resetLabel={`Reset to ${resetTitle}`}
              customizeOpen={customizeOpen}
              onCustomizeOpen={setCustomizeOpen}
              firstTime={history.length === 0}
              onStart={start}
              notice={(unfinished || focusNote) && (
                <div className="grid gap-3">
                  {unfinished && <UnfinishedCallout progress={unfinished} detail={`Card ${(unfinished.state as RunningSaved).cursor ?? 0} of ${(unfinished.state as RunningSaved).cards?.length ?? 0}`} onResume={() => restart({ resume: true })} onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); restart({ keepArrival: false }); }} />}
                  {focusNote && <FocusCallout onDismiss={() => setFocusNote(undefined)}>{focusNote === "one-deck-speed" ? "Set up for the benchmark: One-deck speed. Count all 51 cards right in 30 seconds or less." : `Set up for ${arrivalLabel}, picked from your results.`}</FocusCallout>}
                </div>
              )}
            />
            <div className="grid content-start gap-4">
              <YourProgress drill={DRILL} sessions={history} allSessions={allSessions} best={{ label: "Fastest perfect deck", value: fastestPerfect ? `${fastestPerfect.toFixed(1)} s` : "—" }} />
              <AsideCard title="Hi-Lo values">
                <HiLoValues />
                <p className="mt-3">Add each card&apos;s value as it appears. The total is the running count.</p>
              </AsideCard>
            </div>
          </div>
        </DrillFrame>
      </div>
    );
  }

  const stats = [
    endMode
      ? { id: "answered", label: "Answered", value: checks, phone: true }
      : { id: "checks", label: "Checks right", value: `${correct}/${checks}`, phone: true },
    ...(endMode ? [] : [{ id: "streak", label: "Streak", value: streak }]),
    { id: "time", label: "Time", value: formatClock(elapsed), phone: true },
  ];
  const canPause = phase === "show" || phase === "ready";
  // While a group is on screen it counts as seen, so the label names the card being shown.
  const shownThrough = phase === "show" ? Math.min(cards.length, cursor + visible.length) : cursor;
  return (
    <div ref={root} data-counting-drill="" data-counting-play="">
      <DrillFrame eyebrow="Counting drill" title={DRILL} phase="play">
        <DrillHud
          progress={{ done: shownThrough, total: cards.length, label: `Card ${shownThrough} of ${cards.length}` }}
          stats={stats}
          chip={canPause && (
            <GhostButton size="compact" onClick={pause} aria-label="Pause" aria-keyshortcuts={settings.shortcuts ? "P" : undefined}>
              <i className="fa-solid fa-pause text-xs sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Pause</span>
              {settings.shortcuts && <span className="ml-2 hidden [@media(pointer:fine)]:inline-flex"><KeyHint>P</KeyHint></span>}
            </GhostButton>
          )}
          onEnd={endDrill}
          endLabel="End drill"
        />
        <DrillStage
          label="Cards"
          size="lg"
          banner={resumed && initial.progress && (
            <ResumeBanner
              detail={`Card ${cursor} of ${cards.length}`}
              updatedAt={initial.progress.updatedAt}
              discardLabel={arrivalLabel ? `Start ${arrivalLabel} instead` : "Discard and start over"}
              onDiscard={() => { progress.cancel(); storage.clearProgress(DRILL); abandonActivePractice(); restart({ keepArrival: true }); }}
            />
          )}
        >
          {phase === "ready" && <ReadyCountdown reducedMotion={reducedMotion} onDone={beginDealing} />}
          {phase === "show" && (
            <div className="flex flex-col gap-4">
              <CardGroup cards={visible} seed={cursor} animated={settings.animations} hints={setup.hints} />
              {selfPaced && (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={advance} className="min-w-44">Deal next</Button>
                  {settings.shortcuts && <span className="hidden items-center gap-1.5 text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:flex"><KeyHint>Space</KeyHint> or <KeyHint>Enter</KeyHint></span>}
                </div>
              )}
              <p className="text-center text-sm text-[var(--ink-muted)]">{nextCheckText(setup.checkpoint, cursor, cards.length)}</p>
            </div>
          )}
          {phase === "interruption" && <InterruptionView onReturn={() => { setSize(pickSize()); setPhase("show"); focusStage(); }} />}
          {phase === "paused" && <PausedView cursor={cursor} total={cards.length} count={expected} onResume={resume} shortcuts={settings.shortcuts} />}
          {phase === "answer" && (
            <div className="grid gap-5 py-2 text-center sm:py-6">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">What&apos;s the running count?</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{ending ? `You ended after card ${cursor}. Give your count to save the session.` : `After card ${cursor} of ${cards.length}`}</p>
              </div>
              <AnswerPad
                key={`check-${checks}`}
                fields={[{ id: "running-count", label: "Running count", value: answer, onChange: setAnswer, kind: "signed-int" }]}
                submitLabel="Check count"
                onSubmit={([value], [text]) => submit(value, text)}
                secondary={<>
                  <GhostButton size="compact" type="button" onClick={() => submit(null, null)}>I lost the count</GhostButton>
                  {ending && <GhostButton size="compact" type="button" onClick={() => setQuitting(true)}>Quit without saving</GhostButton>}
                </>}
              />
            </div>
          )}
          {phase === "feedback" && feedback && (
            <RunningFeedback feedback={feedback} cards={cards} onContinue={continueAfterFeedback} />
          )}
        </DrillStage>
        <ConfirmModal open={quitting} tone="danger" title="Quit without saving?" description="Nothing from this run will be saved to your stats." confirmLabel="Quit without saving" cancelLabel="Keep going" onCancel={() => setQuitting(false)} onConfirm={() => { setQuitting(false); discard(); }} />
      </DrillFrame>
    </div>
  );
}

function RunningFeedback({ feedback, cards, onContinue }: { feedback: Feedback; cards: Card[]; onContinue: () => void }) {
  const { ok, expected, answer } = feedback;
  const diff = answer === null ? 0 : Number(answer) - expected;
  const recap = feedback.recapFrom === undefined ? null : <CardRecap before={cards.slice(0, feedback.recapFrom)} cards={cards.slice(feedback.recapFrom, feedback.to)} />;
  return (
    <div className="mx-auto max-w-xl py-2 sm:py-6">
      <FeedbackPanel
        ok={ok}
        title={ok ? "Correct" : "Not quite"}
        detail={ok ? <>The running count is <b className="font-data text-[var(--ink)]">{displaySigned(expected)}</b>.</> : answer === null ? "You skipped this check." : `Off by ${Math.abs(diff)}: you were ${Math.abs(diff)} ${diff > 0 ? "high" : "low"}.`}
        rows={ok ? undefined : [{ label: "Running count", yours: answer === null ? "—" : displaySigned(Number(answer)), correct: displaySigned(expected), ok: false }]}
        cause={ok ? undefined : runningCountCause(feedback.category, expected)}
        visual={recap}
        action={<Button onClick={onContinue} className="min-w-44">{feedback.last ? "See results" : "Continue"}</Button>}
      >
        {feedback.explanation}
      </FeedbackPanel>
    </div>
  );
}

function runningPresetInterruption(preset: CountingPreset) {
  return RUNNING_SESSION_CARDS.find((card) => card.id === preset)?.values.interruption ?? false;
}
