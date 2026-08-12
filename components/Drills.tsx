/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-unused-expressions */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import {
  Card,
  RANKS,
  SUITS,
  Action,
  DEFAULT_RULES,
} from "@/lib/blackjack/types";
import { runningCount, signed, trueCount } from "@/lib/blackjack/hiLo";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import { DEVIATIONS, deviationDecision } from "@/lib/blackjack/deviations";
import {
  makeSession,
  Mistake,
  Session,
  storage,
  DrillType,
} from "@/lib/statistics/storage";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, Panel, Select } from "./ui";
import { SessionSummary } from "./SessionSummary";
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
) {
  const s = makeSession(drill, q, c, ms, streak, m);
  storage.addSession(s);
  return s;
}
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
  const input = useRef<HTMLInputElement>(null);
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
  const submit = () => {
    if (answer === "") return;
    setElapsed(Date.now() - start);
    setPhase("result");
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
                <PlayingCard key={`${shown}-${i}`} card={c} animated />
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
          setMistakes([]);
          setTotal(0);
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
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-36 rounded-lg bg-black/25 px-4 text-center text-xl outline-none ring-1 ring-white/10"
            />
            <Button>{result ? (q < 9 ? "Next" : "Finish") : "Submit"}</Button>
          </form>
          {result && (
            <p
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
function randomStrategyQuestion() {
  const category = Math.floor(Math.random() * 3);
  let player: Card[];
  if (category === 0) {
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    player = [
      { rank, suit: "spades" },
      { rank, suit: "hearts" },
    ];
  } else if (category === 1) {
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
  return { player, dealer: randomCard() };
}
export function StrategyDrill() {
  const [q, setQ] = useState(0),
    [feedback, setFeedback] = useState<{
      chosen: Action;
      correct: Action;
      explanation: string;
    }>();
  const data = useMemo(randomStrategyQuestion, [q]);
  const decision = getBasicStrategyDecision({
    playerCards: data.player,
    dealerUpcard: data.dealer,
    rules: DEFAULT_RULES,
  });
  const choose = useCallback(
    (a: Action) => {
      setFeedback({
        chosen: a,
        correct: decision.action,
        explanation: decision.explanation,
      });
      setQ((current) => current + 1);
    },
    [decision],
  );
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.repeat) return;
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
  }, [choose]);
  return (
    <>
      <Title
        eyebrow={`Hand ${q + 1}`}
        title="Basic Strategy"
        description="6-deck, H17, DAS, RSA, late surrender and double on any two cards."
      />
      <Panel>
        <div className="grid gap-10 py-6 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm text-zinc-500">Player hand</p>
            <div className="flex gap-3">
              {data.player.map((c, i) => (
                <PlayingCard key={i} card={c} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-4 text-sm text-zinc-500">Dealer upcard</p>
            <PlayingCard card={data.dealer} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(names) as Action[]).map((a) => (
            <GhostButton key={a} onClick={() => choose(a)}>
              <u>{names[a][0]}</u>
              {names[a].slice(1)}
            </GhostButton>
          ))}
        </div>
        {feedback && (
          <div
            className={`mt-5 rounded-xl border p-4 ${feedback.chosen === feedback.correct ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}
          >
            <b>
              {feedback.chosen === feedback.correct
                ? "Correct"
                : `Correct: ${names[feedback.correct]}`}
            </b>
            <p className="mt-1 text-sm text-zinc-300">{feedback.explanation}</p>
            <p className="mt-2 text-xs font-medium text-zinc-500">
              Next hand dealt automatically
            </p>
          </div>
        )}
      </Panel>
    </>
  );
}

export function DeviationDrill() {
  const [q, setQ] = useState(0),
    [feedback, setFeedback] = useState<{
      chosen: Action;
      correct: Action;
      normalAction: Action;
      deviationAction: Action;
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
  const chooseDeviation = useCallback(
    (chosen: Action) => {
      setFeedback({
        chosen,
        correct,
        normalAction: d.normalAction,
        deviationAction: d.deviationAction,
        index: d.index,
        tc,
        direction: d.direction,
      });
      setQ((current) => current + 1);
    },
    [correct, d, tc],
  );
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const map: Record<string, Action> = {
        h: "H",
        s: "S",
        d: "D",
        p: "P",
        r: "R",
      };
      const action = map[event.key.toLowerCase()];
      if (action) chooseDeviation(action);
    };
    addEventListener("keydown", handleKey);
    return () => removeEventListener("keydown", handleKey);
  }, [chooseDeviation]);
  return (
    <>
      <Title
        eyebrow={`Index play ${q + 1}`}
        title="Hi-Lo Deviations"
        description="Decide whether the current true count activates the index play."
      />
      <Panel>
        <div className="grid gap-4 md:grid-cols-5">
          {[
            ["Player", d.hand],
            ["Dealer", d.dealer],
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
          {(Object.keys(names) as Action[]).map((a) => (
            <GhostButton key={a} onClick={() => chooseDeviation(a)}>
              <u>{names[a][0]}</u>
              {names[a].slice(1)}
            </GhostButton>
          ))}
        </div>
        {feedback && (
          <div className="mt-5 rounded-xl bg-black/20 p-5">
            <b
              className={
                feedback.chosen === feedback.correct
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            >
              {feedback.chosen === feedback.correct
                ? "Correct"
                : `Correct action: ${names[feedback.correct]}`}
            </b>
            <div className="mt-3 grid gap-2 text-sm text-zinc-300 md:grid-cols-3">
              <p>Basic strategy: {names[feedback.normalAction]}</p>
              <p>Index: {signed(feedback.index)}</p>
              <p>Current TC: {signed(feedback.tc)}</p>
            </div>
            <p className="mt-3 text-zinc-400">
              {names[feedback.deviationAction]} at TC {signed(feedback.index)}{" "}
              {feedback.direction === "atOrBelow" ? "or lower" : "or higher"}.
              The current count{" "}
              {feedback.correct === feedback.deviationAction
                ? "triggers"
                : "does not trigger"}{" "}
              the deviation.
            </p>
            <p className="mt-3 text-xs font-medium text-zinc-500">
              Next hand dealt automatically
            </p>
          </div>
        )}
      </Panel>
    </>
  );
}

export function MissingCardDrill() {
  const [mode, setMode] = useState<"rank" | "exact">("rank"),
    [count, setCount] = useState(1),
    [q, setQ] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [result, setResult] = useState<string>();
  const missing = useMemo(() => {
    const shoe = new BlackjackShoe(1),
      arr: Card[] = [];
    for (let i = 0; i < count; i++) {
      const c = shoe.deal();
      if (c) arr.push(c);
    }
    return arr;
  }, [q, count]);
  const options =
    mode === "rank"
      ? RANKS.map(String)
      : RANKS.flatMap((r) =>
          SUITS.map(
            (s) =>
              `${r}${{ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[s]}`,
          ),
        );
  const expected = missing.map((c) =>
    mode === "rank"
      ? c.rank
      : `${c.rank}${{ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[c.suit]}`,
  );
  const submit = () => {
    const a = [...selected].sort(),
      b = [...expected].sort();
    setResult(
      JSON.stringify(a) === JSON.stringify(b)
        ? "Correct!"
        : `Missing: ${expected.join(", ")}`,
    );
  };
  return (
    <>
      <Title
        eyebrow="Observation drill"
        title="Missing Card"
        description="A full deck was checked, shuffled, and the selected number of cards removed. Identify them."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Panel>
          <p className="mb-4 text-zinc-400">
            Select {count} {mode === "rank" ? "rank(s)" : "exact card(s)"}
          </p>
          <div className="grid grid-cols-7 gap-2 md:grid-cols-13">
            {options.map((o) => (
              <button
                key={o}
                onClick={() =>
                  setSelected((s) =>
                    s.includes(o)
                      ? s.filter((x) => x !== o)
                      : s.length < count
                        ? [...s, o]
                        : s,
                  )
                }
                className={`rounded-lg border p-2 text-sm ${selected.includes(o) ? "border-emerald-400 bg-emerald-500/20" : "border-white/10 bg-black/20"}`}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-3">
            <Button disabled={selected.length !== count} onClick={submit}>
              Check answer
            </Button>
            {result && (
              <Button
                onClick={() => {
                  setQ((x) => x + 1);
                  setSelected([]);
                  setResult(undefined);
                }}
              >
                Next
              </Button>
            )}
          </div>
          {result && (
            <p
              className={`mt-4 ${result === "Correct!" ? "text-emerald-400" : "text-red-400"}`}
            >
              {result}
            </p>
          )}
        </Panel>
        <Panel>
          <Select
            label="Mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "rank" | "exact");
              setSelected([]);
            }}
          >
            <option value="rank">Rank mode</option>
            <option value="exact">Exact card mode</option>
          </Select>
          <div className="mt-4">
            <Select
              label="Cards removed"
              value={count}
              onChange={(e) => {
                setCount(+e.target.value);
                setSelected([]);
              }}
            >
              {[1, 2, 3, 5].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-200">
            A real 52-card deck is used each round; no replacement.
          </div>
        </Panel>
      </div>
    </>
  );
}

export function DeckEstimationDrill() {
  const [level, setLevel] = useState("intermediate"),
    [q, setQ] = useState(0),
    [answer, setAnswer] = useState(3),
    [result, setResult] = useState<string>();
  const actual = useMemo(
    () => Math.round((Math.random() * 5.5 + 0.5) * 4) / 4,
    [q],
  );
  const percent = (actual / 6) * 100;
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
              <Button
                onClick={() =>
                  setResult(
                    `Actual: ${actual} decks · Error: ${signed(Math.round((answer - actual) * 100) / 100)} decks`,
                  )
                }
              >
                Submit
              </Button>
            </div>
            {result && (
              <div className="mt-4 rounded-xl bg-black/20 p-4">
                {result}
                <Button
                  className="ml-4"
                  onClick={() => {
                    setQ((x) => x + 1);
                    setResult(undefined);
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
  const [decks, setDecks] = useState(6),
    [players, setPlayers] = useState(2),
    [shoe, setShoe] = useState(() => new BlackjackShoe(6)),
    [round, setRound] = useState(0),
    [table, setTable] = useState<Card[][]>([]),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState<string>();
  const reset = () => {
    setShoe(new BlackjackShoe(decks));
    setRound(0);
    setTable([]);
    setFeedback(undefined);
  };
  useEffect(reset, [decks]);
  const deal = () => {
    const hands = Array.from({ length: players + 1 }, () => [] as Card[]);
    for (let pass = 0; pass < 2; pass++)
      for (const hand of hands) {
        const c = shoe.deal();
        if (c) hand.push(c);
      }
    setTable(hands);
    setRound((r) => r + 1);
    setFeedback(undefined);
    setAnswer("");
  };
  const submit = () =>
    setFeedback(
      +answer === shoe.runningCount()
        ? "Correct"
        : `Correct running count: ${signed(shoe.runningCount())}`,
    );
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
                  <PlayingCard key={i} card={c} size="sm" />
                ))}
              </div>
            </div>
            <div className="flex justify-around gap-4">
              {table.slice(1).map((h, i) => (
                <div key={i} className="text-center">
                  <p className="mb-2 text-xs text-zinc-400">Player {i + 1}</p>
                  <div className="flex gap-1">
                    {h.map((c, j) => (
                      <PlayingCard key={j} card={c} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {table.length === 0 ? (
              <Button onClick={deal}>Deal round</Button>
            ) : (
              <>
                <input
                  placeholder="Running count"
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-40 rounded-lg bg-black/30 px-3 outline-none ring-1 ring-white/10"
                />
                <Button onClick={submit}>Check count</Button>
                {feedback && <Button onClick={deal}>Continue</Button>}
              </>
            )}
          </div>
          {feedback && (
            <p
              className={`mt-4 text-center ${feedback === "Correct" ? "text-emerald-400" : "text-red-400"}`}
            >
              {feedback} · True count{" "}
              {signed(trueCount(shoe.runningCount(), shoe.decksRemaining()))}
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
        </Panel>
      </div>
    </>
  );
}
