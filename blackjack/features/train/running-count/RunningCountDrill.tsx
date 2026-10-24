"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Pause, PhoneCall, Play } from "lucide-react";
import { AnswerDisplay, NumberPad } from "@/components/blackjack";
import { Feedback, PlayDock, PlayFrame, ResumeBanner } from "@/components/drill/DrillKit";
import { announce, Button, ConfirmSheet, Kbd } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import {
  classifyCountError,
  ERROR_CATEGORY_TIP,
  isPerfectDeck,
  makeCountSequence,
  makeTableRounds,
  roundStarts,
  runningCountCause,
  type CountBias,
  type CountingPreset,
  type TableRound,
} from "@/lib/blackjack/countingTraining";
import {
  dealOf,
  effectiveCardCount,
  isCheckDue,
  isSettingsPreset,
  matchRunningPreset,
  nextCheckText,
  normalizeRunningFocus,
  randomCheckGap,
  roundPauseMs,
  RUNNING_INTERVALS,
  RUNNING_SESSION_CARDS,
  SELF_PACED,
  spotsOf,
  type FeedbackMode,
  type RunningCardId,
  type RunningCheckpoint,
  type RunningDeal,
  type RunningGroup,
  type RunningValues,
} from "@/lib/blackjack/countingSetup";
import { runningCount, signed } from "@/lib/blackjack/hiLo";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import type { Card } from "@/lib/blackjack/types";
import { useSettings } from "@/lib/hooks/useSettings";
import { useSessions } from "@/lib/hooks/useSessions";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { relativeTime } from "@/lib/statistics/drillRound";
import { makeSession, storage, type CountingErrorCategory, type Mistake, type Session, type Settings } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { rulesFromSettings, toBlackjackRules } from "@/lib/strategy";
import { ignoreKey, readSetupMemory, useArrival, useLatest, useReducedMotion, useSavedProgress, writeSetupMemory } from "../counting-shared/hooks";
import { CardChips, COMPACT_DISPLAY, COMPACT_PAD, signedText, spokenCard, StageNotice } from "../counting-shared/parts";
import { CardGroupView, CardRecap, ReadyCountdown, TableView } from "./RunningStage";
import { RunningSetup, type RunningSetupState } from "./RunningSetup";
import { RunningSummary } from "./RunningSummary";

const DRILL = "Running Count" as const;
const MEMORY_KEY = "countlab:drill-setup:running-count";

type Phase = "setup" | "ready" | "show" | "roundEnd" | "interruption" | "paused" | "answer" | "feedback" | "done";
/** What a step leads to once it is over: a count check, the interruption, or (table rounds) the end-of-round decision. */
type Pending = "check" | "interruption" | "round";

/**
 * Saved progress ("hilo:progress:Running Count"). The field names and the
 * "answer" | "paused" phase are the ones earlier versions saved, so their
 * unfinished sessions resume here; every play phase other than a check is
 * saved as "paused". The fields after `pending` are additions.
 */
type RunningSaved = {
  preset: CountingPreset; decks: number; amount: number; speed: number;
  group: RunningGroup; checkpoint: RunningCheckpoint;
  bias: CountBias; feedbackMode: FeedbackMode;
  phase: "answer" | "paused"; cards: Card[]; cursor: number; size: number; answer: string;
  checks: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  elapsed: number; interruptionUsed: boolean;
  interruption?: boolean; hints?: boolean; lastCheckCursor?: number; pending?: Pending;
  deal?: RunningDeal; spots?: number; rounds?: TableRound[]; steps?: number; gap?: number; ending?: boolean; answerMs?: number;
};

/** The last setup started here, so a counter's own session comes back. */
type Memory = { last?: RunningCardId | "custom"; values?: RunningSetupState; basis?: CountingPreset };

type FeedbackInfo = { ok: boolean; expected: number; answer: string | null; category?: CountingErrorCategory; recapFrom?: number; to: number; last: boolean };

const usable = (saved: RunningSaved) => Array.isArray(saved.cards) && saved.cards.length > 0 && Number.isFinite(saved.cursor) && saved.cursor <= saved.cards.length
  && (saved.deal !== "table" || (Array.isArray(saved.rounds) && saved.rounds.length > 0));

const PICKER_ORDER: RunningCardId[] = ["starter", "two-card-cancellation", "six-deck-casino", "table", "recovery", "one-deck-speed"];

/** The session cards in picker order, with the Beginner session at the reader's own card speed from Settings. */
function sessionCards(settings: Settings) {
  const speed = (RUNNING_INTERVALS as readonly number[]).includes(settings.speed) && settings.speed !== SELF_PACED ? settings.speed : 1000;
  return PICKER_ORDER.map((id) => {
    const card = RUNNING_SESSION_CARDS.find((option) => option.id === id)!;
    return id === "starter" ? { ...card, values: { ...card.values, speed } } : card;
  });
}

function cardSetup(id: RunningCardId, cards: ReturnType<typeof sessionCards>, current: Pick<RunningSetupState, "bias" | "feedbackMode">): RunningSetupState {
  const card = cards.find((option) => option.id === id) ?? cards[0];
  return { deal: "cards", spots: 3, ...card.values, bias: id === "starter" ? "none" : current.bias, feedbackMode: current.feedbackMode, hints: id === "starter" };
}

const valuesOf = (setup: RunningSetupState): RunningValues => ({ decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, interruption: setup.interruption, deal: dealOf(setup), spots: spotsOf(setup) });

function setupFromSaved(saved: RunningSaved): RunningSetupState {
  const preset = RUNNING_SESSION_CARDS.find((card) => card.id === saved.preset);
  return {
    decks: saved.decks, amount: saved.amount, speed: saved.speed, group: saved.group, checkpoint: saved.checkpoint,
    interruption: saved.interruption ?? preset?.values.interruption ?? false,
    deal: saved.deal === "table" ? "table" : "cards", spots: saved.spots ?? 3,
    bias: saved.bias ?? "none", feedbackMode: saved.feedbackMode ?? "immediate", hints: saved.hints ?? false,
  };
}

const isMemoryValues = (values: unknown): values is RunningSetupState =>
  Boolean(values && typeof values === "object" && typeof (values as RunningSetupState).decks === "number" && typeof (values as RunningSetupState).amount === "number" && typeof (values as RunningSetupState).speed === "number");

export function RunningCountDrill() {
  return <Suspense fallback={null}><RunningCountLoader /></Suspense>;
}

function RunningCountLoader() {
  const { settings, ready } = useSettings();
  const arrival = useArrival(DRILL);
  const [boot, setBoot] = useState({ key: 0, resume: false });
  const restart = useCallback((resume: boolean) => setBoot((current) => ({ key: current.key + 1, resume })), []);
  if (!ready) return null;
  return <RunningCountSession key={boot.key} settings={settings} arrival={boot.key === 0 ? arrival : { starter: false }} resume={boot.resume} restart={restart} />;
}

function RunningCountSession({ settings, arrival, resume, restart }: { settings: Settings; arrival: { focus?: string; starter: boolean }; resume: boolean; restart: (resume: boolean) => void }) {
  const { update } = useSettings();
  const history = useSessions(DRILL);
  const reducedMotion = useReducedMotion();
  const cardsList = useMemo(() => sessionCards(settings), [settings]);

  const [init] = useState(() => {
    const progress = resume ? storage.progress<RunningSaved>(DRILL) : null;
    const saved = progress?.state && usable(progress.state) ? progress.state : undefined;
    const focusCard: RunningCardId | undefined = normalizeRunningFocus(arrival.focus) ?? (arrival.starter ? "starter" : undefined);
    const base = { bias: "none" as CountBias, feedbackMode: settings.countingFeedback };
    const memory = readSetupMemory<Memory>(MEMORY_KEY);
    let setup: RunningSetupState;
    if (saved) setup = setupFromSaved(saved);
    else if (focusCard) setup = cardSetup(focusCard, cardsList, base);
    else if (memory?.last && memory.basis === settings.countingPreset) {
      setup = memory.last === "custom"
        ? (isMemoryValues(memory.values) ? { ...memory.values, feedbackMode: settings.countingFeedback } : cardSetup(settings.countingPreset, cardsList, base))
        : cardSetup(memory.last, cardsList, base);
    } else if (!storage.sessions().some((session) => session.drill === DRILL)) setup = cardSetup("starter", cardsList, base);
    else setup = cardSetup(settings.countingPreset, cardsList, base);
    return { saved, setup, focusCard };
  });
  const saved = init.saved;

  const [setup, setSetup] = useState<RunningSetupState>(init.setup);
  const matched = matchRunningPreset(valuesOf(setup), cardsList);
  const startedCard = useRef<RunningCardId | null>(matchRunningPreset(valuesOf(init.setup), cardsList));
  const [lastPicked, setLastPicked] = useState<RunningCardId>(() => startedCard.current ?? "starter");
  /** Whether the reader picked or changed anything here; a hand-off alone is not their choice. */
  const chose = useRef(false);
  const [preset, setPreset] = useState<CountingPreset>(() => (saved?.preset ?? (isSettingsPreset(startedCard.current) ? startedCard.current : settings.countingPreset)));

  const [phase, setPhase] = useState<Phase>(saved ? saved.phase : "setup");
  const [cards, setCards] = useState<Card[]>(saved?.cards ?? []);
  const [rounds, setRounds] = useState<TableRound[] | null>(saved?.deal === "table" ? saved.rounds ?? null : null);
  const [cursor, setCursor] = useState(saved?.cursor ?? 0);
  const [size, setSize] = useState(saved?.size ?? 1);
  const [answer, setAnswer] = useState(saved?.phase === "answer" ? saved.answer ?? "" : "");
  const [checks, setChecks] = useState(saved?.checks ?? 0);
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0);
  // Unknown after resuming an older save; the recap is then skipped for one check.
  const [lastCheckCursor, setLastCheckCursor] = useState<number | undefined>(saved ? saved.lastCheckCursor : 0);
  const [feedback, setFeedback] = useState<FeedbackInfo>();
  const [result, setResult] = useState<Session>();
  const [ending, setEnding] = useState(saved?.ending ?? false);
  const [quitting, setQuitting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(saved?.phase === "paused" ? saved.pending ?? null : null);
  const [revealCount, setRevealCount] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [steps, setSteps] = useState(saved?.steps ?? 0);

  const startRef = useRef(Date.now() - (saved?.elapsed ?? 0));
  const answerStart = useRef(Date.now());
  const pausedAt = useRef(saved?.phase === "paused" ? Date.now() : 0);
  const pausedTotal = useRef(0);
  const answerTotal = useRef(saved?.answerMs ?? 0);
  const interrupted = useRef(false);
  const interruptionUsed = useRef(saved?.interruptionUsed ?? false);
  const gap = useRef(saved?.gap ?? randomCheckGap(dealOf(init.setup)));
  const feedbackShownAt = useRef(0);

  const tableMode = dealOf(setup) === "table" && rounds !== null;
  const starts = useMemo(() => (rounds ? roundStarts(rounds) : []), [rounds]);
  const roundAt = (index: number) => {
    let found = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= index) found = i;
    return found;
  };
  const countThrough = (n: number) => runningCount(cards.slice(0, Math.max(0, n)));

  const playing = phase !== "setup" && phase !== "done";
  useWakeLock(playing && phase !== "paused");
  const progress = useDrillProgress(DRILL, playing && !result, {
    preset, decks: setup.decks, amount: setup.amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, bias: setup.bias, feedbackMode: setup.feedbackMode,
    phase: phase === "answer" ? "answer" : "paused",
    cards, cursor, size, answer: phase === "answer" ? answer : "",
    checks, correct, streak, best, mistakes, categories, elapsed,
    interruptionUsed: interruptionUsed.current,
    interruption: setup.interruption, hints: setup.hints, lastCheckCursor, pending: pending ?? undefined,
    deal: dealOf(setup), spots: spotsOf(setup), rounds: rounds ?? undefined, steps, gap: gap.current, ending, answerMs: answerTotal.current,
  } satisfies RunningSaved, { throttleMs: 10_000 });
  // Save at once at the moments worth resuming from, not only on the throttle.
  useEffect(() => { if (phase === "answer" || phase === "paused" || phase === "feedback" || phase === "interruption") progress.flush(); }, [phase, progress]);

  useEffect(() => {
    if (phase !== "show" && phase !== "roundEnd" && phase !== "answer" && phase !== "feedback" && phase !== "interruption") return;
    const id = window.setInterval(() => setElapsed(Date.now() - startRef.current - pausedTotal.current), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const pickSize = () => (dealOf(setup) === "table" ? 1 : setup.group === "random" ? 1 + Math.floor(Math.random() * 4) : Number(setup.group));
  const visible = phase === "show" && !tableMode ? cards.slice(cursor, Math.min(cards.length, cursor + size)) : [];

  /* ------------------------------ Session life ------------------------------ */

  const finish = (nextChecks = checks, nextCorrect = correct, nextMistakes = mistakes, nextCategories = categories, nextBest = best, seen = cursor) => {
    const total = Date.now() - startRef.current - pausedTotal.current;
    const session = makeSession(DRILL, nextChecks, nextCorrect, total, nextBest, nextMistakes, nextCategories, {
      cardsPerSecond: seen / Math.max(0.001, total / 1000), elapsedSeconds: total / 1000,
      perfectDeck: isPerfectDeck({ cardsLength: cards.length, seen, correct: nextCorrect, checks: nextChecks }), cardsSeen: seen,
      averageAnswerLatency: answerTotal.current / Math.max(1, nextChecks),
      interruptionAccuracy: interruptionUsed.current ? Number(nextMistakes.every((mistake) => mistake.category !== "interruption recovery")) * 100 : 100,
      deal: dealOf(setup), speed: setup.speed, decks: setup.decks,
      ...(dealOf(setup) === "table" ? { spots: spotsOf(setup) } : {}),
    }, [preset, dealOf(setup) === "table" ? "table" : setup.group, setup.checkpoint, setup.bias]);
    progress.cancel();
    storage.addSession(session);
    storage.clearProgress(DRILL);
    setResult(session);
    return session;
  };

  /** Back to setup without saving: nothing was graded, or the reader chose to quit. */
  const discard = () => {
    progress.cancel();
    storage.clearProgress(DRILL);
    abandonActivePractice();
    setCards([]); setRounds(null); setCursor(0); setChecks(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setElapsed(0);
    setFeedback(undefined); setEnding(false); setAnswer(""); setPending(null); setResult(undefined);
    setPhase("setup");
  };

  const start = () => {
    const card = matchRunningPreset(valuesOf(setup), cardsList);
    const tag: CountingPreset = isSettingsPreset(card) ? card : preset;
    if (card !== startedCard.current) track("difficulty_changed", { drill: DRILL, from: startedCard.current ?? "custom", to: card ?? "custom" });
    startedCard.current = card;
    // A hand-off sets up this session only; the reader's own pick becomes their Settings default.
    const ownChoice = chose.current || card !== init.focusCard;
    if (ownChoice && isSettingsPreset(card) && card !== settings.countingPreset) update({ countingPreset: card });
    if (ownChoice || !init.focusCard) writeSetupMemory<Memory>(MEMORY_KEY, card ? { last: card, basis: isSettingsPreset(card) ? card : settings.countingPreset } : { last: "custom", values: setup, basis: settings.countingPreset });
    setPreset(tag);
    const table = dealOf(setup) === "table";
    const amount = effectiveCardCount(setup.decks, setup.amount);
    if (table) {
      const dealt = makeTableRounds({ decks: setup.decks, amount, spots: spotsOf(setup), rules: toBlackjackRules(rulesFromSettings(settings), settings.resplitAces) });
      setRounds(dealt.rounds); setCards(dealt.cards);
    } else {
      setRounds(null); setCards(makeCountSequence(setup.decks, setup.amount, setup.bias));
    }
    setCursor(0); setSize(table ? 1 : pickSize()); setChecks(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setElapsed(0);
    setLastCheckCursor(0); setFeedback(undefined); setResult(undefined); setEnding(false); setAnswer(""); setPending(null); setRevealCount(false); setSteps(0);
    pausedTotal.current = 0; answerTotal.current = 0; interruptionUsed.current = false; interrupted.current = false;
    gap.current = randomCheckGap(dealOf(setup));
    setPhase("ready");
    track("drill_started", { drill: DRILL, preset: tag, mode: table ? "table" : "cards", decks: setup.decks, amount, speed: setup.speed, group: setup.group, checkpoint: setup.checkpoint, bias: setup.bias });
  };
  const beginDealing = useCallback(() => { startRef.current = Date.now(); pausedTotal.current = 0; setPhase("show"); }, []);

  /* --------------------------------- Dealing -------------------------------- */

  /** What the cards just dealt (from → to) lead to. */
  const outcomeAfter = (from: number, to: number, stepCount: number): Exclude<Pending, "round"> | "deal" => {
    if (setup.interruption && !interruptionUsed.current && to >= cards.length / 2 && to < cards.length) return "interruption";
    const due = isCheckDue({ checkpoint: setup.checkpoint, from, to, total: cards.length, countBefore: countThrough(from), countAfter: countThrough(to), steps: stepCount, randomGap: gap.current });
    return due ? "check" : "deal";
  };

  const askForCount = (at: number) => {
    setSteps(0);
    if (setup.checkpoint === "random") gap.current = randomCheckGap(dealOf(setup));
    answerStart.current = Date.now();
    setAnswer("");
    setPhase("answer");
    announce(`What is the running count after card ${at} of ${cards.length}?`);
    track("question_presented", { drill: DRILL, category: "running_count", scenario: `checkpoint_${setup.checkpoint}`, attempt: checks + 1 });
  };

  const follow = (outcome: Pending | "deal", at: number) => {
    if (outcome === "round") return afterRound();
    if (outcome === "interruption") {
      interruptionUsed.current = true;
      interrupted.current = true;
      setPhase("interruption");
      announce("Interruption. Look away and hold your count.");
    } else if (outcome === "check") askForCount(at);
    else { setSize(pickSize()); setPhase("show"); }
  };

  /** The step on the table is over: move past it and see what it leads to. */
  const advance = () => {
    if (tableMode && rounds) {
      const round = roundAt(cursor);
      const end = starts[round] + rounds[round].size;
      const next = Math.min(cards.length, cursor + 1);
      setCursor(next);
      if (next >= end) setPhase("roundEnd");
      return;
    }
    const next = Math.min(cards.length, cursor + size);
    const stepCount = steps + 1;
    setCursor(next);
    setSteps(stepCount);
    follow(outcomeAfter(cursor, next, stepCount), next);
  };

  /** A table round has finished and sat on the felt for a moment: check, interrupt, or deal the next one. */
  function afterRound() {
    if (!rounds) return;
    const round = roundAt(cursor - 1);
    const stepCount = steps + 1;
    setSteps(stepCount);
    const outcome = outcomeAfter(starts[round], cursor, stepCount);
    if (outcome === "deal") { setSize(1); setPhase("show"); return; }
    follow(outcome, cursor);
  }

  const advanceRef = useLatest(advance);
  const afterRoundRef = useLatest(afterRound);
  useEffect(() => {
    if (phase !== "show" || setup.speed === SELF_PACED) return;
    const id = window.setTimeout(() => advanceRef.current(), setup.speed);
    return () => window.clearTimeout(id);
  }, [phase, cursor, size, setup.speed, advanceRef]);
  useEffect(() => {
    if (phase !== "roundEnd" || setup.speed === SELF_PACED) return;
    const id = window.setTimeout(() => afterRoundRef.current(), roundPauseMs(setup.speed));
    return () => window.clearTimeout(id);
  }, [phase, setup.speed, afterRoundRef]);

  // Screen readers hear each card as it lands.
  useEffect(() => {
    if (phase !== "show") return;
    if (tableMode) { if (cards[cursor]) announce(spokenCard(cards[cursor])); return; }
    if (visible.length) announce(visible.map(spokenCard).join(", "));
  }, [phase, cursor, size]); // eslint-disable-line react-hooks/exhaustive-deps -- announce once per new step

  const pause = () => {
    if (phase === "ready") { startRef.current = Date.now(); pausedTotal.current = 0; }
    let at = cursor;
    let nextPending: Pending | null = null;
    // What is on the table counts as dealt: the reader has already added it.
    if (phase === "show") {
      if (tableMode && rounds) {
        const round = roundAt(cursor);
        at = Math.min(cards.length, cursor + 1);
        setCursor(at);
        if (at >= starts[round] + rounds[round].size) nextPending = "round";
      } else {
        at = Math.min(cards.length, cursor + size);
        const stepCount = steps + 1;
        setCursor(at);
        setSteps(stepCount);
        const outcome = outcomeAfter(cursor, at, stepCount);
        nextPending = outcome === "deal" ? null : outcome;
      }
    } else if (phase === "roundEnd") nextPending = "round";
    setPending(nextPending);
    setRevealCount(false);
    pausedAt.current = Date.now();
    setPhase("paused");
    announce(at ? `Paused after card ${at}. Your place is saved.` : "Paused. Your place is saved.");
  };

  const resumePlay = () => {
    pausedTotal.current += Date.now() - pausedAt.current;
    if (pending) {
      const next = pending;
      setPending(null);
      follow(next, cursor);
      return;
    }
    setSize(pickSize());
    setPhase("show");
    announce("Resumed.");
  };

  // Switching away pauses the deal, so no cards pass unseen.
  const pauseRef = useLatest(pause);
  const phaseRef = useLatest(phase);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && ["show", "ready", "roundEnd"].includes(phaseRef.current)) pauseRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pauseRef, phaseRef]);

  const selfPaced = setup.speed === SELF_PACED;
  // P pauses and resumes; Space and Enter deal the next card when self-paced (and otherwise pause or resume).
  const keyRef = useLatest((key: string) => {
    if (key === "p") return phase === "paused" ? resumePlay() : phase === "show" || phase === "ready" || phase === "roundEnd" ? pause() : undefined;
    if (phase === "paused") return resumePlay();
    if (phase === "interruption") return returnToTable();
    if (selfPaced && phase === "show") return advance();
    if (selfPaced && phase === "roundEnd") return afterRound();
    if (key === " " && (phase === "show" || phase === "roundEnd" || phase === "ready")) return pause();
  });
  const keysOn = phase === "show" || phase === "roundEnd" || phase === "ready" || phase === "paused" || phase === "interruption";
  useEffect(() => {
    if (!keysOn) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== "p" && key !== " " && key !== "enter") return;
      if (ignoreKey(event, key !== "p") || !storage.settings().shortcuts) return;
      event.preventDefault();
      keyRef.current(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysOn, keyRef]);

  function returnToTable() {
    // Straight to a check: holding the count through the break is the skill.
    askForCount(cursor);
  }

  /* -------------------------------- Answering ------------------------------- */

  const submit = (value: number | null, text: string | null) => {
    const responseTimeMs = Date.now() - answerStart.current;
    answerTotal.current += responseTimeMs;
    const expected = countThrough(cursor);
    const ok = value !== null && value === expected;
    const nextChecks = checks + 1, nextCorrect = correct + Number(ok), nextStreak = ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak);
    const stepStart = tableMode ? starts[roundAt(Math.max(0, cursor - 1))] : Math.max(0, cursor - size);
    const lastCards = cards.slice(stepStart, cursor);
    const category = ok ? undefined : classifyCountError({ expected, actual: value ?? 0, previous: countThrough(stepStart), cards: lastCards, interrupted: interrupted.current });
    const explanation = category === "missed cancellation" ? "Cancel low and high cards in pairs before carrying the net value forward." : category === "interruption recovery" ? "Repeat the count to yourself the moment you look away." : "Recount from the previous check and watch the sign.";
    const nextMistakes = ok ? mistakes : [...mistakes, { question: `Running count after ${cursor} cards`, userAnswer: value === null ? "lost the count" : signed(value), correctAnswer: signed(expected), explanation, category }];
    const sign = expected < 0 ? "negative" : expected > 0 ? "positive" : "zero";
    const key = dealOf(setup) === "table" ? `table rounds, ${sign}` : `${setup.group}-card groups, ${sign}`;
    const previous = categories[key] ?? { correct: 0, total: 0 };
    const nextCategories = { ...categories, [key]: { correct: previous.correct + Number(ok), total: previous.total + 1 } };
    setChecks(nextChecks); setCorrect(nextCorrect); setStreak(nextStreak); setBest(nextBest); setMistakes(nextMistakes); setCategories(nextCategories);
    interrupted.current = false;
    const recapFrom = lastCheckCursor;
    setLastCheckCursor(cursor);
    track("running_count_answered", { ok, expected, actual: value, group: dealOf(setup) === "table" ? "table" : setup.group, checkpoint: setup.checkpoint, category, responseTimeMs, attempt: nextChecks, streak: nextStreak });
    const last = cursor >= cards.length || ending;
    if (last) finish(nextChecks, nextCorrect, nextMistakes, nextCategories, nextBest);
    if (setup.feedbackMode === "immediate") {
      setFeedback({ ok, expected, answer: text, category, recapFrom, to: cursor, last });
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(ok ? `Correct. The running count is ${signedText(expected)}.` : `Not quite. ${text === null ? "You lost the count" : `You said ${signedText(Number(text))}`}; the running count is ${signedText(expected)}.`);
    } else if (last) setPhase("done");
    else { setSize(pickSize()); setPhase("show"); announce("Answer saved. Keep counting."); }
  };

  const submitTyped = () => {
    const parsed = parseAnswer(answer, "signed-int");
    if (!parsed.ok) { announce(parsed.error); return; }
    submit(parsed.value, parsed.text);
  };

  const continueAfterFeedback = () => {
    // A second Enter right after the verdict appears should not skip it.
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (feedback?.last) { setPhase("done"); return; }
    setFeedback(undefined);
    setSize(pickSize());
    setPhase("show");
  };

  /**
   * The X in the header. With checks answered, the session is saved as it
   * stands. With cards seen but nothing checked, ask for the count once so
   * the work counts. With nothing dealt, leave without saving.
   */
  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (ending && phase === "answer") { setQuitting(true); return; }
    let seen = cursor;
    if (phase === "show") { seen = tableMode ? Math.min(cards.length, cursor + 1) : Math.min(cards.length, cursor + size); setCursor(seen); }
    if (phase === "paused") { pausedTotal.current += Date.now() - pausedAt.current; pausedAt.current = Date.now(); }
    setPending(null);
    if (checks > 0) { finish(checks, correct, mistakes, categories, best, seen); setPhase("done"); return; }
    if (seen > 0) {
      setEnding(true);
      if (phase !== "answer") { answerStart.current = Date.now(); setAnswer(""); setPhase("answer"); }
      announce("Give your running count to save this session.");
      return;
    }
    // Nothing dealt yet: nothing to lose, so no question.
    discard();
  };

  /* --------------------------------- Screens -------------------------------- */

  const unfinished = useSavedProgress<RunningSaved>(DRILL, phase === "setup" && !dismissed, usable);

  if (phase === "done" && result) {
    return <RunningSummary session={result} totalCards={cards.length} interruptionUsed={interruptionUsed.current} onAgain={start} onChangeSetup={() => { setResult(undefined); setPhase("setup"); }} />;
  }

  if (phase === "setup") {
    const fastestPerfect = history.filter((session) => session.metrics?.perfectDeck).map((session) => Number(session.metrics?.elapsedSeconds)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const resetCard = RUNNING_SESSION_CARDS.find((card) => card.id === lastPicked);
    return (
      <RunningSetup
        setup={setup}
        cards={cardsList}
        matched={matched}
        onChange={(next) => { chose.current = true; setSetup((current) => ({ ...current, ...next })); }}
        onPick={(id) => { chose.current = true; setSetup((current) => cardSetup(id, cardsList, current)); setLastPicked(id); }}
        onReset={() => setSetup((current) => cardSetup(lastPicked, cardsList, current))}
        resetLabel={`Back to ${resetCard ? resetCard.title : "the preset"}`}
        onStart={start}
        firstTime={history.length === 0}
        fastestPerfect={fastestPerfect}
        resume={unfinished && (
          <ResumeBanner
            detail={`Card ${unfinished.state.cursor} of ${unfinished.state.cards.length}${unfinished.state.checks ? `, ${unfinished.state.correct} of ${unfinished.state.checks} checks right` : ""} · ${relativeTime(unfinished.updatedAt)}`}
            onResume={() => restart(true)}
            onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); setDismissed(true); }}
          />
        )}
      />
    );
  }

  const total = cards.length;
  const shownThrough = phase === "show" ? (tableMode ? Math.min(total, cursor + 1) : Math.min(total, cursor + visible.length)) : cursor;
  const onFelt = phase === "ready" || phase === "show" || phase === "roundEnd";
  const tableRound = tableMode && rounds ? (() => {
    const index = phase === "show" ? roundAt(cursor) : roundAt(Math.max(0, cursor - 1));
    return { index, round: rounds[index], revealed: phase === "show" ? cursor - starts[index] + 1 : rounds[index].size };
  })() : null;
  const lastCards = cards.slice(Math.max(0, tableMode ? starts[roundAt(Math.max(0, cursor - 1))] : cursor - size), cursor);

  return (
    <PlayFrame title="Running Count" onExit={endDrill} clock={elapsed} streak={setup.feedbackMode === "immediate" ? streak : undefined}>
      <div className="flex flex-1 flex-col gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="tnum font-semibold">Card {shownThrough} of {total}</span>
            <span className="truncate text-ink-3">{phase === "answer" || phase === "feedback" ? `${checks} ${checks === 1 ? "check" : "checks"} so far` : nextCheckText(setup.checkpoint, cursor, total, steps)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${total ? (shownThrough / total) * 100 : 0}%` }} />
          </div>
        </div>

        {onFelt ? (
          <section aria-label="Table" className="relative flex min-h-[15rem] flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl bg-felt px-3 py-4 shadow-[inset_0_2px_30px_rgb(0_0_0/0.35)]">
            {phase === "ready" && <ReadyCountdown reducedMotion={reducedMotion} onDone={beginDealing} />}
            {phase !== "ready" && tableRound && (
              <TableView round={tableRound.round} revealed={tableRound.revealed} spots={spotsOf(setup)} animate={settings.animations} hints={setup.hints} roundNumber={tableRound.index + 1}
                rules={`Blackjack pays 3 to 2 · ${settings.dealerHitsSoft17 ? "Dealer hits soft 17" : "Dealer stands on soft 17"}`} />
            )}
            {phase === "show" && !tableMode && <CardGroupView cards={visible} seed={cursor} animate={settings.animations} hints={setup.hints} />}
          </section>
        ) : phase === "paused" ? (
          <StageNotice icon={<Pause size={24} aria-hidden />} title="Paused">
            <p>{cursor ? `After card ${cursor} of ${total}.` : "Before the first card."} Your place is saved.</p>
            {cursor > 0 && lastCards.length > 0 && (
              <div className="mt-3 flex flex-col items-center gap-1.5 text-sm">
                <span className="text-ink-3">{lastCards.length === 1 ? "Last card dealt" : "Last cards dealt"}</span>
                <CardChips cards={lastCards.slice(-8)} values={setup.hints} />
              </div>
            )}
            <div className="mt-4">
              <Button size="sm" variant="ghost" aria-pressed={revealCount} onClick={() => setRevealCount((shown) => !shown)} icon={revealCount ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}>
                {revealCount ? "Hide the count" : "Show the count"}
              </Button>
              {revealCount && <p className="tnum mt-2 text-5xl font-semibold text-ink">{signedText(countThrough(cursor))}</p>}
            </div>
          </StageNotice>
        ) : phase === "interruption" ? (
          <StageNotice icon={<PhoneCall size={24} aria-hidden />} title="Interruption">
            Look away from the screen and hold your count. When you come back, we ask for it.
          </StageNotice>
        ) : phase === "answer" ? (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <h2 className="text-2xl font-semibold">What is the running count?</h2>
            <p className="mt-1.5 text-[0.9375rem] text-ink-2">{ending ? `You ended after card ${cursor}. Give your count to save the session.` : `After card ${cursor} of ${total}`}</p>
          </div>
        ) : phase === "feedback" && feedback ? (
          <div className="flex flex-1 flex-col justify-start">
            {feedback.recapFrom !== undefined
              ? <CardRecap before={cards.slice(0, feedback.recapFrom)} cards={cards.slice(feedback.recapFrom, feedback.to)} />
              : <StageNotice title={signedText(feedback.expected)}>The running count after card {feedback.to}.</StageNotice>}
          </div>
        ) : null}
      </div>

      <PlayDock>
        <div className="mx-auto w-full max-w-md">
          {(phase === "show" || phase === "roundEnd" || phase === "ready") && (
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className={selfPaced ? "" : "flex-1"} onClick={pause} disabled={phase === "ready"} icon={<Pause size={18} aria-hidden />}
                trailing={<span className="hidden [@media(hover:hover)]:inline"><Kbd>P</Kbd></span>}>
                {selfPaced ? <span className="sr-only sm:not-sr-only">Pause</span> : "Pause"}
              </Button>
              {selfPaced && (
                <Button size="lg" className="flex-1" disabled={phase === "ready"} onClick={phase === "roundEnd" ? afterRound : advance}
                  trailing={<span className="hidden [@media(hover:hover)]:inline"><Kbd>Space</Kbd></span>}>
                  {phase === "roundEnd" ? "Next round" : tableMode ? "Next card" : "Deal next"}
                </Button>
              )}
            </div>
          )}
          {phase === "paused" && <Button size="lg" block onClick={resumePlay} icon={<Play size={18} aria-hidden />}>Resume</Button>}
          {phase === "interruption" && <Button size="lg" block onClick={returnToTable}>Back to the table</Button>}
          {phase === "answer" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={() => submit(null, null)}>I lost the count</Button>
                {ending && <Button size="sm" variant="ghost" onClick={() => setQuitting(true)}>Quit without saving</Button>}
              </div>
              <AnswerDisplay value={answer} label="Running count" className={COMPACT_DISPLAY} />
              <NumberPad value={answer} onChange={setAnswer} onSubmit={submitTyped} maxLength={3} submitLabel="Check" className={COMPACT_PAD} />
            </div>
          )}
          {phase === "feedback" && feedback && <RunningFeedback feedback={feedback} onContinue={continueAfterFeedback} />}
        </div>
      </PlayDock>

      <ConfirmSheet open={quitting} onClose={() => setQuitting(false)} onConfirm={discard} title="Quit without saving?" confirmLabel="Quit without saving">
        Nothing from this run will be saved to your progress.
      </ConfirmSheet>
    </PlayFrame>
  );
}

function RunningFeedback({ feedback, onContinue }: { feedback: FeedbackInfo; onContinue: () => void }) {
  const { ok, expected, answer } = feedback;
  const given = answer === null ? null : Number(answer);
  const diff = given === null ? 0 : given - expected;
  const cause = ok ? undefined : runningCountCause(feedback.category, expected);
  const tip = feedback.category ? ERROR_CATEGORY_TIP[feedback.category] : undefined;
  return (
    <Feedback
      ok={ok}
      title={ok ? `Correct: ${signedText(expected)}` : `The count was ${signedText(expected)}`}
      onContinue={onContinue}
      continueLabel={feedback.last ? "See results" : "Keep counting"}
    >
      {ok ? "Keep it going." : (
        <>
          {given === null ? "You lost the count here." : `You said ${signedText(given)}, ${Math.abs(diff)} too ${diff > 0 ? "high" : "low"}.`}
          {cause && <span className={cx("block", "text-ink")}><span className="font-semibold">{cause}.</span> {tip}</span>}
        </>
      )}
    </Feedback>
  );
}
