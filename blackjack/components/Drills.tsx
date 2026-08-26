/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  RANKS,
  SUITS,
  Action,
} from "@/lib/blackjack/types";
import { signed } from "@/lib/blackjack/hiLo";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import {
  DEVIATION_ACTION_NAMES,
  DeviationAction,
  deviationHandRanks,
  deviationTrainingRows,
} from "@/lib/blackjack/deviations";
import { H17_PRO_DEVIATIONS } from "@/lib/blackjack/h17Pro";
import { S17_PRO_DEVIATIONS } from "@/lib/blackjack/s17Pro";
import {
  DEFAULT_SETTINGS,
  makeSession,
  Mistake,
  Session,
  Settings,
  storage,
  DrillType,
} from "@/lib/statistics/storage";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, MobileActionDock, Panel, Select } from "./ui";
import { SessionSummary } from "./SessionSummary";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { consumePracticeFocus, dueItemKeys, forceDue, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { track } from "@/lib/analytics/track";
const names: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};
const analyticsRulesPreset = (settings: Settings) => `${settings.decks}d_${settings.dealerHitsSoft17 ? "h17" : "s17"}_${settings.doubleAfterSplit ? "das" : "ndas"}_${settings.resplitAces ? "rsa" : "nrsa"}_${settings.lateSurrender ? "ls" : "nls"}`;
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
  lateSurrender: settings.lateSurrender,
  doubleRule: "any" as const,
});

const randomCard = (): Card => ({
  rank: RANKS[Math.floor(Math.random() * RANKS.length)],
  suit: SUITS[Math.floor(Math.random() * SUITS.length)],
});
const strategyHardHands: Array<[Card["rank"], Card["rank"]]> = [
  ["2", "3"],
  ["3", "4"],
  ["4", "5"],
  ["4", "6"],
  ["5", "6"],
  ["5", "7"],
  ["6", "7"],
  ["6", "8"],
  ["7", "8"],
  ["6", "10"],
  ["7", "10"],
  ["8", "10"],
  ["9", "10"],
  ["10", "K"],
];
type StrategyCategory = "Hard totals" | "Soft totals" | "Pairs" | "Surrender";
function randomStrategyQuestion(preferred?: StrategyCategory) {
  const category = preferred ?? (["Pairs", "Soft totals", "Hard totals"] as StrategyCategory[])[Math.floor(Math.random() * 3)];
  let player: Card[];
  if (category === "Surrender") {
    player = Math.random() < 0.5
      ? [{ rank: "10", suit: "spades" }, { rank: "6", suit: "hearts" }]
      : [{ rank: "10", suit: "spades" }, { rank: "5", suit: "hearts" }];
  } else if (category === "Pairs") {
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    player = [
      { rank, suit: "spades" },
      { rank, suit: "hearts" },
    ];
  } else if (category === "Soft totals") {
    const softRanks: Card["rank"][] = ["2", "3", "4", "5", "6", "7", "8", "9"];
    const rank = softRanks[Math.floor(Math.random() * softRanks.length)];
    player = [
      { rank: "A", suit: "spades" },
      { rank, suit: "hearts" },
    ];
  } else {
    const [first, second] =
      strategyHardHands[Math.floor(Math.random() * strategyHardHands.length)];
    player = [
      { rank: first, suit: "spades" },
      { rank: second, suit: "hearts" },
    ];
  }
  const dealer = category === "Surrender"
    ? { rank: (["9", "10", "A"] as Card["rank"][])[Math.floor(Math.random() * 3)], suit: "diamonds" as const }
    : randomCard();
  return { player, dealer };
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
      chosen: Action;
      correct: Action;
      explanation: string;
      category: StrategyCategory;
    }>();
  const finalArgs = useRef<Parameters<typeof finish> | null>(null);
  useEffect(() => {
    track("drill_started", { drill: "Basic Strategy", mode, questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: settings.lateSurrender ? "late" : "none" });
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
  const data = useMemo(
    () => randomStrategyQuestion(weakest && Math.random() < 0.65 ? weakest : undefined),
    [q, weakest],
  );
  const rules = rulesFromSettings(settings);
  const decision = getBasicStrategyDecision({
    playerCards: data.player,
    dealerUpcard: data.dealer,
    rules,
  });
  const category: StrategyCategory = decision.action === "R"
    ? "Surrender"
    : data.player[0].rank === data.player[1].rank
      ? "Pairs"
      : data.player.some((card) => card.rank === "A")
        ? "Soft totals"
        : "Hard totals";
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
    (a: Action) => {
      if (session || awaitingFinal) return;
      const ok = a === decision.action;
      const duration = Date.now() - started;
      const nextCorrect = correctCount + (ok ? 1 : 0);
      const nextStreak = ok ? streak + 1 : 0;
      const nextBest = Math.max(best, nextStreak);
      const nextMistakes = ok
        ? mistakes
        : [...mistakes, {
            question: `${data.player.map((card) => card.rank).join(",")} vs ${data.dealer.rank}`,
            userAnswer: names[a],
            correctAnswer: names[decision.action],
            explanation: decision.explanation,
          }];
      const nextCategories = {
        ...categories,
        [category]: {
          correct: (categories[category]?.correct ?? 0) + (ok ? 1 : 0),
          total: (categories[category]?.total ?? 0) + 1,
        },
      };
      setFeedback({
        hand: `${data.player.map((card) => card.rank).join(", ")} vs ${data.dealer.rank}`,
        chosen: a,
        correct: decision.action,
        explanation: decision.explanation,
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
      track("basic_strategy_answered", { ok, chosen: a, correct: decision.action, category, mode, scenario: `${data.player.map((card) => card.rank).sort().join("")}_v_${data.dealer.rank}`, responseTimeMs: duration, attempt: q + 1, streak: nextStreak });
      if (q === 9) {
        finalArgs.current = [10, nextCorrect, totalMs + duration, nextBest, nextMistakes, nextCategories];
        setAwaitingFinal(true);
      } else {
        setQ((current) => current + 1);
        setStarted(Date.now());
      }
    },
    [awaitingFinal, best, categories, category, correctCount, data, decision, mistakes, q, session, settings.sound, started, streak, totalMs],
  );
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.repeat || !settings.shortcuts || session || awaitingFinal) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, Action> = {
        h: "H",
        s: "S",
        d: "D",
        p: "P",
        r: "R",
      };
      if (map[e.key.toLowerCase()]) choose(map[e.key.toLowerCase()]);
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
          track("drill_started", { drill: "Basic Strategy", mode, questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: settings.lateSurrender ? "late" : "none" });
        }}
      />
    );
  }
  return (
    <>
      <Title
        eyebrow={`Hand ${q + 1}`}
        title="Basic Strategy"
        description={`${rules.decks}-deck, ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "no DAS"}, ${rules.lateSurrender ? "late surrender" : "no surrender"}.`}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xs">
          <Select label="Practice mode" value={mode} onChange={(event) => { const next = event.target.value as "standard" | "adaptive"; track("practice_mode_changed", { drill: "Basic Strategy", from: mode, to: next }); setMode(next); }}>
            <option value="standard">Balanced</option>
            <option value="adaptive">Adaptive to weak categories</option>
          </Select>
        </div>
        <GhostButton onClick={endDrill}>End drill</GhostButton>
      </div>
      {feedback && (
        <div aria-live="polite" className={`mb-4 rounded-xl border p-4 ${feedback.chosen === feedback.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-zinc-500">Previous hand · {feedback.hand}</p>
          <b className={feedback.chosen === feedback.correct ? "text-emerald-300" : "text-red-300"}>
            {feedback.chosen === feedback.correct ? `Correct — ${names[feedback.correct]}` : `You chose ${names[feedback.chosen]} · Correct: ${names[feedback.correct]}`}
          </b>
          <p className="mt-1 text-sm text-zinc-300">{feedback.explanation}</p>
          <p className="mt-2 text-xs text-zinc-500">Category: {feedback.category}</p>
        </div>
      )}
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
            <div className="hidden flex-wrap gap-2 lg:flex">
              {(Object.keys(names) as Action[]).map((a) => (
                <GhostButton
                  key={a}
                  aria-keyshortcuts={a}
                  className="flex items-center gap-2"
                  onClick={() => choose(a)}
                >
                  <span>{names[a]}</span>
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
              {(Object.keys(names) as Action[]).map((a) => <GhostButton key={a} className="px-2 text-sm" onClick={() => choose(a)}>{names[a]}</GhostButton>)}
            </div>
          </MobileActionDock>
        </>
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
      deviationAction: DeviationAction;
      index: number;
      tc: number;
      direction?: "atOrAbove" | "atOrBelow";
      always?: true;
      departureTriggered: boolean;
    }>();
  const finalArgs = useRef<Parameters<typeof finish> | null>(null);
  useEffect(() => {
    track("drill_started", { drill: "Deviations", questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: settings.lateSurrender ? "late" : "none" });
  }, []);
  const catalog = settings.dealerHitsSoft17 ? H17_PRO_DEVIATIONS : S17_PRO_DEVIATIONS;
  const trainingRows = useMemo(
    () => deviationTrainingRows(settings, settings.decks, catalog),
    [catalog, settings.dealerHitsSoft17, settings.decks, settings.lateSurrender],
  );
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
    availableActions = useMemo<DeviationAction[]>(
      () => d.hand === "Insurance" ? ["I", "N"] : ["H", "S", "D", "P", "R"],
      [d.hand],
    );
  const departureApplies = d.always === true
      || (transition.atOrBelow ? tc <= d.index : tc >= d.index),
    correct = departureApplies ? transition.departure : transition.baseline;
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
            userAnswer: DEVIATION_ACTION_NAMES[chosen],
            correctAnswer: DEVIATION_ACTION_NAMES[correct],
            explanation: d.always
              ? `${DEVIATION_ACTION_NAMES[transition.departure]} is the chart's standing play.`
              : `${DEVIATION_ACTION_NAMES[transition.departure]} at TC ${signed(d.index)} ${transition.atOrBelow ? "or lower" : "or higher"}; at this count the chart calls for ${DEVIATION_ACTION_NAMES[correct].toLowerCase()}.`,
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
        deviationAction: transition.departure,
        index: d.index,
        tc,
        direction: transition.atOrBelow ? "atOrBelow" : "atOrAbove",
        always: d.always,
        departureTriggered: departureApplies,
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
          track("drill_started", { drill: "Deviations", questionTarget: 10, decks: settings.decks, rulesPreset: analyticsRulesPreset(settings), dealerRule: settings.dealerHitsSoft17 ? "H17" : "S17", das: settings.doubleAfterSplit, rsa: settings.resplitAces, surrender: settings.lateSurrender ? "late" : "none" });
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
        <GhostButton onClick={endDrill}>End drill</GhostButton>
      </div>
      {feedback && (
        <div aria-live="polite" className={`mb-4 rounded-xl border p-4 ${feedback.chosen === feedback.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-zinc-500">Previous hand · {feedback.hand} · TC {signed(feedback.tc)}</p>
          <b className={feedback.chosen === feedback.correct ? "text-emerald-300" : "text-red-300"}>
            {feedback.chosen === feedback.correct ? `Correct — ${DEVIATION_ACTION_NAMES[feedback.correct]}` : `You chose ${DEVIATION_ACTION_NAMES[feedback.chosen]} · Correct: ${DEVIATION_ACTION_NAMES[feedback.correct]}`}
          </b>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300">
            <span>Basic strategy: {DEVIATION_ACTION_NAMES[feedback.normalAction]}</span>
            <span>Index: {feedback.always ? "Always" : signed(feedback.index)}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {feedback.always
              ? `${DEVIATION_ACTION_NAMES[feedback.deviationAction]} is the chart's standing play.`
              : `${DEVIATION_ACTION_NAMES[feedback.deviationAction]} at TC ${signed(feedback.index)} ${feedback.direction === "atOrBelow" ? "or lower" : "or higher"}; the previous count ${feedback.departureTriggered ? "triggered the departure" : `used the chart baseline of ${DEVIATION_ACTION_NAMES[feedback.normalAction].toLowerCase()}`}.`}
          </p>
        </div>
      )}
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
            <div className="mt-6 hidden flex-wrap gap-2 lg:flex">
              {availableActions.map((a) => (
                <GhostButton key={a} onClick={() => chooseDeviation(a)}>
                  {a === "I" ? (
                    <><u>I</u>nsurance</>
                  ) : a === "N" ? (
                    <><u>N</u>o insurance</>
                  ) : (
                    <><u>{DEVIATION_ACTION_NAMES[a][0]}</u>{DEVIATION_ACTION_NAMES[a].slice(1)}</>
                  )}
                </GhostButton>
              ))}
            </div>
          </Panel>
          <MobileActionDock label="Deviation actions">
            <div className="grid grid-cols-2 gap-2">
              {availableActions.map((a) => <GhostButton key={a} onClick={() => chooseDeviation(a)}>{a === "I" ? "Insurance" : a === "N" ? "No insurance" : DEVIATION_ACTION_NAMES[a]}</GhostButton>)}
            </div>
          </MobileActionDock>
        </>
      )}
    </>
  );
}
