"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DoorOpen, SlidersHorizontal } from "lucide-react";
import { AnswerDisplay, NumberPad } from "@/components/blackjack";
import { DrillSetup, DrillSummary, Feedback, PlayDock, PlayFrame, SetupGroup } from "@/components/drill/DrillKit";
import { announce, Button, Card, cx, Segmented, Toggle } from "@/components/ui";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { answerText, drawTrueCount, explainBet, gradeBet, PRESET_RAMP, rampAnswer, rampFromConfig, rampSteps, spreadsHands, type BetRamp, type RampAnswer } from "@/lib/blackjack/betRamp";
import { fitQuestionTarget, QUESTION_TARGETS } from "@/lib/blackjack/countingSetup";
import { cvcxLibrary } from "@/lib/blackjack/cvcxLibrary";
import { configKey, DEFAULT_LAB_CONFIG, labDraftKey, normalizeConfig, parseLabDraft } from "@/lib/blackjack/labConfig";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import { stepRangeLabel, tcLabel, unitLabel } from "@/lib/blackjack/rampSteps";
import { useSessions } from "@/lib/hooks/useSessions";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { relativeTime } from "@/lib/statistics/drillRound";
import { makeSession, storage, type Mistake, type Session } from "@/lib/statistics/storage";
import { accountScope } from "@/lib/supabase/accountStorage";
import { readSetupMemory, writeSetupMemory } from "../counting-shared/hooks";
import { COMPACT_DISPLAY, COMPACT_PAD, SessionLine, verdict } from "../counting-shared/parts";

const DRILL = "Bet Ramp" as const;
const MEMORY_KEY = "countlab:drill-setup:bet-ramp";
type Setup = { target: number; showRamp: boolean; spots: boolean };
const DEFAULT_SETUP: Setup = { target: 10, showRamp: true, spots: false };
type Phase = "setup" | "question" | "feedback" | "done";
type Tally = { answered: number; correct: number; streak: number; best: number; totalMs: number; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }> };
const EMPTY: Tally = { answered: 0, correct: 0, streak: 0, best: 0, totalMs: 0, mistakes: [], categories: {} };

/**
 * The player's own ramp: the newest scenario saved in the Calculator, else the
 * one being worked on there in this tab (unless it is still the example),
 * else the 1–8 preset.
 */
function loadRamp(): BetRamp {
  try {
    const saved = cvcxLibrary.templates()[0];
    if (saved) return rampFromConfig(normalizeConfig(saved.config), saved.name);
    const draft = parseLabDraft(sessionStorage.getItem(labDraftKey(accountScope())));
    if (draft && configKey(draft.config) !== configKey(DEFAULT_LAB_CONFIG)) return rampFromConfig(draft.config, draft.draftName || "Calculator draft");
  } catch {
    // Storage can be unavailable (private windows); the preset still works.
  }
  return PRESET_RAMP;
}

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

export function BetRampDrill() {
  const sessions = useSessions(DRILL);
  const [ramp] = useState(loadRamp);
  const [setup, setSetup] = useState<Setup>(() => {
    const memory = readSetupMemory<Setup>(MEMORY_KEY);
    return { target: fitQuestionTarget(memory?.target ?? DEFAULT_SETUP.target), showRamp: memory?.showRamp ?? true, spots: memory?.spots === true };
  });
  const spots = setup.spots && spreadsHands(ramp);
  const [phase, setPhase] = useState<Phase>("setup");
  const [tc, setTc] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hands, setHands] = useState(1);
  const [reply, setReply] = useState<RampAnswer>();
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [result, setResult] = useState<Session>();
  const shownAt = useRef(0);
  const feedbackAt = useRef(0);
  useWakeLock(phase === "question" || phase === "feedback");

  const ask = (last?: number) => {
    const next = drawTrueCount(ramp, Math.random, last);
    setTc(next); setAnswer(""); setHands(1); setReply(undefined);
    shownAt.current = Date.now();
    setPhase("question");
    announce(`True count ${tcLabel(next)}. What do you bet?`);
  };
  const start = () => {
    writeSetupMemory<Setup>(MEMORY_KEY, setup);
    setTally(EMPTY); setResult(undefined);
    track("drill_started", { drill: DRILL, mode: ramp.source, questionTarget: setup.target });
    ask();
  };

  const finish = (final: Tally) => {
    const session = makeSession(DRILL, final.answered, final.correct, final.totalMs, final.best, final.mistakes, final.categories, { ramp: ramp.name, source: ramp.source, unit: ramp.unit, spots });
    storage.addSession(session);
    setResult(session);
  };

  const grade = (given: RampAnswer) => {
    const { ok, expected } = gradeBet(ramp, tc, given, spots);
    const ms = Date.now() - shownAt.current;
    const key = expected.leave ? "Leaving the table" : "Sizing the bet";
    const previous = tally.categories[key] ?? { correct: 0, total: 0 };
    const streak = ok ? tally.streak + 1 : 0;
    const next: Tally = {
      answered: tally.answered + 1, correct: tally.correct + Number(ok), streak, best: Math.max(tally.best, streak), totalMs: tally.totalMs + ms,
      mistakes: ok ? tally.mistakes : [...tally.mistakes, { question: `True count ${tcLabel(tc)}, ${money(ramp.unit)} unit`, userAnswer: answerText(given, spots), correctAnswer: answerText(expected, spots), explanation: explainBet(ramp, tc, spots), category: "bet sizing", context: { tc } }],
      categories: { ...tally.categories, [key]: { correct: previous.correct + Number(ok), total: previous.total + 1 } },
    };
    setTally(next);
    setReply(given);
    if (next.answered >= setup.target) finish(next);
    feedbackAt.current = Date.now();
    setPhase("feedback");
    announce(ok ? `Right: ${answerText(expected, spots)}.` : `Not quite: ${answerText(expected, spots)}.`);
  };
  const submit = () => {
    const parsed = parseAnswer(answer, "decimal");
    if (!parsed.ok) { announce(parsed.error); return; }
    grade({ leave: false, bet: parsed.value, hands });
  };
  const next = () => {
    if (Date.now() - feedbackAt.current < 250) return;
    if (result) { setPhase("done"); return; }
    ask(tc);
  };
  const exit = () => {
    if (result) { setPhase("done"); return; }
    if (tally.answered > 0) { finish(tally); setPhase("done"); return; }
    abandonActivePractice();
    setPhase("setup");
  };

  // On a keyboard, L leaves the table.
  useEffect(() => {
    if (phase !== "question") return;
    const onKey = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "l" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); grade({ leave: true }); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (phase === "done" && result) {
    return (
      <DrillSummary title="Bet Ramp" score={result.accuracy} scoreLabel="Bets right"
        scoreSub={<><span className="tnum font-semibold text-ink">{result.correct} of {result.questions}.</span> {verdict(result.accuracy)}</>}
        stats={[
          { label: "Answer time", value: `${(result.averageResponseTime / 1000).toFixed(1)} s` },
          { label: "Best streak", value: String(result.bestStreak) },
          { label: "Ramp", value: ramp.name },
          { label: "Unit", value: money(ramp.unit) },
        ]}
        mistakes={result.mistakes} onAgain={start} next={{ href: "/train/full-shoe", label: "Bet a whole shoe" }}>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={() => setPhase("setup")}>Change setup</Button>
        </div>
      </DrillSummary>
    );
  }

  if (phase === "question" || phase === "feedback") {
    const expected = rampAnswer(ramp, tc);
    const graded = reply && gradeBet(ramp, tc, reply, spots);
    return (
      <PlayFrame title="Bet Ramp" onExit={exit} streak={tally.streak} progress={{ done: phase === "feedback" ? tally.answered - 1 : tally.answered, answered: tally.answered, total: setup.target }}>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">True count</p>
              <p className="tnum text-4xl font-semibold leading-tight text-brand-text [@media(max-height:700px)]:text-3xl">{tcLabel(tc)}</p>
            </div>
            <div className="min-w-0 flex-1 border-l border-line pl-4">
              <p className="eyebrow">Unit</p>
              <p className="tnum text-4xl font-semibold leading-tight [@media(max-height:700px)]:text-3xl">{money(ramp.unit)}</p>
            </div>
          </div>
          {setup.showRamp || phase === "feedback" ? <RampTable ramp={ramp} tc={tc} spots={spots} highlight={phase === "feedback"} /> : (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-ink-3">Your {ramp.name} ramp, from memory.</p>
          )}
        </div>
        <PlayDock>
          <div className="mx-auto w-full max-w-md space-y-2">
            {phase === "question" ? (
              <>
                {spots && <Segmented<number> label="Hands" value={hands} onChange={setHands} options={[1, 2, 3].map((value) => ({ value, label: `${value} ${value === 1 ? "hand" : "hands"}` }))} />}
                <div className="flex gap-2">
                  <AnswerDisplay value={answer === "" ? "" : `$${answer}`} label={spots ? "Bet per hand" : "Bet"} className={cx("flex-1", COMPACT_DISPLAY)} />
                  <Button variant="secondary" className="h-16 shrink-0 [@media(max-height:700px)]:h-12" onClick={() => grade({ leave: true })} icon={<DoorOpen size={18} aria-hidden />}
                    aria-keyshortcuts="l">Leave</Button>
                </div>
                <NumberPad value={answer} onChange={setAnswer} onSubmit={submit} allowNegative={false} allowDecimal={!Number.isInteger(ramp.unit)} maxLength={6} submitLabel="Bet" className={COMPACT_PAD} />
              </>
            ) : graded && reply && (
              <Feedback ok={graded.ok} title={graded.ok ? `Right: ${answerText(expected, spots)}` : answerText(expected, spots)} onContinue={next} continueLabel={result ? "See results" : "Next count"}>
                {!graded.ok && <span className="block">You said {answerText(reply, spots).replace(/^Leave/, "leave")}.</span>}
                <span className="block">{explainBet(ramp, tc, spots)}</span>
              </Feedback>
            )}
          </div>
        </PlayDock>
      </PlayFrame>
    );
  }

  const last = sessions[0];
  return (
    <DrillSetup
      title="Bet Ramp"
      intro="See the true count and your betting unit, then size the bet from your ramp. Where the ramp sits out, the answer is to leave the table."
      onStart={start}
      startLabel={`Start ${setup.target} counts`}
      aside={
        <Card>
          <h2 className="text-base font-semibold">Your recent rounds</h2>
          <p className="mt-1 text-sm leading-6 text-ink-2">{last ? `${last.accuracy}% of ${last.questions}, ${relativeTime(last.date)}.` : "No rounds yet."}</p>
        </Card>
      }
    >
      <SetupGroup title="Your ramp" hint={ramp.source === "calculator"
        ? <>From your Calculator scenario <span className="font-semibold text-ink">{ramp.name}</span>. Change it there.</>
        : <>A 1–8 spread on a $25 unit. <Link href="/calculator" className="font-semibold text-brand-text hover:underline">Save a game in the Calculator</Link> to drill your own.</>}>
        <RampTable ramp={ramp} spots={spreadsHands(ramp)} />
      </SetupGroup>
      <SetupGroup title="Round">
        <div className="space-y-4">
          <Segmented<number> label="Counts" value={setup.target} onChange={(target) => setSetup((current) => ({ ...current, target }))}
            options={QUESTION_TARGETS.map((target) => ({ value: target, label: String(target) }))} />
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
            <Toggle label="Show the ramp while I answer" description="Turn it off to bet from memory, as you will at the table." checked={setup.showRamp} onChange={(showRamp) => setSetup((current) => ({ ...current, showRamp }))} />
            <Toggle label="Ask how many hands too" disabled={!spreadsHands(ramp)}
              description={spreadsHands(ramp) ? "Your ramp spreads to more hands at high counts: give the hands and the bet on each." : "Your ramp plays one hand at every count. Set more hands in the Calculator to practise spreading."}
              checked={spots} onChange={(value) => setSetup((current) => ({ ...current, spots: value }))} />
          </div>
        </div>
      </SetupGroup>
      <SessionLine parts={[`${setup.target} true counts`, `${ramp.name} ramp on a ${money(ramp.unit)} unit`, setup.showRamp ? "ramp on screen" : "ramp from memory", spots ? "hands and bet" : "bet only"]} />
    </DrillSetup>
  );
}

/** The ramp as steps: the counts, the bet, and (when they vary) the hands. The current count's step is marked. */
function RampTable({ ramp, tc, spots, highlight = false }: { ramp: BetRamp; tc?: number; spots: boolean; highlight?: boolean }) {
  const steps = rampSteps(ramp);
  const inStep = (from: number, to: number) => tc !== undefined && Math.max(-8, Math.min(8, tc)) >= from && Math.max(-8, Math.min(8, tc)) <= to;
  const leaving = tc !== undefined && rampAnswer(ramp, tc).leave;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface text-sm">
      {ramp.playFrom !== null && (
        <li className={cx("flex items-center justify-between gap-3 px-3.5 py-2 [@media(max-height:700px)]:py-1", highlight && leaving && "bg-brand/15 font-semibold")}>
          <span className="tnum text-ink-2">Below {tcLabel(ramp.playFrom)}</span>
          <span className="font-medium">Leave the table</span>
        </li>
      )}
      {steps.map((step) => (
        <li key={step.from} className={cx("flex items-center justify-between gap-3 px-3.5 py-2 [@media(max-height:700px)]:py-1", highlight && !leaving && inStep(step.from, step.to) && "bg-brand/15 font-semibold")}>
          <span className="tnum text-ink-2">{stepRangeLabel(step)}</span>
          <span className="tnum font-medium">
            {step.units <= 0 ? "Sit out" : `${unitLabel(step.units)} ${step.units === 1 ? "unit" : "units"} · ${money(step.units * ramp.unit)}${spots && step.hands > 1 ? ` × ${step.hands} hands` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
