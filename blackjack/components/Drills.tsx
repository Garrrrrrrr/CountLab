/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/lib/blackjack/types";
import {
  randomStrategyQuestion,
  StrategyCategory,
} from "@/lib/blackjack/strategyQuestions";
import { signed } from "@/lib/blackjack/hiLo";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import {
  DEVIATION_ACTION_NAMES,
  DeviationAction,
  deviationHandRanks,
  deviationSentence,
  deviationTrainingRows,
} from "@/lib/blackjack/deviations";
import {
  DEFAULT_SETTINGS,
  makeSession,
  Mistake,
  Session,
  Settings,
  storage,
  DrillType,
  SURRENDER_RULES,
  SURRENDER_RULE_LABEL,
  surrenderFlags,
  type SurrenderRule,
} from "@/lib/statistics/storage";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, MobileActionDock, Panel, Select } from "./ui";
import { SessionSummary } from "./SessionSummary";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { consumePracticeFocus, dueItemKeys, forceDue, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { track } from "@/lib/analytics/track";
/**
 * Surrender is asked as its own question, so a play question never offers it.
 * `N` is "play it out" — decline the surrender and go to the hand tables — and
 * only ever appears on a surrender question.
 */
type PlayAnswer = "H" | "S" | "D" | "P";
type DrillAnswer = PlayAnswer | "R" | "N";

const PLAY_ANSWERS: readonly PlayAnswer[] = ["H", "S", "D", "P"];
const SURRENDER_ANSWERS: readonly DrillAnswer[] = ["R", "N"];

const ANSWER_NAMES: Record<DrillAnswer, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
  N: "Play it out",
};

const ANSWER_KEYS: Record<string, DrillAnswer> = { h: "H", s: "S", d: "D", p: "P", r: "R", n: "N" };

/** "N" declines whatever the question offered: insurance on an insurance row, the surrender on a surrender row. */
const deviationAnswerName = (action: DeviationAction, askingSurrender: boolean) => {
  if (action === "I") return "Insurance";
  if (action === "N") return askingSurrender ? "Play it out" : "No insurance";
  return DEVIATION_ACTION_NAMES[action];
};
const SURRENDER_RULE_TAG = { none: "nls", late: "ls", early: "es10" } as const;
const analyticsRulesPreset = (settings: Settings, surrender: SurrenderRule) => `${settings.decks}d_${settings.dealerHitsSoft17 ? "h17" : "s17"}_${settings.doubleAfterSplit ? "das" : "ndas"}_${settings.resplitAces ? "rsa" : "nrsa"}_${SURRENDER_RULE_TAG[surrender]}`;
function Title({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 sm:mb-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p data-mobile-compact-description className="mt-2 max-w-2xl text-zinc-400">{description}</p>
    </div>
  );
}
function record(
  drill: DrillType,
  q: number,
  c: number,
  ms: number,
  streak: number,
  m: Mistake[],
  categories?: Record<string, { correct: number; total: number }>,
) {
  const s = makeSession(drill, q, c, ms, streak, m, categories);
  storage.addSession(s);
  return s;
}
function useSavedSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    const load = () => setSettings(storage.settings());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  return settings;
}
function feedbackTone(correct: boolean, enabled: boolean) {
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = correct ? 660 : 220;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound is optional, so unsupported audio must never interrupt a drill.
  }
}
const rulesFromSettings = (settings: Settings) => ({
  decks: settings.decks,
  dealerHitsSoft17: settings.dealerHitsSoft17,
  doubleAfterSplit: settings.doubleAfterSplit,
  resplitAces: settings.resplitAces,
  ...surrenderFlags(settings.surrender),
  doubleRule: "any" as const,
});

/**
 * The surrender rule is a saved setting rather than drill state, so choosing it
 * here is the same choice as choosing it on the reference chart or in settings,
 * and it survives a closed tab and follows the account to another device.
 *
 * `saveSettings` dispatches `hilo-storage`, which `useSavedSettings` listens
 * for, so every open drill re-renders on the new rule without extra wiring.
 */
function SurrenderRuleSelect({ value }: { value: SurrenderRule }) {
  return (
    <Select
      label="Surrender rule"
      value={value}
      onChange={(event) => storage.saveSettings({ ...storage.settings(), surrender: event.target.value as SurrenderRule })}
    >
      {SURRENDER_RULES.map((rule) => (
        <option key={rule} value={rule}>{SURRENDER_RULE_LABEL[rule]}</option>
      ))}
    </Select>
  );
}

type StrategySaved = {
  q: number; mode: "standard" | "adaptive"; correctCount: number; streak: number; best: number;
  totalMs: number; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
};
export function StrategyDrill() {
  const settings = useSavedSettings();
  const [saved] = useState(() => loadDrillProgress<StrategySaved>("Basic Strategy"));
  const [pendingFocus] = useState(() => {
    if (saved) return undefined;
    const category = consumePracticeFocus("Basic Strategy");
    if (category) forceDue("Basic Strategy", category);
    return category;
  });
  const [q, setQ] = useState(saved?.q ?? 0),
    [mode, setMode] = useState<"standard" | "adaptive">(saved?.mode ?? (pendingFocus ? "adaptive" : "standard")),
    [correctCount, setCorrectCount] = useState(saved?.correctCount ?? 0),
    [streak, setStreak] = useState(saved?.streak ?? 0),
    [best, setBest] = useState(saved?.best ?? 0),
    [totalMs, setTotalMs] = useState(saved?.totalMs ?? 0),
    [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []),
    [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}),
    [started, setStarted] = useState(Date.now()),
    [session, setSession] = useState<Session>(),
    [awaitingFinal, setAwaitingFinal] = useState(false),
    [feedback, setFeedback] = useState<{
      hand: string;
      chosen: DrillAnswer;
      correct: DrillAnswer;
      explanation: string;
      category: StrategyCategory;
    }>();
  const surrenderRule = settings.surrender;
  const finalArgs = useRef<Parameters<typeof finish> | null>(null);
  useEffect(() => {
    track("drill_started", { drill: "Basic Strategy", mode, questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings, surrenderRule), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: surrenderRule });
    // A restored drill is still a new analytics attempt in this browser session.
  }, []);
  const weakest = useMemo<StrategyCategory | undefined>(() => {
    if (mode !== "adaptive") return undefined;
    const due = dueItemKeys("Basic Strategy", ["Hard totals", "Soft totals", "Pairs", "Surrender"]);
    if (due.length > 0) return due[0] as StrategyCategory;
    const totals = storage.sessions()
      .filter((item) => item.drill === "Basic Strategy")
      .reduce<Record<string, { correct: number; total: number }>>((all, item) => {
        for (const [name, value] of Object.entries(item.categories ?? {})) {
          all[name] ??= { correct: 0, total: 0 };
          all[name].correct += value.correct;
          all[name].total += value.total;
        }
        return all;
      }, {});
    const ranked = Object.entries(totals)
      .filter((entry): entry is [StrategyCategory, { correct: number; total: number }] => entry[1].total > 0)
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
    return ranked[0]?.[0];
  }, [mode, q]);
  // Surrender joins the ordinary rotation once the table offers it, because it
  // is now a question in its own right rather than an answer to a play question.
  const data = useMemo(
    () => randomStrategyQuestion(
      weakest && Math.random() < 0.65 ? weakest
        : surrenderRule !== "none" && Math.random() < 0.2 ? "Surrender"
          : undefined,
    ),
    [q, weakest, surrenderRule],
  );
  const rules = { ...rulesFromSettings(settings), ...surrenderFlags(surrenderRule) };
  const category = data.category;
  const askingSurrender = category === "Surrender";
  // The play question is asked as though the surrender had already been
  // declined, matching how the reference chart now reads.
  const playDecision = getBasicStrategyDecision({
    playerCards: data.player,
    dealerUpcard: data.dealer,
    rules: { ...rules, lateSurrender: false, earlySurrenderVsTen: false },
  });
  const surrenderDecision = getBasicStrategyDecision({
    playerCards: data.player,
    dealerUpcard: data.dealer,
    rules,
  });
  const surrenders = surrenderDecision.action === "R";
  const answers = askingSurrender ? SURRENDER_ANSWERS : PLAY_ANSWERS;
  const correctAnswer: DrillAnswer = askingSurrender
    ? (surrenders ? "R" : "N")
    : (playDecision.action as PlayAnswer);
  const explanation = askingSurrender
    ? surrenders
      ? surrenderDecision.explanation
      : `Basic strategy does not give this hand up, so decline and play it out: ${playDecision.explanation.replace(/^.*? is /, "")}`
    : playDecision.explanation;
  const presented = useRef("");
  useEffect(() => {
    const scenario = `${data.player.map((card) => card.rank).sort().join("")}_v_${data.dealer.rank}`;
    const key = `${q}:${scenario}`;
    if (presented.current === key) return;
    presented.current = key;
    track("question_presented", { drill: "Basic Strategy", category, scenario, attempt: q + 1 });
  }, [category, data.dealer.rank, data.player, q]);
  useDrillProgress("Basic Strategy", !session, {
    q, mode, correctCount, streak, best, totalMs, mistakes, categories,
  } satisfies StrategySaved);
  const finish = (
    askedCount = q,
    gotCorrect = correctCount,
    totalTime = totalMs,
    bestStreak = best,
    finalMistakes = mistakes,
    finalCategories = categories,
  ) => {
    setSession(record("Basic Strategy", askedCount, gotCorrect, totalTime, bestStreak, finalMistakes, finalCategories));
    storage.clearProgress("Basic Strategy");
  };
  const endDrill = () => { track("answer_skipped", { drill: "Basic Strategy", category, scenario: `${data.player.map((card) => card.rank).sort().join("")}_v_${data.dealer.rank}`, attempt: q + 1, elapsedMs: Date.now() - started }); finish(); };
  const choose = useCallback(
    (a: DrillAnswer) => {
      if (session || awaitingFinal || !answers.includes(a)) return;
      const ok = a === correctAnswer;
      const duration = Date.now() - started;
      const nextCorrect = correctCount + (ok ? 1 : 0);
      const nextStreak = ok ? streak + 1 : 0;
      const nextBest = Math.max(best, nextStreak);
      const nextMistakes = ok
        ? mistakes
        : [...mistakes, {
            question: `${data.player.map((card) => card.rank).join(",")} vs ${data.dealer.rank}${askingSurrender ? " — surrender?" : ""}`,
            userAnswer: ANSWER_NAMES[a],
            correctAnswer: ANSWER_NAMES[correctAnswer],
            explanation,
          }];
      const nextCategories = {
        ...categories,
        [category]: {
          correct: (categories[category]?.correct ?? 0) + (ok ? 1 : 0),
          total: (categories[category]?.total ?? 0) + 1,
        },
      };
      setFeedback({
        hand: `${data.player.map((card) => card.rank).join(", ")} vs ${data.dealer.rank}${askingSurrender ? " — surrender?" : ""}`,
        chosen: a,
        correct: correctAnswer,
        explanation,
        category,
      });
      setCorrectCount(nextCorrect);
      setStreak(nextStreak);
      setBest(nextBest);
      setTotalMs((value) => value + duration);
      setMistakes(nextMistakes);
      setCategories(nextCategories);
      if (mode === "adaptive") recordAnswer("Basic Strategy", category, ok);
      feedbackTone(ok, settings.sound);
      track("basic_strategy_answered", { ok, chosen: a, correct: correctAnswer, category, mode, scenario: `${data.player.map((card) => card.rank).sort().join("")}_v_${data.dealer.rank}`, responseTimeMs: duration, attempt: q + 1, streak: nextStreak });
      if (q === 9) {
        finalArgs.current = [10, nextCorrect, totalMs + duration, nextBest, nextMistakes, nextCategories];
        setAwaitingFinal(true);
      } else {
        setQ((current) => current + 1);
        setStarted(Date.now());
      }
    },
    [answers, askingSurrender, awaitingFinal, best, categories, category, correctAnswer, correctCount, data, explanation, mistakes, q, session, settings.sound, started, streak, totalMs],
  );
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.repeat || !settings.shortcuts || session || awaitingFinal) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const answer = ANSWER_KEYS[e.key.toLowerCase()];
      if (answer) choose(answer);
    };
    addEventListener("keydown", fn);
    return () => removeEventListener("keydown", fn);
  }, [awaitingFinal, choose, session, settings.shortcuts]);
  if (session) {
    return (
      <SessionSummary
        session={session}
        onNew={() => {
          setQ(0);
          setCorrectCount(0);
          setStreak(0);
          setBest(0);
          setTotalMs(0);
          setMistakes([]);
          setCategories({});
          setFeedback(undefined);
          setSession(undefined);
          setAwaitingFinal(false);
          setStarted(Date.now());
          track("drill_started", { drill: "Basic Strategy", mode, questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings, surrenderRule), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: surrenderRule });
        }}
      />
    );
  }
  return (
    <>
      <Title
        eyebrow={`Hand ${q + 1}`}
        title="Basic Strategy"
        description={`${rules.decks}-deck, ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "no DAS"}, ${SURRENDER_RULE_LABEL[surrenderRule].toLowerCase()}.`}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="max-w-xs">
            <Select label="Practice mode" value={mode} onChange={(event) => { const next = event.target.value as "standard" | "adaptive"; track("practice_mode_changed", { drill: "Basic Strategy", from: mode, to: next }); setMode(next); }}>
              <option value="standard">Balanced</option>
              <option value="adaptive">Adaptive to weak categories</option>
            </Select>
          </div>
          <div className="max-w-xs">
            <SurrenderRuleSelect value={surrenderRule} />
          </div>
        </div>
        <GhostButton onClick={endDrill}>End drill</GhostButton>
      </div>
      {awaitingFinal ? (
        <Panel className="pb-24 lg:pb-6">
          <p className="text-sm text-zinc-400">That was the last hand in this session.</p>
          <Button className="mt-4" onClick={() => finalArgs.current && finish(...finalArgs.current)}>View results</Button>
        </Panel>
      ) : (
        <>
          <Panel className="pb-24 lg:pb-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 py-3 md:grid-cols-2 md:gap-10 md:py-6">
              <div>
                <p className="mb-4 text-sm text-zinc-500">Player hand</p>
                <div className="flex gap-3">
                  {data.player.map((c, i) => (
                  <PlayingCard key={i} card={c} animated={settings.animations} size="sm" />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-4 text-sm text-zinc-500">Dealer upcard</p>
                <PlayingCard card={data.dealer} animated={settings.animations} size="sm" />
              </div>
            </div>
            {askingSurrender && (
              <p className="mb-3 text-sm font-medium text-[var(--ink)]">Surrender this hand, or decline and play it out?</p>
            )}
            <div className="hidden flex-wrap gap-2 lg:flex">
              {answers.map((a) => (
                <GhostButton
                  key={a}
                  aria-keyshortcuts={a}
                  className="flex items-center gap-2"
                  onClick={() => choose(a)}
                >
                  <span>{ANSWER_NAMES[a]}</span>
                  <kbd className="rounded border border-white/15 bg-black/25 px-1.5 py-0.5 font-mono text-[.68rem] text-zinc-400">
                    {a}
                  </kbd>
                </GhostButton>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {settings.shortcuts
                ? "Keyboard shortcuts are shown on each action."
                : "Keyboard shortcuts are shown above but disabled in Settings."}
            </p>
          </Panel>
          <MobileActionDock label="Basic strategy actions">
            <div className="grid grid-cols-2 gap-2">
              {answers.map((a) => <GhostButton key={a} className="px-2 text-sm" onClick={() => choose(a)}>{ANSWER_NAMES[a]}</GhostButton>)}
            </div>
          </MobileActionDock>
        </>
      )}
      {feedback && (
        <div aria-live="polite" className={`mt-4 rounded-xl border p-4 ${feedback.chosen === feedback.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-zinc-500">Previous hand · {feedback.hand}</p>
          <b className={feedback.chosen === feedback.correct ? "text-emerald-300" : "text-red-300"}>
            {feedback.chosen === feedback.correct ? `Correct — ${ANSWER_NAMES[feedback.correct]}` : `You chose ${ANSWER_NAMES[feedback.chosen]} · Correct: ${ANSWER_NAMES[feedback.correct]}`}
          </b>
          <p className="mt-1 text-sm text-zinc-300">{feedback.explanation}</p>
          <p className="mt-2 text-xs text-zinc-500">Category: {feedback.category}</p>
        </div>
      )}
    </>
  );
}

type DeviationSaved = {
  q: number; correctCount: number; streak: number; best: number;
  totalMs: number; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
};
export function DeviationDrill() {
  const settings = useSavedSettings();
  const [saved] = useState(() => loadDrillProgress<DeviationSaved>("Deviations"));
  const [q, setQ] = useState(saved?.q ?? 0),
    [correctCount, setCorrectCount] = useState(saved?.correctCount ?? 0),
    [streak, setStreak] = useState(saved?.streak ?? 0),
    [best, setBest] = useState(saved?.best ?? 0),
    [totalMs, setTotalMs] = useState(saved?.totalMs ?? 0),
    [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []),
    [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}),
    [started, setStarted] = useState(Date.now()),
    [session, setSession] = useState<Session>(),
    [awaitingFinal, setAwaitingFinal] = useState(false),
    [feedback, setFeedback] = useState<{
      hand: string;
      chosen: DeviationAction;
      correct: DeviationAction;
      normalAction: DeviationAction;
      index: number;
      tc: number;
      always?: true;
      departureTriggered: boolean;
      sentence: string;
      askingSurrender: boolean;
    }>();
  const surrenderRule = settings.surrender;
  const finalArgs = useRef<Parameters<typeof finish> | null>(null);
  useEffect(() => {
    track("drill_started", { drill: "Deviations", questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings, surrenderRule), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: surrenderRule });
  }, []);
  // The catalog comes from the rules rather than being picked here, so that
  // early surrender against a ten swaps that column for Wong's table 32.
  const deviationRules = useMemo(
    () => ({ dealerHitsSoft17: settings.dealerHitsSoft17, ...surrenderFlags(surrenderRule) }),
    [settings.dealerHitsSoft17, surrenderRule],
  );
  /**
   * Play rows and surrender rows are drawn separately, the same split the
   * reference chart makes.
   *
   * Play rows come from a no-surrender reading, which is what brings the
   * starred stand indices — 16 v 10 at +0, 15 v 10 at +4 — into the drill. They
   * carry `overridesSurrender`, so a single pass with surrender available
   * resolves them to nothing and the drill has never once asked them.
   */
  const trainingRows = useMemo(() => {
    const play = deviationTrainingRows({ dealerHitsSoft17: settings.dealerHitsSoft17, lateSurrender: false }, settings.decks);
    const surrenderRows = surrenderRule === "none"
      ? []
      : deviationTrainingRows(deviationRules, settings.decks)
        .filter(({ transition }) => transition.departure === "R" || transition.baseline === "R");
    return [...play, ...surrenderRows];
  }, [deviationRules, settings.dealerHitsSoft17, settings.decks, surrenderRule]);
  const question = useMemo(
    () => trainingRows[Math.floor(Math.random() * trainingRows.length)],
    [q, trainingRows],
  );
  const d = question.row;
  const transition = question.transition;
  const tc = useMemo(() => {
      if (d.always) return Math.floor(Math.random() * 12) - 4;
      return d.index + Math.floor(Math.random() * 5) - 2;
    }, [d, q]),
    rc = tc * 3;
  const deviationPresented = useRef("");
  useEffect(() => {
    const scenario = `${d.hand}_v_${d.dealer}`;
    const key = `${q}:${scenario}:${tc}`;
    if (deviationPresented.current === key) return;
    deviationPresented.current = key;
    track("question_presented", { drill: "Deviations", category: d.hand, scenario, attempt: q + 1 });
  }, [d.dealer, d.hand, q, tc]);
  const playerCards = useMemo(
      () => {
        const ranks = deviationHandRanks(d.hand);
        return [
          { rank: ranks[0], suit: "spades" },
          { rank: ranks[1], suit: "hearts" },
        ] satisfies Card[];
      },
      [d],
    ),
    dealerCard = useMemo(
      () => ({ rank: d.dealer as Card["rank"], suit: "diamonds" }) satisfies Card,
      [d],
    ),
    // Surrender is a question of its own, so a play row never offers it and a
    // surrender row asks only whether to give the hand up.
    askingSurrender = transition.departure === "R" || transition.baseline === "R",
    availableActions = useMemo<DeviationAction[]>(
      () => d.hand === "Insurance" ? ["I", "N"] : askingSurrender ? ["R", "N"] : ["H", "S", "D", "P"],
      [askingSurrender, d.hand],
    );
  const departureApplies = d.always === true
      || (transition.atOrBelow ? tc <= d.index : tc >= d.index),
    resolved = departureApplies ? transition.departure : transition.baseline,
    // "N" on a surrender row is "decline and play it out", not "no insurance".
    correct: DeviationAction = askingSurrender ? (resolved === "R" ? "R" : "N") : resolved;
  useDrillProgress("Deviations", !session, {
    q, correctCount, streak, best, totalMs, mistakes, categories,
  } satisfies DeviationSaved);
  const finish = (
    askedCount = q,
    gotCorrect = correctCount,
    totalTime = totalMs,
    bestStreak = best,
    finalMistakes = mistakes,
    finalCategories = categories,
  ) => {
    setSession(record("Deviations", askedCount, gotCorrect, totalTime, bestStreak, finalMistakes, finalCategories));
    storage.clearProgress("Deviations");
  };
  const endDrill = () => { track("answer_skipped", { drill: "Deviations", category: d.hand, scenario: `${d.hand}_v_${d.dealer}`, attempt: q + 1, elapsedMs: Date.now() - started }); finish(); };
  const chooseDeviation = useCallback(
    (chosen: DeviationAction) => {
      if (session || awaitingFinal) return;
      const ok = chosen === correct;
      const duration = Date.now() - started;
      const nextCorrect = correctCount + (ok ? 1 : 0);
      const nextStreak = ok ? streak + 1 : 0;
      const nextBest = Math.max(best, nextStreak);
      const category = d.hand === "Insurance" ? "Insurance" : `${d.hand} vs ${d.dealer}`;
      const nextMistakes = ok
        ? mistakes
        : [...mistakes, {
            question: `${d.hand} vs ${d.dealer} at TC ${signed(tc)}`,
            userAnswer: deviationAnswerName(chosen, askingSurrender),
            correctAnswer: deviationAnswerName(correct, askingSurrender),
            explanation: deviationSentence(d, transition),
          }];
      const nextCategories = {
        ...categories,
        [category]: {
          correct: (categories[category]?.correct ?? 0) + (ok ? 1 : 0),
          total: (categories[category]?.total ?? 0) + 1,
        },
      };
      setFeedback({
        hand: `${playerCards.map((card) => card.rank).join(", ")} vs ${dealerCard.rank}`,
        chosen,
        correct,
        normalAction: transition.baseline,
        index: d.index,
        tc,
        always: d.always,
        departureTriggered: departureApplies,
        sentence: deviationSentence(d, transition),
        askingSurrender,
      });
      setCorrectCount(nextCorrect);
      setStreak(nextStreak);
      setBest(nextBest);
      setTotalMs((value) => value + duration);
      setMistakes(nextMistakes);
      setCategories(nextCategories);
      feedbackTone(ok, settings.sound);
      track("deviation_answered", { ok, chosen, correct, category, hand: d.hand, dealer: d.dealer, tc, responseTimeMs: duration, attempt: q + 1, streak: nextStreak, isDeviation: departureApplies });
      if (q === 9) {
        finalArgs.current = [10, nextCorrect, totalMs + duration, nextBest, nextMistakes, nextCategories];
        setAwaitingFinal(true);
      } else {
        setQ((current) => current + 1);
        setStarted(Date.now());
      }
    },
    [awaitingFinal, best, categories, correct, correctCount, d, dealerCard.rank, departureApplies, mistakes, playerCards, q, session, settings.sound, started, streak, tc, totalMs, transition],
  );
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat || !settings.shortcuts || session || awaitingFinal) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, DeviationAction> = {
        h: "H",
        s: "S",
        d: "D",
        p: "P",
        r: "R",
        i: "I",
        n: "N",
      };
      const action = map[event.key.toLowerCase()];
      if (action && availableActions.includes(action)) chooseDeviation(action);
    };
    addEventListener("keydown", handleKey);
    return () => removeEventListener("keydown", handleKey);
  }, [availableActions, awaitingFinal, chooseDeviation, session, settings.shortcuts]);
  if (session) {
    return (
      <SessionSummary
        session={session}
        onNew={() => {
          setQ(0);
          setCorrectCount(0);
          setStreak(0);
          setBest(0);
          setTotalMs(0);
          setMistakes([]);
          setCategories({});
          setFeedback(undefined);
          setSession(undefined);
          setAwaitingFinal(false);
          setStarted(Date.now());
          track("drill_started", { drill: "Deviations", questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings, surrenderRule), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: surrenderRule });
        }}
      />
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <Title
          eyebrow={`Index play ${q + 1}`}
          title="Hi-Lo Deviations"
          description="Decide whether the current true count activates the index play."
        />
        <div className="flex flex-wrap items-end gap-2">
          <div className="max-w-xs">
            <SurrenderRuleSelect value={surrenderRule} />
          </div>
          <Link
            href="/reference/deviations"
            className="pressable inline-flex min-h-11 items-center rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-2.5 font-medium text-[var(--ink)] shadow-sm outline-none transition-colors hover:bg-[var(--paper)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            View deviation reference
          </Link>
          <GhostButton onClick={endDrill}>End drill</GhostButton>
        </div>
      </div>
      {awaitingFinal ? (
        <Panel className="pb-24 lg:pb-6">
          <p className="text-sm text-zinc-400">That was the last hand in this session.</p>
          <Button className="mt-4" onClick={() => finalArgs.current && finish(...finalArgs.current)}>View results</Button>
        </Panel>
      ) : (
        <>
          <Panel className="pb-24 lg:pb-6">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
              <div className="text-center">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-zinc-500">
                  Player
                </p>
                <div className="flex justify-center gap-3">
                  {playerCards.map((card, index) => (
                    <PlayingCard key={`${card.rank}-${index}`} card={card} size="sm" />
                  ))}
                </div>
              </div>
              <div className="text-center text-xs font-bold uppercase tracking-[.18em] text-zinc-600">
                versus
              </div>
              <div className="text-center">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-zinc-500">
                  Dealer
                </p>
                <div className="flex justify-center">
                  <PlayingCard card={dealerCard} size="sm" />
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4">
              {[
                ["Running count", signed(rc)],
                ["Decks remaining", "3"],
                ["True count", signed(tc)],
              ].map(([a, b]) => (
                <div key={a} className="min-w-0 rounded-xl bg-black/20 p-2.5 sm:p-4">
                  <p className="text-xs text-zinc-500">{a}</p>
                  <b className="text-xl sm:text-2xl">{b}</b>
                </div>
              ))}
            </div>
            {askingSurrender && (
              <p className="mt-5 text-sm font-medium text-[var(--ink)]">Surrender this hand at this count, or decline and play it out?</p>
            )}
            <div className="mt-6 hidden flex-wrap gap-2 lg:flex">
              {availableActions.map((a) => {
                const label = deviationAnswerName(a, askingSurrender);
                return (
                  <GhostButton key={a} onClick={() => chooseDeviation(a)}>
                    <u>{label[0]}</u>{label.slice(1)}
                  </GhostButton>
                );
              })}
            </div>
          </Panel>
          <MobileActionDock label="Deviation actions">
            <div className="grid grid-cols-2 gap-2">
              {availableActions.map((a) => <GhostButton key={a} onClick={() => chooseDeviation(a)}>{deviationAnswerName(a, askingSurrender)}</GhostButton>)}
            </div>
          </MobileActionDock>
        </>
      )}
      {feedback && (
        <div aria-live="polite" className={`mt-4 rounded-xl border p-4 ${feedback.chosen === feedback.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-zinc-500">Previous hand · {feedback.hand} · TC {signed(feedback.tc)}</p>
          <b className={feedback.chosen === feedback.correct ? "text-emerald-300" : "text-red-300"}>
            {feedback.chosen === feedback.correct ? `Correct — ${deviationAnswerName(feedback.correct, feedback.askingSurrender)}` : `You chose ${deviationAnswerName(feedback.chosen, feedback.askingSurrender)} · Correct: ${deviationAnswerName(feedback.correct, feedback.askingSurrender)}`}
          </b>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300">
            <span>Basic strategy: {DEVIATION_ACTION_NAMES[feedback.normalAction]}</span>
            <span>Index: {feedback.always ? "Always" : signed(feedback.index)}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {feedback.sentence} {feedback.departureTriggered ? "The previous count triggered the departure." : "The previous count stayed at the chart baseline."}
          </p>
        </div>
      )}
    </>
  );
}
