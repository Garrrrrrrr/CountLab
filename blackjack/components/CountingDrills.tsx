"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlayingCard } from "./PlayingCard";
import { SessionSummary } from "./SessionSummary";
import { Button, GhostButton, Metric, NumberField, Panel, Select } from "./ui";
import {
  classifyCountError,
  classifyTrueCountError,
  COUNTING_PRESETS,
  CountBias,
  CountingPreset,
  countingMastery,
  DeckResolution,
  expectedBet,
  makeCountSequence,
  makeTrueCountScenario,
  roundDeckEstimate,
  SimulatedRound,
  simulateRound,
  TrueCountScenario,
} from "@/lib/blackjack/countingTraining";
import { DEVIATION_ACTION_NAMES, DeviationAction } from "@/lib/blackjack/deviations";
import { runningCount, signed, trueCount } from "@/lib/blackjack/hiLo";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { Action, BlackjackRules, Card } from "@/lib/blackjack/types";
import { CountingErrorCategory, makeSession, Mistake, Session, storage } from "@/lib/statistics/storage";
import { loadDrillProgress, useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { track } from "@/lib/analytics/track";
import rawDeckEstimationPhotos from "@/public/deck-estimation/manifest.json";

type DeckPhoto = { file: string; decks: number; numDecks: number; sourceUrl: string };
const DECK_ESTIMATION_PHOTOS = rawDeckEstimationPhotos as DeckPhoto[];
const PHOTO_DECK_OPTIONS = Array.from(new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.numDecks))).sort((a, b) => a - b);
const PHOTO_UNIQUE_COUNT = new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.file)).size;

const inputClass = "field min-h-11 w-full rounded-xl px-3 text-center text-lg text-white outline-none";
const actionNames: Record<DeviationAction, string> = { ...DEVIATION_ACTION_NAMES };

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1><p className="mt-2 max-w-3xl text-zinc-400">{description}</p></div>;
}

function addCategory(all: Record<string, { correct: number; total: number }>, key: string, correct: boolean) {
  const next = { ...all };
  next[key] = { correct: (next[key]?.correct ?? 0) + Number(correct), total: (next[key]?.total ?? 0) + 1 };
  return next;
}

function TrayVisual({ totalDecks, remainingDecks, style = "green", landmarks = true }: {
  totalDecks: number; remainingDecks: number; style?: "green" | "red" | "smoke"; landmarks?: boolean;
}) {
  const discarded = Math.max(0, totalDecks - remainingDecks);
  const fill = Math.min(100, discarded / totalDecks * 100);
  const colors = style === "red" ? "from-red-950 to-red-700" : style === "smoke" ? "from-zinc-900 to-zinc-600" : "from-emerald-950 to-emerald-600";
  return <div>
    <div aria-label={`${discarded.toFixed(2)} decks discarded, ${remainingDecks.toFixed(2)} decks remaining`} className="relative h-40 overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-inner [perspective:500px]">
      <div className={`absolute inset-x-3 bottom-2 rounded-lg bg-gradient-to-t ${colors} transition-[height] duration-500`} style={{ height: `calc(${fill}% - 8px)` }} />
      {landmarks && [25, 50, 75].map((value) => <div key={value} className="absolute inset-x-0 border-t border-dashed border-white/20" style={{ bottom: `${value}%` }}><span className="absolute right-2 -top-4 text-[10px] text-zinc-500">{value}% discarded</span></div>)}
      <div className="absolute inset-0 rounded-2xl ring-8 ring-black/20 [transform:rotateX(-4deg)]" />
    </div>
    <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>Discard tray</span><span>Fill shows cards already dealt</span></div>
  </div>;
}

function NumericPad({ value, onChange, onSubmit, decimal = false }: { value: string; onChange: (v: string) => void; onSubmit: () => void; decimal?: boolean }) {
  const press = (key: string) => {
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === "sign") return onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    if (key === "." && value.includes(".")) return;
    onChange(`${value}${key}`);
  };
  return <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2 sm:hidden" aria-label="Number pad">
    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "sign", "0", decimal ? "." : "back"].map((key) => <GhostButton className="min-h-11" type="button" key={key} onClick={() => press(key)}>{key === "sign" ? "+/-" : key === "back" ? "Delete" : key}</GhostButton>)}
    {decimal && <GhostButton className="min-h-11" type="button" onClick={() => press("back")}>Delete</GhostButton>}
    <Button className={decimal ? "col-span-2 min-h-11" : "col-span-3 min-h-11"} type="button" onClick={onSubmit}>Submit</Button>
  </div>;
}

function CardGroup({ cards, seed }: { cards: Card[]; seed: number }) {
  const layouts = ["justify-center", "justify-start md:pl-16", "justify-end md:pr-16"];
  return <div className={`flex min-h-52 flex-wrap items-center gap-2 ${layouts[seed % layouts.length]}`}>
    {cards.map((card, index) => <div key={`${card.rank}-${card.suit}-${index}`} style={{ transform: `rotate(${((seed + index * 3) % 9) - 4}deg) translateY(${(index % 3) * 4}px)` }}><PlayingCard card={card} animated size={cards.length >= 4 ? "sm" : "md"} /></div>)}
  </div>;
}

type RunningPhase = "setup" | "show" | "answer" | "feedback" | "interruption" | "paused" | "done";
type RunningSaved = {
  preset: CountingPreset; decks: number; amount: number; speed: number;
  group: "1" | "2" | "3" | "4" | "random"; checkpoint: "final" | "5" | "10" | "random" | "sign";
  bias: CountBias; feedbackMode: "immediate" | "end";
  phase: "answer" | "paused"; cards: Card[]; cursor: number; size: number; answer: string;
  checks: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  elapsed: number; interruptionUsed: boolean;
};

export function RunningCountDrill() {
  const initial = storage.settings();
  const [saved] = useState(() => loadDrillProgress<RunningSaved>("Running Count"));
  const [preset, setPreset] = useState<CountingPreset>(saved?.preset ?? initial.countingPreset);
  const defaults = COUNTING_PRESETS[preset];
  const [decks, setDecks] = useState(saved?.decks ?? defaults.decks), [amount, setAmount] = useState(saved?.amount ?? defaults.cards), [speed, setSpeed] = useState(saved?.speed ?? defaults.speed);
  const [group, setGroup] = useState<"1" | "2" | "3" | "4" | "random">(saved?.group ?? defaults.group), [checkpoint, setCheckpoint] = useState<"final" | "5" | "10" | "random" | "sign">(saved?.checkpoint ?? defaults.checkpoint);
  const [bias, setBias] = useState<CountBias>(saved?.bias ?? "none"), [feedbackMode, setFeedbackMode] = useState(saved?.feedbackMode ?? initial.countingFeedback);
  const [phase, setPhase] = useState<RunningPhase>(saved?.phase ?? "setup"), [cards, setCards] = useState<Card[]>(saved?.cards ?? []), [cursor, setCursor] = useState(saved?.cursor ?? 0), [size, setSize] = useState(saved?.size ?? 1);
  const [answer, setAnswer] = useState(saved?.phase === "answer" ? saved.answer : ""), [message, setMessage] = useState(""), [checks, setChecks] = useState(saved?.checks ?? 0), [correct, setCorrect] = useState(saved?.correct ?? 0), [streak, setStreak] = useState(saved?.streak ?? 0), [best, setBest] = useState(saved?.best ?? 0);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []), [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}), [result, setResult] = useState<Session>();
  const [elapsed, setElapsed] = useState(saved?.elapsed ?? 0), startRef = useRef(Date.now() - (saved?.elapsed ?? 0)), answerStart = useRef(Date.now()), pausedAt = useRef(saved?.phase === "paused" ? Date.now() : 0), pausedTotal = useRef(0), interrupted = useRef(false), interruptionUsed = useRef(saved?.interruptionUsed ?? false);
  const answerTotal = useRef(0);
  const active = phase !== "setup" && phase !== "done";
  useDrillProgress("Running Count", active, {
    preset, decks, amount, speed, group, checkpoint, bias, feedbackMode,
    phase: phase === "answer" ? "answer" : "paused",
    cards, cursor, size, answer: phase === "answer" ? answer : "",
    checks, correct, streak, best, mistakes, categories, elapsed,
    interruptionUsed: interruptionUsed.current,
  } satisfies RunningSaved);
  const visible = cards.slice(cursor, Math.min(cards.length, cursor + size));
  const pickSize = () => group === "random" ? 1 + Math.floor(Math.random() * 4) : Number(group);
  const expected = runningCount(cards.slice(0, cursor));

  useEffect(() => {
    if (!["show", "answer", "feedback"].includes(phase)) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startRef.current - pausedTotal.current), 100);
    return () => clearInterval(id);
  }, [phase]);

  const finish = (nextChecks = checks, nextCorrect = correct, nextMistakes = mistakes, nextCategories = categories) => {
    const total = Date.now() - startRef.current - pausedTotal.current;
    const seen = cursor || cards.length;
    const session = makeSession("Running Count", nextChecks, nextCorrect, total, best, nextMistakes, nextCategories, {
      cardsPerSecond: seen / Math.max(0.001, total / 1000), elapsedSeconds: total / 1000,
      perfectDeck: cards.length === 52 && seen === cards.length && nextCorrect === nextChecks, cardsSeen: seen,
      averageAnswerLatency: answerTotal.current / Math.max(1, nextChecks),
      interruptionAccuracy: interruptionUsed.current ? Number(nextMistakes.every((m) => m.category !== "interruption recovery")) * 100 : 100,
    }, [preset, group, checkpoint, bias]);
    storage.addSession(session); storage.clearProgress("Running Count"); setResult(session); setPhase("done");
  };
  const endDrill = () => finish();

  const advance = () => {
    const next = Math.min(cards.length, cursor + size);
    const before = runningCount(cards.slice(0, cursor)), after = runningCount(cards.slice(0, next));
    const due = next === cards.length || checkpoint === "5" && Math.floor(next / 5) > Math.floor(cursor / 5) || checkpoint === "10" && Math.floor(next / 10) > Math.floor(cursor / 10) || checkpoint === "random" && Math.random() < 0.17 || checkpoint === "sign" && before !== 0 && Math.sign(before) !== Math.sign(after);
    setCursor(next);
    if (defaults.interruption && !interruptionUsed.current && next >= cards.length / 2) { interruptionUsed.current = true; interrupted.current = true; setPhase("interruption"); return; }
    if (due) { answerStart.current = Date.now(); setAnswer(""); setPhase("answer"); }
    else { setSize(pickSize()); }
  };
  // The timer is intentionally recreated only when the displayed group changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase !== "show") return; const id = window.setTimeout(advance, speed); return () => clearTimeout(id); }, [phase, cursor, size, speed]);

  const start = () => { const next = makeCountSequence(decks, amount, bias); setCards(next); setCursor(0); setSize(pickSize()); setChecks(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setMessage(""); setElapsed(0); pausedTotal.current = 0; answerTotal.current = 0; interruptionUsed.current = false; interrupted.current = false; startRef.current = Date.now(); setPhase("show"); track("drill_started", { drill: "Running Count", preset, decks, amount, speed, group, checkpoint, bias }); };
  const applyPreset = (value: CountingPreset) => { const p = COUNTING_PRESETS[value]; setPreset(value); setDecks(p.decks); setAmount(p.cards); setSpeed(p.speed); setGroup(p.group); setCheckpoint(p.checkpoint); storage.saveSettings({ ...storage.settings(), countingPreset: value }); };
  const submit = () => {
    answerTotal.current += Date.now() - answerStart.current;
    const actual = Number(answer), ok = actual === expected, nextChecks = checks + 1, nextCorrect = correct + Number(ok), nextStreak = ok ? streak + 1 : 0;
    const lastCards = cards.slice(Math.max(0, cursor - size), cursor), category = ok ? undefined : classifyCountError({ expected, actual, previous: runningCount(cards.slice(0, Math.max(0, cursor - size))), cards: lastCards, interrupted: interrupted.current });
    const nextMistakes = ok ? mistakes : [...mistakes, { question: `Running count after ${cursor} cards`, userAnswer: answer || "blank", correctAnswer: signed(expected), explanation: category === "missed cancellation" ? "Cancel low and high cards before carrying the net value forward." : "Recount from the previous checkpoint and watch the sign.", category }];
    const signGroup = expected < 0 ? "negative" : expected > 0 ? "positive" : "zero", nextCategories = addCategory(categories, `${group}-card groups, ${signGroup}`, ok);
    setChecks(nextChecks); setCorrect(nextCorrect); setStreak(nextStreak); setBest(Math.max(best, nextStreak)); setMistakes(nextMistakes); setCategories(nextCategories); interrupted.current = false;
    track("running_count_answered", { ok, expected, actual, group, checkpoint, category });
    if (cursor === cards.length) { finish(nextChecks, nextCorrect, nextMistakes, nextCategories); return; }
    if (feedbackMode === "immediate") { setMessage(ok ? `Correct: ${signed(expected)}` : `Correct count: ${signed(expected)}`); setPhase("feedback"); } else { setSize(pickSize()); setPhase("show"); }
  };

  if (phase === "done" && result) return <SessionSummary session={result} onNew={() => setPhase("setup")} />;
  return <>
    <Heading eyebrow="Counting drill" title="Running Count" description="Count realistic card groups, recover after interruptions, and diagnose exactly where the count was lost." />
    {phase === "setup" ? <Panel className="max-w-4xl"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Select label="Saved preset" value={preset} onChange={(e) => applyPreset(e.target.value as CountingPreset)}>{Object.entries(COUNTING_PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}</Select>
      <Select label="Decks" value={decks} onChange={(e) => setDecks(+e.target.value)}>{[1, 2, 4, 6, 8].map((x) => <option key={x}>{x}</option>)}</Select>
      <NumberField label="Cards in session" value={amount} min={10} max={decks * 52} onValueChange={(value) => setAmount(Math.min(decks * 52, value))} />
      <Select label="Group size" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>{["1", "2", "3", "4", "random"].map((x) => <option key={x} value={x}>{x === "random" ? "Random 1 to 4" : x}</option>)}</Select>
      <Select label="Checkpoint" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value as typeof checkpoint)}><option value="final">Final only</option><option value="5">Every 5 cards</option><option value="10">Every 10 cards</option><option value="random">Random</option><option value="sign">Sign changes</option></Select>
      <Select label="Count bias" value={bias} onChange={(e) => setBias(e.target.value as CountBias)}><option value="none">Balanced random</option><option value="positive">Positive stretches</option><option value="negative">Negative stretches</option></Select>
      <Select label="Feedback" value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value as typeof feedbackMode)}><option value="immediate">At each checkpoint</option><option value="end">At session end</option></Select>
      <Select label="Card interval" value={speed} onChange={(e) => setSpeed(+e.target.value)}>{[1500, 1000, 750, 500, 300].map((x) => <option key={x} value={x}>{x} ms</option>)}</Select>
    </div><Button className="mt-6 min-h-11" onClick={start}>Start counting</Button></Panel> : <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <Panel className="min-h-[26rem]">
        {phase === "show" && <CardGroup cards={visible} seed={cursor} />}
        {phase === "interruption" && <div className="grid min-h-64 place-items-center text-center"><div><p className="text-5xl">☎</p><h2 className="mt-4 text-xl font-semibold">Interruption</h2><p className="mt-2 text-zinc-400">Hold the count while attention moves away from the table.</p><Button className="mt-5 min-h-11" onClick={() => { setSize(pickSize()); setPhase("show"); }}>Return to the table</Button></div></div>}
        {phase === "paused" && <div className="grid min-h-64 place-items-center"><Button className="min-h-11" onClick={() => { pausedTotal.current += Date.now() - pausedAt.current; setPhase("show"); }}>Resume session</Button></div>}
        {phase === "answer" && <form className="mx-auto max-w-sm py-16 text-center" onSubmit={(e) => { e.preventDefault(); submit(); }}><h2 className="text-xl font-semibold">Running count after {cursor} cards?</h2><input autoFocus inputMode="numeric" aria-label="Running count" className={`${inputClass} mt-5`} value={answer} onChange={(e) => setAnswer(e.target.value)} /><Button className="mt-4 hidden min-h-11 w-full sm:block">Check count</Button><NumericPad value={answer} onChange={setAnswer} onSubmit={submit} /></form>}
        {phase === "feedback" && <div aria-live="polite" className="grid min-h-64 place-items-center text-center"><div><p className="text-2xl font-semibold">{message}</p><Button className="mt-5 min-h-11" onClick={() => { setSize(pickSize()); setPhase("show"); }}>Continue</Button></div></div>}
      </Panel>
      <div className="space-y-3"><Metric label="Cards seen" value={`${cursor} / ${cards.length}`} /><Metric label="Total time" value={`${(elapsed / 1000).toFixed(1)}s`} /><Metric label="Current speed" value={`${(cursor / Math.max(1, elapsed / 1000)).toFixed(1)} cards/s`} /><Metric label="Checkpoints" value={`${correct} / ${checks}`} />{phase === "show" && <GhostButton className="min-h-11 w-full" onClick={() => { pausedAt.current = Date.now(); setPhase("paused"); }}>Pause</GhostButton>}<GhostButton className="min-h-11 w-full" onClick={endDrill}>End drill</GhostButton></div>
    </div>}
  </>;
}

type TrueCountFocus = "adaptive" | "all" | "positive" | "negative" | "zero" | "index" | "last-deck";
type TrueCountSaved = {
  decks: number; resolution: DeckResolution; mode: "division" | "combined"; focus: TrueCountFocus;
  feedbackMode: "immediate" | "end"; phase: "question" | "feedback"; question: TrueCountScenario;
  tcAnswer: string; deckAnswer: string; index: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>; message: string; totalMs: number;
};

export function TrueCountDrill() {
  const settings = storage.settings();
  const [saved] = useState(() => loadDrillProgress<TrueCountSaved>("True Count"));
  const [decks, setDecks] = useState(saved?.decks ?? settings.decks), [resolution, setResolution] = useState<DeckResolution>(saved?.resolution ?? 0.5), [mode, setMode] = useState<"division" | "combined">(saved?.mode ?? "combined"), [focus, setFocus] = useState<TrueCountFocus>(saved?.focus ?? "adaptive");
  const [feedbackMode, setFeedbackMode] = useState(saved?.feedbackMode ?? settings.countingFeedback), [phase, setPhase] = useState<"setup" | "question" | "feedback" | "done">(saved?.phase ?? "setup"), [question, setQuestion] = useState<TrueCountScenario | undefined>(saved?.question);
  const [tcAnswer, setTcAnswer] = useState(saved?.tcAnswer ?? ""), [deckAnswer, setDeckAnswer] = useState(saved?.deckAnswer ?? ""), [index, setIndex] = useState(saved?.index ?? 0), [correct, setCorrect] = useState(saved?.correct ?? 0), [streak, setStreak] = useState(saved?.streak ?? 0), [best, setBest] = useState(saved?.best ?? 0), [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []), [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}), [message, setMessage] = useState(saved?.message ?? ""), [result, setResult] = useState<Session>();
  const started = useRef(0), answerStarted = useRef(Date.now()), totalMs = useRef(saved?.totalMs ?? 0), target = settings.countingSessionQuestions;
  const active = phase === "question" || phase === "feedback";
  useDrillProgress("True Count", active && Boolean(question), {
    decks, resolution, mode, focus, feedbackMode, phase: phase as "question" | "feedback", question: question as TrueCountScenario,
    tcAnswer, deckAnswer, index, correct, streak, best, mistakes, categories, message, totalMs: totalMs.current,
  } satisfies TrueCountSaved);
  const nextQuestion = () => {
    let scenarioFocus: Exclude<typeof focus, "adaptive"> = focus === "adaptive" ? "all" : focus;
    if (focus === "adaptive") {
      const history = storage.sessions().filter((session) => session.drill === "True Count").flatMap((session) => Object.entries(session.categories ?? {}));
      const weakest = history.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0]?.[0] ?? "";
      scenarioFocus = weakest.includes("negative") ? "negative" : weakest.includes("positive") ? "positive" : weakest.includes("zero") ? "zero" : "all";
    }
    const q = makeTrueCountScenario({ decks, resolution, rounding: settings.rounding, focus: scenarioFocus }); setQuestion(q); setTcAnswer(""); setDeckAnswer(""); answerStarted.current = Date.now(); setPhase("question");
  };
  const start = () => { setIndex(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); totalMs.current = 0; started.current = Date.now(); nextQuestion(); track("drill_started", { drill: "True Count", decks, resolution, mode, focus }); };
  const submit = () => {
    if (!question) return; totalMs.current += Date.now() - answerStarted.current;
    const tcOk = Number(tcAnswer) === question.answer, deckOk = mode === "division" || Math.abs(Number(deckAnswer) - question.estimatedDecksRemaining) < 0.001, ok = tcOk && deckOk;
    const label = `${question.runningCount < 0 ? "negative" : question.runningCount > 0 ? "positive" : "zero"}, ${resolution}-deck divisor`, nextCategories = addCategory(categories, label, ok);
    const category: CountingErrorCategory = !deckOk ? "deck estimate" : classifyTrueCountError(question.runningCount, question.estimatedDecksRemaining, question.answer, Number(tcAnswer));
    const nextMistakes = ok ? mistakes : [...mistakes, { question: `RC ${signed(question.runningCount)} with ${question.estimatedDecksRemaining} decks remaining`, userAnswer: `TC ${tcAnswer || "blank"}${mode === "combined" ? `, ${deckAnswer || "blank"} decks` : ""}`, correctAnswer: `TC ${signed(question.answer)}, ${question.estimatedDecksRemaining} decks`, explanation: `${signed(question.runningCount)} ÷ ${question.estimatedDecksRemaining} = ${(question.runningCount / question.estimatedDecksRemaining).toFixed(2)}. ${settings.rounding === "floor" ? "Floor moves toward negative infinity, so -1.2 becomes -2." : settings.rounding === "truncate" ? "Truncate drops the decimal toward zero, so -1.2 becomes -1." : "Round to the nearest integer."}`, category }];
    const nextCorrect = correct + Number(ok), nextStreak = ok ? streak + 1 : 0, nextIndex = index + 1;
    setCorrect(nextCorrect); setStreak(nextStreak); setBest(Math.max(best, nextStreak)); setMistakes(nextMistakes); setCategories(nextCategories); setIndex(nextIndex);
    track("true_count_answered", { ok, tcOk, deckOk, mode, focus, category });
    if (nextIndex >= target) return finish(nextIndex, nextCorrect, Math.max(best, nextStreak), nextMistakes, nextCategories);
    if (feedbackMode === "immediate") { setMessage(ok ? `Correct: ${signed(question.answer)}` : `Correct answer: ${signed(question.answer)}`); setPhase("feedback"); } else nextQuestion();
  };
  const finish = (askedCount = index, gotCorrect = correct, bestStreak = best, finalMistakes = mistakes, finalCategories = categories) => {
    const session = makeSession("True Count", askedCount, gotCorrect, totalMs.current, bestStreak, finalMistakes, finalCategories, { divisorResolution: resolution, combinedAccuracy: askedCount ? Math.round(gotCorrect / askedCount * 100) : 0 }, [mode, focus, settings.rounding]);
    storage.addSession(session); storage.clearProgress("True Count"); setResult(session); setPhase("done");
  };
  const endDrill = () => finish();
  if (phase === "done" && result) return <SessionSummary session={result} onNew={() => setPhase("setup")} />;
  return <><Heading eyebrow="Counting drill" title="True Count" description="Estimate the discard tray and divide counts drawn from actual partial shoes, including zero, negative, index-boundary, and last-deck cases." />
      {phase === "setup" ? <Panel className="max-w-4xl"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="combined">Tray estimate + division</option><option value="division">Division only</option></Select><Select label="Shoe" value={decks} onChange={(e) => setDecks(+e.target.value)}>{[1, 2, 4, 6, 8].map((x) => <option key={x}>{x} decks</option>)}</Select><Select label="Deck resolution" value={resolution} onChange={(e) => setResolution(+e.target.value as DeckResolution)}><option value="1">Full deck</option><option value="0.5">Half deck</option><option value="0.25">Quarter deck</option></Select><Select label="Scenario focus" value={focus} onChange={(e) => setFocus(e.target.value as typeof focus)}><option value="adaptive">Adaptive weak spots</option><option value="all">Mixed realistic</option><option value="positive">Positive counts</option><option value="negative">Negative counts</option><option value="zero">Zero counts</option><option value="index">Near index boundaries</option><option value="last-deck">Last-deck precision</option></Select><Select label="Feedback" value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value as typeof feedbackMode)}><option value="immediate">Immediate</option><option value="end">End of session</option></Select></div><p className="mt-5 text-sm text-zinc-400">Rounding: <b className="text-white">{settings.rounding}</b>. Floor sends negative decimals down; truncate sends them toward zero.</p><Button className="mt-5 min-h-11" onClick={start}>Start {target} questions</Button></Panel> : question && <div className="grid gap-5 lg:grid-cols-[1fr_18rem]"><Panel>
      {phase === "feedback" ? <div aria-live="polite" className="grid min-h-80 place-items-center text-center"><div><p className="text-2xl font-semibold">{message}</p><p className="mt-2 text-zinc-400">{signed(question.runningCount)} ÷ {question.estimatedDecksRemaining} = {(question.runningCount / question.estimatedDecksRemaining).toFixed(2)}</p><Button className="mt-5 min-h-11" onClick={nextQuestion}>Next question</Button></div></div> : <form onSubmit={(e) => { e.preventDefault(); submit(); }}><div className="grid gap-6 md:grid-cols-2">{mode === "combined" && <TrayVisual totalDecks={question.totalDecks} remainingDecks={question.exactDecksRemaining} />}<div className="grid place-items-center rounded-2xl bg-black/20 p-6 text-center"><p className="text-sm text-zinc-500">Running count</p><p className="mt-2 text-6xl font-semibold">{signed(question.runningCount)}</p>{mode === "division" && <p className="mt-3 text-zinc-400">Estimated decks remaining: {question.estimatedDecksRemaining}</p>}</div></div><div className="mx-auto mt-7 grid max-w-xl gap-4 sm:grid-cols-2">{mode === "combined" && <label className="text-sm text-zinc-400">Decks remaining<input inputMode="decimal" aria-label="Estimated decks remaining" className={`${inputClass} mt-2`} value={deckAnswer} onChange={(e) => setDeckAnswer(e.target.value)} /></label>}<label className="text-sm text-zinc-400">True count<input autoFocus inputMode="numeric" aria-label="True count" className={`${inputClass} mt-2`} value={tcAnswer} onChange={(e) => setTcAnswer(e.target.value)} /></label></div><Button className="mx-auto mt-5 hidden min-h-11 sm:block">Check answer</Button><NumericPad value={tcAnswer} onChange={setTcAnswer} onSubmit={submit} /></form>}
    </Panel><div className="space-y-3"><Metric label="Question" value={`${index + 1} / ${target}`} /><Metric label="Accuracy" value={`${index ? Math.round(correct / index * 100) : 0}%`} /><Metric label="Best streak" value={best} /><GhostButton className="min-h-11 w-full" onClick={endDrill}>End drill</GhostButton></div></div>}
  </>;
}

type DeckEstimationSaved = {
  decks: number; resolution: DeckResolution; feedbackMode: "immediate" | "end";
  phase: "question" | "feedback"; question: number; remaining: number; photo: DeckPhoto | null; answer: string;
  correct: number; errors: number[]; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  message: string; totalMs: number;
};

export function DeckEstimationDrill() {
  const settings = storage.settings();
  const [saved] = useState(() => loadDrillProgress<DeckEstimationSaved>("Deck Estimation"));
  const [decks, setDecks] = useState(saved?.decks ?? (PHOTO_DECK_OPTIONS.includes(settings.decks) ? settings.decks : PHOTO_DECK_OPTIONS[0])), [resolution, setResolution] = useState<DeckResolution>(saved?.resolution ?? 0.5);
  const [phase, setPhase] = useState<"setup" | "question" | "feedback" | "done">(saved?.phase ?? "setup"), [feedbackMode, setFeedbackMode] = useState(saved?.feedbackMode ?? settings.countingFeedback), [question, setQuestion] = useState(saved?.question ?? 0), [remaining, setRemaining] = useState(saved?.remaining ?? 0), [photo, setPhoto] = useState<DeckPhoto | null>(saved?.photo ?? null), [answer, setAnswer] = useState(saved?.answer ?? ""), [correct, setCorrect] = useState(saved?.correct ?? 0), [errors, setErrors] = useState<number[]>(saved?.errors ?? []), [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []), [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {}), [message, setMessage] = useState(saved?.message ?? ""), [result, setResult] = useState<Session>();
  const started = useRef(0), answerStarted = useRef(Date.now()), totalMs = useRef(saved?.totalMs ?? 0), target = settings.countingSessionQuestions;
  const active = phase === "question" || phase === "feedback";
  useDrillProgress("Deck Estimation", active && Boolean(photo), {
    decks, resolution, feedbackMode, phase: phase as "question" | "feedback", question, remaining, photo, answer,
    correct, errors, mistakes, categories, message, totalMs: totalMs.current,
  } satisfies DeckEstimationSaved);
  const newTray = () => {
    const pool = DECK_ESTIMATION_PHOTOS.filter((p) => p.numDecks === decks);
    const chosen = (pool.length ? pool : DECK_ESTIMATION_PHOTOS)[Math.floor(Math.random() * (pool.length ? pool.length : DECK_ESTIMATION_PHOTOS.length))];
    setPhoto(chosen); setDecks(chosen.numDecks); setRemaining(chosen.decks);
    setAnswer(""); answerStarted.current = Date.now(); setPhase("question");
  };
  const start = () => { setQuestion(0); setCorrect(0); setErrors([]); setMistakes([]); setCategories({}); totalMs.current = 0; started.current = Date.now(); newTray(); track("drill_started", { drill: "Deck Estimation", decks, resolution }); };
  const submit = () => {
    const expected = roundDeckEstimate(remaining, resolution), actual = Number(answer), error = Number.isFinite(actual) && answer.trim() ? Math.abs(actual - remaining) : decks, ok = Math.abs(actual - expected) < 0.001, nextQuestion = question + 1, nextCorrect = correct + Number(ok), nextErrors = [...errors, error]; totalMs.current += Date.now() - answerStarted.current;
    const category = `${resolution}-deck${remaining <= 1 ? ", last deck" : ""}`, nextCategories = addCategory(categories, category, ok), nextMistakes = ok ? mistakes : [...mistakes, { question: "Decks remaining in the pictured tray", userAnswer: answer || "blank", correctAnswer: String(expected), explanation: `The tray contains ${(decks - remaining).toFixed(2)} decks discarded, leaving ${remaining.toFixed(2)} before rounding to ${resolution}-deck resolution.`, category: "deck estimate" as const }];
    setQuestion(nextQuestion); setCorrect(nextCorrect); setErrors(nextErrors); setCategories(nextCategories); setMistakes(nextMistakes);
    track("deck_estimation_answered", { ok, expected, actual, error, resolution });
    if (nextQuestion >= target) return finish(nextQuestion, nextCorrect, nextErrors, nextMistakes, nextCategories, remaining <= 1 ? Number(ok) * 100 : 0);
    if (feedbackMode === "immediate") { setMessage(ok ? `Correct: ${expected} decks remain` : `Target estimate: ${expected} decks`); setPhase("feedback"); } else newTray();
  };
  const finish = (askedCount = question, gotCorrect = correct, finalErrors = errors, finalMistakes = mistakes, finalCategories = categories, lastDeckAccuracy = 0) => {
    const mae = finalErrors.length ? finalErrors.reduce((a, b) => a + b, 0) / finalErrors.length : 0;
    const session = makeSession("Deck Estimation", askedCount, gotCorrect, totalMs.current, gotCorrect, finalMistakes, finalCategories, { meanAbsoluteDeckError: mae, lastDeckAccuracy, resolution }, ["real-photo"]);
    storage.addSession(session); storage.clearProgress("Deck Estimation"); setResult(session); setPhase("done");
  };
  const endDrill = () => finish();
  if (phase === "done" && result) return <SessionSummary session={result} onNew={() => setPhase("setup")} />;
  return <><Heading eyebrow="Visual drill" title="Deck Estimation" description="Read a real discard-tray photo at full-, half-, or quarter-deck resolution. The fill always represents cards already dealt, not cards remaining." />
    {phase === "setup" ? <Panel className="max-w-4xl"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Select label="Shoe" value={decks} onChange={(e) => setDecks(+e.target.value)}>{PHOTO_DECK_OPTIONS.map((x) => <option key={x} value={x}>{x} decks</option>)}</Select><Select label="Resolution" value={resolution} onChange={(e) => setResolution(+e.target.value as DeckResolution)}><option value="1">Full deck</option><option value="0.5">Half deck</option><option value="0.25">Quarter deck</option></Select><Select label="Feedback" value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value as typeof feedbackMode)}><option value="immediate">Immediate</option><option value="end">End of session</option></Select><p className="flex min-h-11 items-center rounded-xl bg-black/20 px-3 text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">{PHOTO_UNIQUE_COUNT} real discard-tray photos ({DECK_ESTIMATION_PHOTOS.length} recorded rounds) across {PHOTO_DECK_OPTIONS.join(", ")}-deck shoes.</p></div><Button className="mt-5 min-h-11" onClick={start}>Start {target} estimates</Button></Panel> : <div className="grid gap-5 lg:grid-cols-[1fr_18rem]"><Panel>{phase === "feedback" ? <div aria-live="polite" className="grid min-h-80 place-items-center text-center"><div><p className="text-2xl font-semibold">{message}</p><p className="mt-2 text-zinc-400">{(decks - remaining).toFixed(2)} decks are in the discard tray.</p><Button className="mt-5 min-h-11" onClick={newTray}>Next tray</Button></div></div> : <form className="mx-auto max-w-xl" onSubmit={(e) => { e.preventDefault(); submit(); }}>{photo && <div><img src={`/deck-estimation/${photo.file}`} alt="Discard tray" className="mx-auto max-h-80 rounded-2xl border border-white/15 bg-black/40 object-contain shadow-inner" /><p className="mt-2 text-center text-xs text-zinc-500">{decks}-deck shoe</p></div>}<label className="mx-auto mt-6 block max-w-xs text-center text-sm text-zinc-400">Decks remaining<input autoFocus inputMode="decimal" className={`${inputClass} mt-2`} value={answer} onChange={(e) => setAnswer(e.target.value)} /></label><Button className="mx-auto mt-4 hidden min-h-11 sm:block">Check estimate</Button><NumericPad decimal value={answer} onChange={setAnswer} onSubmit={submit} /></form>}</Panel><div className="space-y-3"><Metric label="Estimate" value={`${question + 1} / ${target}`} /><Metric label="Accuracy" value={`${question ? Math.round(correct / question * 100) : 0}%`} /><Metric label="Mean error" value={`${errors.length ? (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2) : "0.00"} decks`} /><GhostButton className="min-h-11 w-full" onClick={endDrill}>End drill</GhostButton></div></div>}
  </>;
}

type ShoePhase = "setup" | "bet" | "play" | "count" | "feedback" | "done";
type RoundAnswers = { deck: string; tc: string; bet: string; play?: DeviationAction; count: string };

export function FullShoeDrill() {
  const saved = storage.settings();
  const [decks, setDecks] = useState(saved.decks), [spots, setSpots] = useState(3), [penetration, setPenetration] = useState(saved.penetration), [baseBet, setBaseBet] = useState(10), [spread, setSpread] = useState<"1-4" | "1-8" | "1-12">("1-8"), [wongOut, setWongOut] = useState(true), [backCount, setBackCount] = useState(false), [burnCard, setBurnCard] = useState(true);
  const [phase, setPhase] = useState<ShoePhase>("setup"), shoe = useRef<BlackjackShoe | undefined>(undefined), [round, setRound] = useState<SimulatedRound | undefined>(undefined), [insuranceResolved, setInsuranceResolved] = useState(false), [rounds, setRounds] = useState(0), [rc, setRc] = useState(0), [answers, setAnswers] = useState<RoundAnswers>({ deck: "", tc: "", bet: "", count: "" });
  const [correct, setCorrect] = useState(0), [questions, setQuestions] = useState(0), [mistakes, setMistakes] = useState<Mistake[]>([]), [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>({}), [message, setMessage] = useState(""), [result, setResult] = useState<Session>();
  const started = useRef(0), rules: BlackjackRules = { decks, dealerHitsSoft17: saved.dealerHitsSoft17, doubleAfterSplit: saved.doubleAfterSplit, resplitAces: saved.resplitAces, lateSurrender: saved.lateSurrender, doubleRule: "any" };
  const decksRemaining = shoe.current?.decksRemaining() ?? decks, expectedDecks = roundDeckEstimate(decksRemaining, 0.5), currentTc = trueCount(rc, expectedDecks, saved.rounding), expectedWager = backCount ? 0 : expectedBet(currentTc, baseBet, spread, wongOut);
  const start = () => { const next = new BlackjackShoe(decks); let burn = 0; if (burnCard) { const card = next.deal(); if (card) burn = runningCount([card]); } shoe.current = next; setRc(burn); setRounds(0); setCorrect(0); setQuestions(0); setMistakes([]); setCategories({}); setRound(undefined); setAnswers({ deck: "", tc: "", bet: "", count: "" }); started.current = Date.now(); setPhase("bet"); track("drill_started", { drill: "Full Shoe", decks, spots, penetration, spread, wongOut, backCount }); };
  const record = (label: string, ok: boolean) => setCategories((all) => addCategory(all, label, ok));
  const submitBet = () => {
    if (!shoe.current) return; const deckOk = Math.abs(Number(answers.deck) - expectedDecks) < 0.001, tcOk = Number(answers.tc) === currentTc, betOk = Number(answers.bet || 0) === expectedWager;
    const gained = Number(deckOk) + Number(tcOk) + Number(betOk), added = 3; const nextMistakes = [...mistakes];
    if (!deckOk) nextMistakes.push({ question: `Deck estimate before round ${rounds + 1}`, userAnswer: answers.deck || "blank", correctAnswer: String(expectedDecks), explanation: "Use the discard tray to estimate the decks remaining.", category: "deck estimate" });
    if (!tcOk) nextMistakes.push({ question: `True count before round ${rounds + 1}`, userAnswer: answers.tc || "blank", correctAnswer: signed(currentTc), explanation: `${signed(rc)} ÷ ${expectedDecks}, using ${saved.rounding} rounding.`, category: classifyTrueCountError(rc, expectedDecks, currentTc, Number(answers.tc)) });
    if (!betOk) nextMistakes.push({ question: `Bet before round ${rounds + 1}`, userAnswer: answers.bet || "blank", correctAnswer: `$${expectedWager}`, explanation: wongOut && currentTc < 0 ? "The selected wong-out rule sets negative-count bets to zero." : `Apply the ${spread} ramp to a $${baseBet} unit.`, category: "bet sizing" });
    record("deck estimate", deckOk); record("true count", tcOk); record("bet sizing", betOk); setCorrect((x) => x + gained); setQuestions((x) => x + added); setMistakes(nextMistakes);
    track("full_shoe_drill_bet_submitted", { deckOk, tcOk, betOk, expectedWager, tc: currentTc, round: rounds + 1 });
    const dealt = simulateRound(shoe.current, spots, rules, currentTc); setRound(dealt); setInsuranceResolved(false); setPhase(backCount ? "count" : "play");
  };
  const chooseInsurance = (play: "I" | "N") => {
    if (!round?.insurancePlay) return;
    const ok = play === round.insurancePlay;
    record("insurance", ok); setQuestions((x) => x + 1); setCorrect((x) => x + Number(ok));
    if (!ok) setMistakes((all) => [...all, { question: `Insurance at TC ${signed(currentTc)}`, userAnswer: actionNames[play], correctAnswer: actionNames[round.insurancePlay!], explanation: "Hi-Lo insurance is taken at TC +3 or higher.", category: "playing decision" }]);
    setInsuranceResolved(true);
    track("full_shoe_drill_insurance_decision", { play, ok, tc: currentTc });
  };
  const choosePlay = (play: DeviationAction) => {
    if (!round) return; const ok = play === round.correctPlay; record(round.correctPlay !== round.basicPlay ? "index deviation" : "basic strategy", ok); setQuestions((x) => x + 1); setCorrect((x) => x + Number(ok)); setAnswers((x) => ({ ...x, play })); if (!ok) setMistakes((all) => [...all, { question: `${round.heroInitial.map((c) => c.rank).join(",")} vs ${round.dealerUpcard.rank} at TC ${signed(currentTc)}`, userAnswer: actionNames[play], correctAnswer: actionNames[round.correctPlay], explanation: round.explanation, category: "playing decision" }]); setPhase("count");
    track("full_shoe_drill_playing_decision", { play, correctPlay: round.correctPlay, ok, isDeviation: round.correctPlay !== round.basicPlay, tc: currentTc });
  };
  const submitCount = () => {
    if (!round || !shoe.current) return; const ending = rc + runningCount(round.exposedCards), ok = Number(answers.count) === ending; record("round-end count", ok); const nextQuestions = questions + 1, nextCorrect = correct + Number(ok), nextMistakes = ok ? mistakes : [...mistakes, { question: `Running count after round ${rounds + 1}`, userAnswer: answers.count || "blank", correctAnswer: signed(ending), explanation: `The full table and dealer reveal changed the count by ${signed(runningCount(round.exposedCards))}.`, category: "hole-card reveal" as const }]; setQuestions(nextQuestions); setCorrect(nextCorrect); setMistakes(nextMistakes); setRc(ending); setRounds((x) => x + 1); setMessage(ok ? `Count confirmed at ${signed(ending)}` : `Correct running count: ${signed(ending)}`); setPhase("feedback");
    track("full_shoe_drill_count_submitted", { ok, ending, round: rounds + 1 });
  };
  const continueRound = () => {
    if (!shoe.current) return; const cut = decks * 52 * (1 - penetration); if (shoe.current.cardsRemaining() <= cut || shoe.current.cardsRemaining() < spots * 2 + 12) { const session = makeSession("Full Shoe", questions, correct, Date.now() - started.current, correct, mistakes, categories, { roundsCompleted: rounds, cardsSeen: decks * 52 - shoe.current.cardsRemaining(), finalRunningCount: rc, penetration, backCount }, [spread, wongOut ? "wong-out-negative" : "play-all", `${spots}-spots`]); storage.addSession(session); setResult(session); setPhase("done"); } else { setRound(undefined); setAnswers({ deck: "", tc: "", bet: "", count: "" }); setPhase("bet"); }
  };
  if (phase === "done" && result) return <SessionSummary session={result} onNew={() => setPhase("setup")} />;
  return <><Heading eyebrow="Integrated simulation" title="Full Shoe" description="Maintain the count through complete multi-player rounds, estimate the tray, convert to true count, size the bet, and make basic-strategy or index plays." />
    {phase === "setup" ? <Panel><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Select label="Shoe" value={decks} onChange={(e) => setDecks(+e.target.value)}>{[1, 2, 4, 6, 8].map((x) => <option key={x}>{x} decks</option>)}</Select><Select label="Player spots" value={spots} onChange={(e) => setSpots(+e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((x) => <option key={x}>{x}</option>)}</Select><Select label="Penetration" value={penetration} onChange={(e) => setPenetration(+e.target.value)}>{[0.5, 0.6, 0.7, 0.75, 0.8, 0.85].map((x) => <option key={x} value={x}>{Math.round(x * 100)}%</option>)}</Select><Select label="Bet spread" value={spread} onChange={(e) => setSpread(e.target.value as typeof spread)}>{["1-4", "1-8", "1-12"].map((x) => <option key={x}>{x}</option>)}</Select><NumberField label="Base betting unit" value={baseBet} min={1} prefix="$" onValueChange={setBaseBet} />{[[wongOut, setWongOut, "Bet $0 at negative counts"], [backCount, setBackCount, "Back-count only"], [burnCard, setBurnCard, "Exposed burn card"]] .map(([checked, setter, label]) => <label key={String(label)} className="flex min-h-11 items-center gap-3 rounded-xl bg-black/20 px-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-emerald-500" checked={checked as boolean} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} />{String(label)}</label>)}</div><Button className="mt-5 min-h-11" onClick={start}>Shuffle and start</Button></Panel> : <div className="grid gap-5 lg:grid-cols-[1fr_19rem]"><Panel>
      {phase === "bet" && <form onSubmit={(e) => { e.preventDefault(); submitBet(); }}><TrayVisual totalDecks={decks} remainingDecks={decksRemaining} /><div className="mt-6 grid gap-4 sm:grid-cols-3"><label className="text-sm text-zinc-400">Decks remaining<input className={`${inputClass} mt-2`} inputMode="decimal" value={answers.deck} onChange={(e) => setAnswers({ ...answers, deck: e.target.value })} /></label><label className="text-sm text-zinc-400">True count<input className={`${inputClass} mt-2`} inputMode="numeric" value={answers.tc} onChange={(e) => setAnswers({ ...answers, tc: e.target.value })} /></label><label className="text-sm text-zinc-400">Bet amount<input className={`${inputClass} mt-2`} inputMode="numeric" value={answers.bet} onChange={(e) => setAnswers({ ...answers, bet: e.target.value })} /></label></div><Button className="mx-auto mt-5 block min-h-11">Deal round</Button></form>}
      {phase === "play" && round && <div><p className="text-center text-sm text-zinc-500">Dealer</p><div className="mt-2 flex justify-center gap-2"><PlayingCard card={round.dealerUpcard} /><PlayingCard hidden /></div><p className="mt-8 text-center text-sm text-zinc-500">Your hand</p><div className="mt-2 flex justify-center gap-2">{round.heroInitial.map((card, i) => <PlayingCard key={i} card={card} />)}</div>{round.insurancePlay && !insuranceResolved ? <div className="mt-7 text-center"><p className="mb-3 font-medium">Insurance?</p><div className="flex justify-center gap-2"><GhostButton className="min-h-11" onClick={() => chooseInsurance("I")}>Take insurance</GhostButton><GhostButton className="min-h-11" onClick={() => chooseInsurance("N")}>Decline insurance</GhostButton></div></div> : <div className="mt-7 flex flex-wrap justify-center gap-2">{(["H", "S", "D", "P", "R"] as Action[]).map((action) => <GhostButton className="min-h-11" key={action} onClick={() => choosePlay(action)}>{actionNames[action]}</GhostButton>)}</div>}</div>}
      {phase === "count" && round && <form onSubmit={(e) => { e.preventDefault(); submitCount(); }}><div className="space-y-6"><div><p className="text-center text-sm text-zinc-500">Dealer, hole card revealed</p><div className="mt-2 flex flex-wrap justify-center gap-2">{round.dealerHand.map((card, i) => <PlayingCard size="sm" key={i} card={card} />)}</div></div><div><p className="text-center text-sm text-zinc-500">All player hands</p><div className="mt-2 flex flex-wrap justify-center gap-5">{round.playerHands.map((hand, h) => <div key={h} className="flex -space-x-8">{hand.map((card, i) => <PlayingCard size="sm" key={i} card={card} />)}</div>)}</div></div></div><label className="mx-auto mt-7 block max-w-xs text-center text-sm text-zinc-400">Ending running count<input autoFocus className={`${inputClass} mt-2`} inputMode="numeric" value={answers.count} onChange={(e) => setAnswers({ ...answers, count: e.target.value })} /></label><Button className="mx-auto mt-4 block min-h-11">Check count</Button></form>}
      {phase === "feedback" && <div aria-live="polite" className="grid min-h-80 place-items-center text-center"><div><p className="text-2xl font-semibold">{message}</p><p className="mt-2 text-zinc-400">Next round starts with RC {signed(rc)}.</p><Button className="mt-5 min-h-11" onClick={continueRound}>Continue</Button></div></div>}
    </Panel><div className="space-y-3"><Metric label="Round" value={rounds + 1} /><Metric label="Cards remaining" value={shoe.current?.cardsRemaining() ?? 0} /><Metric label="Accuracy" value={`${questions ? Math.round(correct / questions * 100) : 0}%`} /><Panel><p className="text-xs leading-5 text-zinc-500">The running count is hidden during play. Complete rounds include hits, doubles, a single split, dealer draws, and the hole-card reveal.</p></Panel></div></div>}
  </>;
}

export function CountingBenchmark() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => { const load = () => setSessions(storage.sessions()); load(); addEventListener("hilo-storage", load); return () => removeEventListener("hilo-storage", load); }, []);
  const mastery = useMemo(() => countingMastery(sessions), [sessions]);
  return <><Heading eyebrow="Mastery check" title="Counting Benchmark" description="Use consistent performance targets to decide what to practice next. Results update from your saved drill history." /><div className="grid gap-5 lg:grid-cols-[18rem_1fr]"><Metric label="Counting mastery" value={`${mastery.score}%`} sub={mastery.score === 100 ? "All benchmarks met" : "Based on latest sessions"} /><Panel><div className="space-y-3">{mastery.checks.map((check) => <Link key={check.label} href={check.href} className="flex min-h-11 items-center justify-between rounded-xl bg-black/20 p-4 hover:bg-white/[.06]"><span>{check.label}</span><span className={check.met ? "text-emerald-400" : "text-amber-300"}>{check.met ? "Met" : "Practice"}</span></Link>)}</div>{mastery.score < 100 && <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><p className="text-sm text-zinc-400">Recommended next drill</p><Link className="mt-1 inline-block font-semibold text-emerald-300" href={mastery.next.href}>{mastery.next.label} →</Link></div>}</Panel></div></>;
}
