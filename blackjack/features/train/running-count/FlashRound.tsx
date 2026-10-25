"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AnswerDisplay, NumberPad } from "@/components/blackjack";
import { DrillSummary, Feedback, PlayDock, PlayFrame } from "@/components/drill/DrillKit";
import { announce, Button } from "@/components/ui";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { classifyCountError, countMissExplanation, makeCountSequence } from "@/lib/blackjack/countingTraining";
import { flashCardCount, type FlashSetup } from "@/lib/blackjack/countingSetup";
import { runningCount, signed } from "@/lib/blackjack/hiLo";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import type { Card } from "@/lib/blackjack/types";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { makeSession, storage, type Mistake, type Session } from "@/lib/statistics/storage";
import { useReducedMotion } from "../counting-shared/hooks";
import { Breakdown, CauseCard, COMPACT_DISPLAY, COMPACT_PAD, displayMistakes, signedText, verdict } from "../counting-shared/parts";
import { CardGroupView, ReadyCountdown } from "./RunningStage";

const DRILL = "Running Count" as const;
type Phase = "ready" | "show" | "answer" | "feedback" | "done";
type Tally = { answered: number; correct: number; streak: number; best: number; totalMs: number; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }> };
const EMPTY: Tally = { answered: 0, correct: 0, streak: 0, best: 0, totalMs: 0, mistakes: [], categories: {} };

/**
 * Flash counting: a few cards appear for a moment and are taken away, and the
 * answer is their net Hi-Lo count. It trains reading a group at a glance,
 * which is what a live table asks for. Short and unsaved until it ends.
 * shortcut: no resume after a reload; a round is a minute or two, add saved progress if they grow.
 */
export function FlashRound({ setup, onSetup }: { setup: FlashSetup; onSetup: () => void }) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ready");
  const [cards, setCards] = useState<Card[]>([]);
  const [answer, setAnswer] = useState("");
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [last, setLast] = useState<{ ok: boolean; expected: number; given: number }>();
  const [result, setResult] = useState<Session>();
  const [round, setRound] = useState(0);
  const answerStart = useRef(0);
  const feedbackAt = useRef(0);
  useWakeLock(phase !== "done");

  const deal = useCallback(() => {
    setCards(makeCountSequence(1, flashCardCount(setup.size)));
    setAnswer("");
    setPhase("show");
  }, [setup.size]);
  // The cards stay up for the flash time, then the question replaces them.
  useEffect(() => {
    if (phase !== "show") return;
    const id = window.setTimeout(() => { answerStart.current = Date.now(); setPhase("answer"); announce("What was their count?"); }, setup.ms);
    return () => window.clearTimeout(id);
  }, [phase, setup.ms]);

  const finish = (final: Tally) => {
    const session = makeSession(DRILL, final.answered, final.correct, final.totalMs, final.best, final.mistakes, final.categories, { flash: true, flashMs: setup.ms, flashSize: String(setup.size) }, ["flash"]);
    storage.addSession(session);
    setResult(session);
    return session;
  };

  const submit = () => {
    const parsed = parseAnswer(answer, "signed-int");
    if (!parsed.ok) { announce(parsed.error); return; }
    const expected = runningCount(cards);
    const ok = parsed.value === expected;
    const ms = Date.now() - answerStart.current;
    const key = `flash, ${cards.length} cards`;
    const category = ok ? undefined : classifyCountError({ expected, actual: parsed.value, cards });
    const previous = tally.categories[key] ?? { correct: 0, total: 0 };
    const streak = ok ? tally.streak + 1 : 0;
    const next: Tally = {
      answered: tally.answered + 1, correct: tally.correct + Number(ok), streak, best: Math.max(tally.best, streak), totalMs: tally.totalMs + ms,
      mistakes: ok || !category ? tally.mistakes : [...tally.mistakes, {
        question: `Flash of ${cards.length}: ${cards.map((card) => card.rank).join(" ")}`,
        userAnswer: signed(parsed.value), correctAnswer: signed(expected),
        explanation: countMissExplanation({ expected, actual: parsed.value, category }), category,
      }],
      categories: { ...tally.categories, [key]: { correct: previous.correct + Number(ok), total: previous.total + 1 } },
    };
    setTally(next);
    setLast({ ok, expected, given: parsed.value });
    track("running_count_answered", { ok, expected, actual: parsed.value, group: "flash", checkpoint: "flash", category, responseTimeMs: ms, attempt: next.answered, streak });
    if (next.answered >= setup.target) finish(next);
    feedbackAt.current = Date.now();
    setPhase("feedback");
    announce(ok ? `Right: ${signedText(expected)}.` : `The count was ${signedText(expected)}.`);
  };

  const next = () => {
    if (Date.now() - feedbackAt.current < 250) return;
    if (result) { setPhase("done"); return; }
    deal();
  };

  const again = () => { setTally(EMPTY); setResult(undefined); setLast(undefined); setRound((value) => value + 1); setPhase("ready"); };
  const exit = () => {
    if (result) { setPhase("done"); return; }
    if (tally.answered > 0) { finish(tally); setPhase("done"); return; }
    abandonActivePractice();
    onSetup();
  };

  if (phase === "done" && result) {
    return (
      <DrillSummary title="Flash counting" score={result.accuracy} scoreLabel="Flashes right"
        scoreSub={<><span className="tnum font-semibold text-ink">{result.correct} of {result.questions}.</span> {verdict(result.accuracy)}</>}
        stats={[
          { label: "Answer time", value: `${(result.averageResponseTime / 1000).toFixed(1)} s` },
          { label: "Best streak", value: String(result.bestStreak) },
          { label: "Shown for", value: `${setup.ms} ms` },
          { label: "Cards each", value: setup.size === "mixed" ? "2–6" : String(setup.size) },
        ]}
        mistakes={displayMistakes(result.mistakes)} onAgain={again}>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={onSetup}>Change setup</Button>
        </div>
        <CauseCard mistakes={result.mistakes} />
        <Breakdown categories={result.categories} />
      </DrillSummary>
    );
  }

  const shown = phase === "show" || phase === "feedback";
  return (
    <PlayFrame title="Flash counting" onExit={exit} streak={tally.streak} progress={{ done: phase === "feedback" ? tally.answered - 1 : tally.answered, answered: tally.answered, total: setup.target, unit: "Flash" }}>
      <section aria-label="Table" className="relative flex min-h-[15rem] flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl bg-felt px-3 py-4 shadow-[inset_0_2px_30px_rgb(0_0_0/0.35)]">
        {phase === "ready" && <ReadyCountdown key={round} reducedMotion={reducedMotion} onDone={deal} />}
        {/* No deal animation: every card is on the felt for the whole flash. */}
        {shown && <CardGroupView cards={cards} seed={tally.answered} animate={false} hints={phase === "feedback"} />}
        {phase === "answer" && <p className="text-center text-xl font-semibold text-white">What was their count?</p>}
      </section>
      <PlayDock>
        <div className="mx-auto w-full max-w-md space-y-2">
          {phase === "answer" && (
            <>
              <AnswerDisplay value={answer} label="Net count" className={COMPACT_DISPLAY} />
              <NumberPad value={answer} onChange={setAnswer} onSubmit={submit} maxLength={2} submitLabel="Check" className={COMPACT_PAD} />
            </>
          )}
          {phase === "feedback" && last && (
            <Feedback ok={last.ok} title={last.ok ? `Right: ${signedText(last.expected)}` : `The count was ${signedText(last.expected)}`} onContinue={next} continueLabel={result ? "See results" : "Next flash"}>
              {!last.ok && <span className="block">You said {signedText(last.given)}.</span>}
            </Feedback>
          )}
          {(phase === "ready" || phase === "show") && <p className="py-3 text-center text-sm text-ink-3">Watch the cards: they go in {setup.ms} ms.</p>}
        </div>
      </PlayDock>
    </PlayFrame>
  );
}
