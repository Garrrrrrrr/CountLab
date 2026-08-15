/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-unused-expressions */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import {
  Card,
  RANKS,
  SUITS,
  Action,
} from "@/lib/blackjack/types";
import { runningCount, signed, trueCount } from "@/lib/blackjack/hiLo";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import {
  DEVIATIONS,
  DEVIATION_ACTION_NAMES,
  DeviationAction,
  deviationDecision,
} from "@/lib/blackjack/deviations";
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
import { Button, GhostButton, Panel, Select } from "./ui";
import { SessionSummary } from "./SessionSummary";
import { FullShoeGame } from "./FullShoeGame";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { track } from "@/lib/analytics/track";
const names: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};
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
    <div className="mb-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-2xl text-zinc-400">{description}</p>
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
export function RunningCountDrill() {
  const [decks, setDecks] = useState(1),
    [amount, setAmount] = useState(20),
    [speed, setSpeed] = useState(750),
    [group, setGroup] = useState(1),
    [cards, setCards] = useState<Card[]>([]),
    [shown, setShown] = useState(0),
    [phase, setPhase] = useState<"setup" | "show" | "answer" | "result">(
      "setup",
    ),
    [answer, setAnswer] = useState(""),
    [start, setStart] = useState(0),
    [elapsed, setElapsed] = useState(0);
  const settings = useSavedSettings();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "setup") {
      setDecks(settings.decks);
      setSpeed(settings.speed);
    }
  }, [settings.decks, settings.speed, phase]);
  const begin = () => {
    const shoe = new BlackjackShoe(decks),
      arr: Card[] = [];
    for (let i = 0; i < amount; i++) {
      const c = shoe.deal();
      if (c) arr.push(c);
    }
    setCards(arr);
    setShown(0);
    setAnswer("");
    setPhase("show");
  };
  useEffect(() => {
    if (phase !== "show") return;
    if (shown >= cards.length) {
      setPhase("answer");
      setStart(Date.now());
      setTimeout(() => input.current?.focus(), 20);
      return;
    }
    if (speed === 0) return;
    const t = setTimeout(
      () => setShown(Math.min(cards.length, shown + group)),
      speed,
    );
    return () => clearTimeout(t);
  }, [phase, shown, cards.length, speed, group]);
  useEffect(() => {
    if (phase !== "show" || speed !== 0 || !settings.shortcuts) return;
    const advance = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setShown((value) => Math.min(cards.length, value + group));
      }
    };
    addEventListener("keydown", advance);
    return () => removeEventListener("keydown", advance);
  }, [cards.length, group, phase, settings.shortcuts, speed]);
  const submit = () => {
    if (answer === "" || phase !== "answer") return;
    const duration = Date.now() - start;
    const ok = +answer === runningCount(cards);
    setElapsed(duration);
    setPhase("result");
    feedbackTone(ok, settings.sound);
    record(
      "Running Count",
      1,
      ok ? 1 : 0,
      duration,
      ok ? 1 : 0,
      ok
        ? []
        : [{
            question: `${cards.length} cards from a ${decks}-deck shoe`,
            userAnswer: signed(+answer),
            correctAnswer: signed(runningCount(cards)),
            explanation: "Add +1 for 2 through 6, 0 for 7 through 9, and -1 for ten through Ace.",
          }],
      { [`${cards.length} cards`]: { correct: ok ? 1 : 0, total: 1 } },
    );
  };
  const correct = runningCount(cards),
    progress = cards.reduce<number[]>(
      (a, c) => [...a, (a.at(-1) || 0) + runningCount([c])],
      [0],
    );
  if (phase === "setup")
    return (
      <>
        <Title
          eyebrow="Speed & accuracy"
          title="Running Count"
          description="Count a composition-accurate shoe as cards flash on screen."
        />
        <Panel className="max-w-3xl">
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              label="Decks"
              value={decks}
              onChange={(e) => setDecks(+e.target.value)}
            >
              {[1, 2, 4, 6, 8].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Cards"
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
            >
              {[10, 20, 30, 52].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Speed"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            >
              {[2000, 1500, 1000, 750, 500, 300, 0].map((x) => (
                <option key={x} value={x}>
                  {x ? `${x} ms` : "Manual"}
                </option>
              ))}
            </Select>
            <Select
              label="At once"
              value={group}
              onChange={(e) => setGroup(+e.target.value)}
            >
              {[1, 2, 3, 4].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <Button className="mt-6" onClick={begin}>
            Start drill
          </Button>
        </Panel>
      </>
    );
  return (
    <>
      <Title
        eyebrow={`${Math.min(shown, cards.length)} / ${cards.length}`}
        title="Running Count"
        description={
          phase === "show"
            ? "Keep the count mentally. The cards will not return."
            : "Enter the final running count."
        }
      />
      <Panel className="min-h-[380px]">
        <div className="flex min-h-56 items-center justify-center gap-4">
          {phase === "show" &&
            cards
              .slice(shown, shown + group)
              .map((c, i) => (
                <PlayingCard key={`${shown}-${i}`} card={c} animated={settings.animations} />
              ))}
          {phase === "answer" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="text-center"
            >
              <p className="mb-4 text-xl">What is the running count?</p>
              <input
                ref={input}
                aria-label="Final running count"
                type="number"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-48 rounded-xl border border-white/15 bg-black/20 p-4 text-center text-3xl outline-none focus:border-emerald-400"
              />
              <Button className="ml-3" type="submit">
                Submit
              </Button>
            </form>
          )}
          {phase === "result" && (
            <div className="text-center">
              <p
                className={`text-sm font-bold uppercase ${+answer === correct ? "text-emerald-400" : "text-red-400"}`}
              >
                {+answer === correct ? "Correct" : "Not quite"}
              </p>
              <p className="mt-3 text-5xl font-semibold">{signed(correct)}</p>
              <p className="mt-2 text-zinc-400">
                Your answer: {signed(+answer)} · {(elapsed / 1000).toFixed(1)}s
              </p>
            </div>
          )}
        </div>
        {phase === "show" && speed === 0 && (
          <div className="text-center">
            <Button
              onClick={() => setShown(Math.min(cards.length, shown + group))}
            >
              Next cards <kbd>Space</kbd>
            </Button>
          </div>
        )}
        {phase === "result" && (
          <>
            <div className="mt-5 overflow-x-auto rounded-xl bg-black/20 p-4 font-mono text-sm text-zinc-400">
              {progress.map(signed).join(" → ")}
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={begin}>Next round</Button>
              <GhostButton
                onClick={() => {
                  setShown(0);
                  setPhase("show");
                }}
              >
                Retry
              </GhostButton>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

export function TrueCountDrill() {
  const settings = useSavedSettings();
  const [range, setRange] = useState(20),
    [increment, setIncrement] = useState(0.5),
    [q, setQ] = useState(0),
    [correct, setCorrect] = useState(0),
    [streak, setStreak] = useState(0),
    [best, setBest] = useState(0),
    [total, setTotal] = useState(0),
    [mistakes, setMistakes] = useState<Mistake[]>([]),
    [session, setSession] = useState<Session>(),
    [answer, setAnswer] = useState(""),
    [result, setResult] = useState<string>(),
    [started, setStarted] = useState(Date.now());
  const next = useCallback(() => {
    setQ((x) => x + 1);
    setAnswer("");
    setResult(undefined);
    setStarted(Date.now());
  }, []);
  const question = useMemo(
    () => ({
      rc: Math.floor(Math.random() * (range * 2 + 1)) - range || 7,
      decks: Math.max(
        increment,
        Math.round((Math.random() * 5.5 + 0.5) / increment) * increment,
      ),
    }),
    [q, range, increment],
  );
  const submit = () => {
    const expected = trueCount(
        question.rc,
        question.decks,
        storage.settings().rounding,
      ),
      ok = +answer === expected,
      ms = Date.now() - started,
      newCorrect = correct + (ok ? 1 : 0),
      newStreak = ok ? streak + 1 : 0,
      newBest = Math.max(best, newStreak),
      newMistakes = ok
        ? mistakes
        : [
            ...mistakes,
            {
              question: `RC ${signed(question.rc)} / ${question.decks} decks`,
              userAnswer: answer,
              correctAnswer: signed(expected),
              explanation: `${question.rc} ÷ ${question.decks}, using ${storage.settings().rounding} rounding.`,
            },
          ];
    setCorrect(newCorrect);
    setStreak(newStreak);
    setBest(newBest);
    setTotal(total + ms);
    setMistakes(newMistakes);
    setResult(ok ? "Correct" : `Correct answer: ${signed(expected)}`);
    feedbackTone(ok, settings.sound);
    if (q === 9)
      setSession(
        record("True Count", 10, newCorrect, total + ms, newBest, newMistakes),
      );
  };
  if (session)
    return (
      <SessionSummary
        session={session}
        onNew={() => {
          setSession(undefined);
          setQ(0);
          setCorrect(0);
          setStreak(0);
          setBest(0);
          setMistakes([]);
          setTotal(0);
          setResult(undefined);
        }}
      />
    );
  return (
    <>
      <Title
        eyebrow={`Question ${q + 1} / 10 · ${q ? Math.round((correct / q) * 100) : 100}% live`}
        title="True Count"
        description="Convert running count to true count using estimated decks remaining."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="grid min-h-64 place-items-center text-center">
            <div>
              <p className="text-zinc-500">Running count</p>
              <p className="text-6xl font-semibold">{signed(question.rc)}</p>
              <p className="mt-5 text-zinc-500">Decks remaining</p>
              <p className="text-3xl">{question.decks}</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              result ? q < 9 && next() : submit();
            }}
            className="flex justify-center gap-3"
          >
            <input
              autoFocus
              aria-label="True count answer"
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-36 rounded-lg bg-black/25 px-4 text-center text-xl outline-none ring-1 ring-white/10"
            />
            <Button>{result ? (q < 9 ? "Next" : "Finish") : "Submit"}</Button>
          </form>
          {result && (
            <p
              aria-live="polite"
              className={`mt-4 text-center ${result === "Correct" ? "text-emerald-400" : "text-red-400"}`}
            >
              {result}
            </p>
          )}
        </Panel>
        <Panel>
          <Select
            label="RC range"
            value={range}
            onChange={(e) => setRange(+e.target.value)}
          >
            {[10, 20, 30].map((x) => (
              <option key={x} value={x}>
                ±{x}
              </option>
            ))}
          </Select>
          <div className="mt-4">
            <Select
              label="Deck increments"
              value={increment}
              onChange={(e) => setIncrement(+e.target.value)}
            >
              <option value={1}>Whole decks</option>
              <option value={0.5}>Half decks</option>
              <option value={0.25}>Quarter decks</option>
            </Select>
          </div>
        </Panel>
      </div>
    </>
  );
}

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
  const [q, setQ] = useState(saved?.q ?? 0),
    [mode, setMode] = useState<"standard" | "adaptive">(saved?.mode ?? "standard"),
    [correctCount, setCorrectCount] = useState(saved?.correctCount ?? 0),
    [streak, setStreak] = useState(saved?.streak ?? 0),
    [best, setBest] = useState(saved?.best ?? 0),
    [totalMs, setTotalMs] = useState(saved?.totalMs ?? 0),
    [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []),
    [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}),
    [started, setStarted] = useState(Date.now()),
    [session, setSession] = useState<Session>(),
    [feedback, setFeedback] = useState<{
      hand: string;
      chosen: Action;
      correct: Action;
      explanation: string;
      category: StrategyCategory;
    }>();
  const weakest = useMemo<StrategyCategory | undefined>(() => {
    if (mode !== "adaptive") return undefined;
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
  const endDrill = () => finish();
  const choose = useCallback(
    (a: Action) => {
      if (session) return;
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
      feedbackTone(ok, settings.sound);
      track("basic_strategy_answered", { ok, chosen: a, correct: decision.action, category, mode });
      if (q === 9) {
        finish(10, nextCorrect, totalMs + duration, nextBest, nextMistakes, nextCategories);
      } else {
        setQ((current) => current + 1);
        setStarted(Date.now());
      }
    },
    [best, categories, category, correctCount, data, decision, mistakes, q, session, settings.sound, started, streak, totalMs],
  );
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.repeat || !settings.shortcuts || session) return;
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
  }, [choose, session, settings.shortcuts]);
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
          setStarted(Date.now());
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
          <Select label="Practice mode" value={mode} onChange={(event) => setMode(event.target.value as "standard" | "adaptive")}>
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
      <Panel>
        <div className="grid gap-10 py-6 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm text-zinc-500">Player hand</p>
            <div className="flex gap-3">
              {data.player.map((c, i) => (
              <PlayingCard key={i} card={c} animated={settings.animations} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-4 text-sm text-zinc-500">Dealer upcard</p>
            <PlayingCard card={data.dealer} animated={settings.animations} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
    [feedback, setFeedback] = useState<{
      hand: string;
      chosen: DeviationAction;
      correct: DeviationAction;
      normalAction: DeviationAction;
      deviationAction: DeviationAction;
      index: number;
      tc: number;
      direction?: "atOrAbove" | "atOrBelow";
    }>();
  const d = useMemo(
    () => DEVIATIONS[Math.floor(Math.random() * DEVIATIONS.length)],
    [q],
  );
  const tc = useMemo(() => Math.floor(Math.random() * 12) - 4, [q]),
    rc = tc * 3,
    correct = deviationDecision(d, tc);
  const playerCards = useMemo(() => {
      const hands: Record<string, [Card["rank"], Card["rank"]]> = {
        Insurance: ["10", "6"],
        "16": ["10", "6"],
        "15": ["10", "5"],
        "13": ["10", "3"],
        "12": ["10", "2"],
        "11": ["6", "5"],
        "10": ["6", "4"],
        "9": ["5", "4"],
      };
      const ranks = hands[d.hand] ?? ["10", "6"];
      return [
        { rank: ranks[0], suit: "spades" },
        { rank: ranks[1], suit: "hearts" },
      ] satisfies Card[];
    }, [d]),
    dealerCard = useMemo(
      () => ({ rank: d.dealer as Card["rank"], suit: "diamonds" }) satisfies Card,
      [d],
    ),
    availableActions = useMemo<DeviationAction[]>(
      () => (d.hand === "Insurance" ? ["I", "N"] : ["H", "S", "D", "P", "R"]),
      [d.hand],
    );
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
  const endDrill = () => finish();
  const chooseDeviation = useCallback(
    (chosen: DeviationAction) => {
      if (session) return;
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
            explanation: `${DEVIATION_ACTION_NAMES[d.deviationAction]} at ${signed(d.index)} ${d.direction === "atOrBelow" ? "or lower" : "or higher"}.`,
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
        normalAction: d.normalAction,
        deviationAction: d.deviationAction,
        index: d.index,
        tc,
        direction: d.direction,
      });
      setCorrectCount(nextCorrect);
      setStreak(nextStreak);
      setBest(nextBest);
      setTotalMs((value) => value + duration);
      setMistakes(nextMistakes);
      setCategories(nextCategories);
      feedbackTone(ok, settings.sound);
      track("deviation_answered", { ok, chosen, correct, category, hand: d.hand, dealer: d.dealer, tc });
      if (q === 9) {
        finish(10, nextCorrect, totalMs + duration, nextBest, nextMistakes, nextCategories);
      } else {
        setQ((current) => current + 1);
        setStarted(Date.now());
      }
    },
    [best, categories, correct, correctCount, d, dealerCard.rank, mistakes, playerCards, q, session, settings.sound, started, streak, tc, totalMs],
  );
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat || !settings.shortcuts || session) return;
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
  }, [availableActions, chooseDeviation, session, settings.shortcuts]);
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
          setStarted(Date.now());
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
            <span>Index: {signed(feedback.index)}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {DEVIATION_ACTION_NAMES[feedback.deviationAction]} at TC {signed(feedback.index)} {feedback.direction === "atOrBelow" ? "or lower" : "or higher"}; the previous count {feedback.correct === feedback.deviationAction ? "triggered" : "did not trigger"} the deviation.
          </p>
        </div>
      )}
      <Panel>
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
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
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Running count", signed(rc)],
            ["Decks remaining", "3"],
            ["True count", signed(tc)],
          ].map(([a, b]) => (
            <div key={a} className="rounded-xl bg-black/20 p-4">
              <p className="text-xs text-zinc-500">{a}</p>
              <b className="text-2xl">{b}</b>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
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
    </>
  );
}

export function DeckEstimationDrill() {
  const settings = useSavedSettings();
  const [level, setLevel] = useState("intermediate"),
    [q, setQ] = useState(0),
    [answer, setAnswer] = useState(3),
    [result, setResult] = useState<string>(),
    [started, setStarted] = useState(Date.now());
  const actual = useMemo(
    () => Math.round((Math.random() * 5.5 + 0.5) * 4) / 4,
    [q],
  );
  const percent = (actual / 6) * 100;
  const submit = () => {
    const error = Math.round((answer - actual) * 100) / 100;
    const tolerance = level === "beginner" ? 0.5 : level === "intermediate" ? 0.25 : 0.1;
    const ok = Math.abs(error) <= tolerance;
    const duration = Date.now() - started;
    setResult(`Actual: ${actual} decks · Error: ${signed(error)} decks · ${ok ? "Within target" : "Outside target"}`);
    feedbackTone(ok, settings.sound);
    record(
      "Deck Estimation",
      1,
      ok ? 1 : 0,
      duration,
      ok ? 1 : 0,
      ok ? [] : [{ question: `${level} discard-tray estimate`, userAnswer: `${answer} decks`, correctAnswer: `${actual} decks`, explanation: `Target tolerance: ±${tolerance} decks.` }],
      { [level]: { correct: ok ? 1 : 0, total: 1 } },
    );
  };
  return (
    <>
      <Title
        eyebrow="Visual estimation"
        title="Deck Estimation"
        description="Estimate the cards remaining from the discard-tray silhouette."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Panel>
          <div className="mx-auto flex h-80 max-w-md items-end rounded-b-3xl border-x-8 border-b-8 border-zinc-600 bg-black/30 p-4">
            <div
              className="w-full rounded-lg bg-[repeating-linear-gradient(0deg,#eee,#eee_2px,#bbb_3px)] shadow-xl"
              style={{ height: `${percent}%` }}
            />
          </div>
          <div className="mx-auto mt-6 max-w-md">
            <input
              aria-label="Deck estimate"
              type="range"
              min=".25"
              max="6"
              step={
                level === "beginner"
                  ? 0.5
                  : level === "intermediate"
                    ? 0.25
                    : 0.05
              }
              value={answer}
              onChange={(e) => setAnswer(+e.target.value)}
              className="w-full accent-emerald-400"
            />
            <div className="mt-2 flex items-center justify-between">
              <b>{answer} decks</b>
              <Button disabled={Boolean(result)} onClick={submit}>
                Submit
              </Button>
            </div>
            {result && (
              <div aria-live="polite" className="mt-4 rounded-xl bg-black/20 p-4">
                {result}
                <Button
                  className="ml-4"
                  onClick={() => {
                    setQ((x) => x + 1);
                    setResult(undefined);
                    setStarted(Date.now());
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </Panel>
        <Panel>
          <Select
            label="Difficulty"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="beginner">Beginner · 0.5</option>
            <option value="intermediate">Intermediate · 0.25</option>
            <option value="advanced">Advanced · free</option>
          </Select>
        </Panel>
      </div>
    </>
  );
}

export function FullShoeDrill() {
  return <FullShoeGame />;
  /* const settings = useSavedSettings();
  const [decks, setDecks] = useState(settings.decks),
    [players, setPlayers] = useState(2),
    [shoe, setShoe] = useState(() => new BlackjackShoe(settings.decks)),
    [round, setRound] = useState(0),
    [table, setTable] = useState<Card[][]>([]),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState<string>(),
    [visibleCount, setVisibleCount] = useState(0),
    [revealed, setRevealed] = useState(false),
    [started, setStarted] = useState(Date.now());
  const reset = () => {
    setShoe(new BlackjackShoe(decks));
    setRound(0);
    setTable([]);
    setFeedback(undefined);
    setVisibleCount(0);
    setRevealed(false);
    setStarted(Date.now());
  };
  useEffect(() => {
    if (round === 0) setDecks(settings.decks);
  }, [settings.decks]);
  useEffect(reset, [decks, players]);
  const deal = () => {
    if (shoe.cardsRemaining() < (players + 1) * 2) return;
    const hands = Array.from({ length: players + 1 }, () => [] as Card[]);
    for (let pass = 0; pass < 2; pass++)
      for (const hand of hands) {
        const c = shoe.deal();
        if (c) hand.push(c);
      }
    const exposed = [hands[0][0], ...hands.slice(1).flat()].filter(Boolean);
    setVisibleCount((count) => count + runningCount(exposed));
    setTable(hands);
    setRound((r) => r + 1);
    setFeedback(undefined);
    setAnswer("");
    setRevealed(false);
    setStarted(Date.now());
  };
  const submit = () => {
    if (answer === "" || feedback) return;
    const expected = visibleCount;
    const ok = +answer === expected;
    const duration = Date.now() - started;
    const holeValue = table[0]?.[1] ? runningCount([table[0][1]]) : 0;
    setFeedback(ok ? "Correct" : `Correct visible count: ${signed(expected)}`);
    setVisibleCount((count) => count + holeValue);
    setRevealed(true);
    feedbackTone(ok, settings.sound);
    record(
      "Full Shoe",
      1,
      ok ? 1 : 0,
      duration,
      ok ? 1 : 0,
      ok ? [] : [{ question: `Round ${round} visible running count`, userAnswer: signed(+answer), correctAnswer: signed(expected), explanation: "Count only exposed cards. Add the dealer hole card after it is revealed." }],
      { "Round count": { correct: ok ? 1 : 0, total: 1 } },
    );
  };
  const cutReached = shoe.cardsRemaining() <= decks * 52 * 0.25;
  return (
    <>
      <Title
        eyebrow={`Round ${round} · ${shoe.cardsRemaining()} cards remain`}
        title="Full Shoe Simulation"
        description="Deal realistic rounds and maintain the running count across the shoe."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Panel className="bg-[radial-gradient(circle_at_top,#174f3c,#151b18_70%)]">
          <div className="min-h-72">
            <div className="mb-10 text-center">
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-400">
                Dealer
              </p>
              <div className="flex justify-center gap-2">
                {table[0]?.map((c, i) => (
                  <PlayingCard key={i} card={c} hidden={i === 1 && !revealed} size="sm" animated={settings.animations} />
                ))}
              </div>
            </div>
            <div className="flex justify-around gap-4">
              {table.slice(1).map((h, i) => (
                <div key={i} className="text-center">
                  <p className="mb-2 text-xs text-zinc-400">Player {i + 1}</p>
                  <div className="flex gap-1">
                    {h.map((c, j) => (
                      <PlayingCard key={j} card={c} size="sm" animated={settings.animations} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {table.length === 0 ? (
              cutReached ? <Button onClick={reset}>Shuffle new shoe</Button> : <Button onClick={deal}>Deal round</Button>
            ) : (
              <>
                <input
                  placeholder="Running count"
                  aria-label="Running count"
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-40 rounded-lg bg-black/30 px-3 outline-none ring-1 ring-white/10"
                />
                <Button disabled={Boolean(feedback)} onClick={submit}>Check count</Button>
                {feedback && (cutReached ? <Button onClick={reset}>Shuffle at cut card</Button> : <Button onClick={deal}>Continue</Button>)}
              </>
            )}
          </div>
          {feedback && (
            <p
              aria-live="polite"
              className={`mt-4 text-center ${feedback === "Correct" ? "text-emerald-400" : "text-red-400"}`}
            >
              {feedback}. Hole card revealed. Running count {signed(visibleCount)}. True count{" "}
              {signed(trueCount(visibleCount, shoe.decksRemaining(), settings.rounding))}
            </p>
          )}
        </Panel>
        <Panel>
          <Select
            label="Decks"
            value={decks}
            onChange={(e) => setDecks(+e.target.value)}
          >
            {[1, 2, 4, 6, 8].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
          <div className="mt-4">
            <Select
              label="Simulated players"
              value={players}
              onChange={(e) => setPlayers(+e.target.value)}
            >
              {[1, 2, 3, 4].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <GhostButton className="mt-6 w-full" onClick={reset}>
            New shoe
          </GhostButton>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            The dealer hole card stays hidden until your answer is checked. The shoe ends at 75% penetration.
          </p>
        </Panel>
      </div>
    </>
  ); */
}
