"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PlayingCard } from "./PlayingCard";
import { Button, GhostButton, Metric, MobileActionDock, Panel } from "./ui";
import { addCategory, inputClass, NumericPad, TrayVisual } from "./DrillKit";
import {
  buildQuestionStage,
  gradeAnswer,
  shoeTrueCount,
  type ExamQuestion,
} from "@/lib/blackjack/examQuestions";
import { expectedBet, roundDeckEstimate, simulateRound, type SimulatedRound } from "@/lib/blackjack/countingTraining";
import { DEVIATION_ACTION_NAMES, type DeviationAction } from "@/lib/blackjack/deviations";
import { runningCount, signed } from "@/lib/blackjack/hiLo";
import { BlackjackShoe } from "@/lib/blackjack/shoe";
import { sectionMeta, toBlackjackRules, type ExamRules, type ExamSectionConfig, type SectionRun } from "@/lib/blackjack/testOut";
import type { Mistake } from "@/lib/statistics/storage";
import { track } from "@/lib/analytics/track";

/**
 * A section's running tally.
 *
 * Held in a ref rather than state so the countdown's `finish` reads what has
 * actually been scored. The retired proficiency test kept these in state and
 * finished from a stale closure, which silently dropped the last answer
 * whenever a run ended on the clock or on its final question.
 */
interface Tally {
  presented: number;
  correct: number;
  streak: number;
  bestStreak: number;
  mistakes: Mistake[];
  categories: Record<string, { correct: number; total: number }>;
  roundsCompleted: number;
}

const emptyTally = (): Tally => ({
  presented: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  mistakes: [],
  categories: {},
  roundsCompleted: 0,
});

function score(tally: Tally, correct: boolean, category: string, mistake?: Mistake) {
  tally.presented += 1;
  tally.correct += Number(correct);
  tally.streak = correct ? tally.streak + 1 : 0;
  tally.bestStreak = Math.max(tally.bestStreak, tally.streak);
  tally.categories = addCategory(tally.categories, category, correct);
  if (!correct && mistake) tally.mistakes.push(mistake);
}

export const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

/**
 * One section's clock. Returns the seconds left, or null when the section is
 * untimed. Fires `onExpire` exactly once.
 */
function useSectionClock(limitSeconds: number | null, active: boolean, onExpire: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(limitSeconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    if (!active || limitSeconds === null) return;
    // Counted against a fixed deadline rather than decremented, for two
    // reasons: a throttled background tab cannot hand back time the taker did
    // not have, and the expiry callback fires from the interval rather than
    // from inside a state updater. React runs updaters during render, so
    // finishing the section from one updated the parent mid-render.
    const deadline = Date.now() + limitSeconds * 1000;
    let fired = false;
    const timer = setInterval(() => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
      if (remaining > 0 || fired) return;
      fired = true;
      clearInterval(timer);
      expire.current();
    }, 250);
    return () => clearInterval(timer);
  }, [active, limitSeconds]);
  return limitSeconds === null ? null : secondsLeft;
}

function StageFrame({
  label,
  progress,
  secondsLeft,
  accuracy,
  onAbandon,
  children,
  dock,
}: {
  label: string;
  progress: string;
  secondsLeft: number | null;
  accuracy: number;
  onAbandon: () => void;
  children: React.ReactNode;
  dock?: React.ReactNode;
}) {
  return <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
    <Panel className="order-2 lg:order-1">{children}</Panel>
    {dock}
    <div className="order-1 grid grid-cols-2 gap-3 lg:order-2 lg:block lg:space-y-3">
      <Metric label="Section" value={label} />
      <Metric label={progress.includes("/") ? "Question" : "Progress"} value={progress} />
      {secondsLeft !== null && <Metric label="Time left" value={formatClock(secondsLeft)} />}
      <Metric label="Accuracy" value={`${accuracy}%`} />
      <GhostButton className="col-span-2 min-h-11 w-full lg:col-span-1" onClick={onAbandon}>End exam</GhostButton>
    </div>
  </div>;
}

/**
 * A pre-generated section: counting, estimation, conversion, basic strategy,
 * deviations or betting.
 *
 * No feedback is shown between questions and there is no way back — an exam
 * measures what you already know, so every explanation waits for the report.
 */
export function QuestionStage({
  section,
  rules,
  onComplete,
  onAbandon,
}: {
  section: ExamSectionConfig;
  rules: ExamRules;
  onComplete: (run: SectionRun) => void;
  onAbandon: () => void;
}) {
  const meta = sectionMeta(section.id);
  const [questions] = useState(() => buildQuestionStage(section, rules));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [dealt, setDealt] = useState(0);
  const tally = useRef(emptyTally());
  const startedAt = useRef(Date.now());
  const done = useRef(false);
  const question = questions[index];

  const finish = (timedOut: boolean) => {
    if (done.current) return;
    done.current = true;
    const current = tally.current;
    onComplete({
      section: section.id,
      presented: current.presented,
      correct: current.correct,
      elapsedMs: Date.now() - startedAt.current,
      timedOut,
      bestStreak: current.bestStreak,
      mistakes: current.mistakes,
      categories: current.categories,
    });
  };

  const secondsLeft = useSectionClock(section.timeLimitSeconds, !done.current, () => finish(true));

  // Deal the counting sequence one card at a time before asking for the count.
  const isDealing = question?.prompt.kind === "count-sequence" && dealt < question.prompt.cards.length;
  useEffect(() => {
    if (question?.prompt.kind !== "count-sequence") return;
    if (dealt >= question.prompt.cards.length) return;
    const speed = question.prompt.speedMs;
    const timer = setTimeout(() => setDealt((value) => value + 1), speed);
    return () => clearTimeout(timer);
  }, [question, dealt]);

  useEffect(() => {
    if (question) track("question_presented", { drill: "Test Out", category: question.category, scenario: section.id, attempt: index + 1 });
  }, [question, index, section.id]);

  const submit = (raw: string) => {
    if (!question || done.current || isDealing) return;
    const correct = gradeAnswer(question, raw);
    score(tally.current, correct, question.category, {
      question: question.question,
      userAnswer: raw.trim() || "blank",
      correctAnswer: question.correctLabel,
      explanation: question.explanation,
      category: question.errorCategory,
      context: { section: meta.label },
    });
    const next = index + 1;
    setAnswer("");
    setDealt(0);
    if (next >= questions.length) return finish(false);
    setIndex(next);
  };

  if (!question) return null;
  const accuracy = tally.current.presented
    ? Math.round((tally.current.correct / tally.current.presented) * 100)
    : 0;

  return <StageFrame
    label={meta.label}
    progress={`${index + 1} / ${questions.length}`}
    secondsLeft={secondsLeft}
    accuracy={accuracy}
    onAbandon={onAbandon}
    dock={question.prompt.kind === "decision"
      ? <MobileActionDock label={`${meta.label} actions`}>
        <div className="grid grid-cols-2 gap-2">
          {question.prompt.actions.map((action) => (
            <GhostButton key={action} onClick={() => submit(action)}>{DEVIATION_ACTION_NAMES[action]}</GhostButton>
          ))}
        </div>
      </MobileActionDock>
      : undefined}
  >
    <QuestionBody question={question} dealt={dealt} answer={answer} onAnswer={setAnswer} onSubmit={submit} />
  </StageFrame>;
}

function QuestionBody({
  question,
  dealt,
  answer,
  onAnswer,
  onSubmit,
}: {
  question: ExamQuestion;
  dealt: number;
  answer: string;
  onAnswer: (value: string) => void;
  onSubmit: (raw: string) => void;
}) {
  const { prompt } = question;

  if (prompt.kind === "count-sequence") {
    const dealing = dealt < prompt.cards.length;
    const card = prompt.cards[Math.min(dealt, prompt.cards.length - 1)];
    return dealing
      ? <div className="grid min-h-80 place-items-center text-center">
        <div>
          <div className="flex justify-center"><PlayingCard card={card} animated /></div>
          <p className="mt-6 text-sm text-zinc-500">Card {dealt + 1} of {prompt.cards.length}</p>
        </div>
      </div>
      : <form className="mx-auto max-w-sm py-6 text-center sm:py-14" onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}>
        <h2 className="text-xl font-semibold">Running count after {prompt.cards.length} cards?</h2>
        <input autoFocus inputMode="numeric" aria-label="Running count" className={`${inputClass} mt-5`} value={answer} onChange={(event) => onAnswer(event.target.value)} />
        <Button className="mt-4 hidden min-h-11 w-full sm:block">Submit</Button>
        <NumericPad value={answer} onChange={onAnswer} onSubmit={() => onSubmit(answer)} />
      </form>;
  }

  if (prompt.kind === "tray") {
    return <form className="mx-auto max-w-xl" onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}>
      <Image src={`/deck-estimation/${prompt.file}`} alt="Discard tray" width={640} height={480} unoptimized className="mx-auto max-h-80 w-auto rounded-2xl border border-white/15 bg-black/40 object-contain shadow-inner" />
      <p className="mt-2 text-center text-xs text-zinc-500">{prompt.totalDecks}-deck shoe</p>
      <label className="mx-auto mt-6 block max-w-xs text-center text-sm text-zinc-400">Decks remaining
        <input autoFocus inputMode="decimal" className={`${inputClass} mt-2`} value={answer} onChange={(event) => onAnswer(event.target.value)} />
      </label>
      <Button className="mx-auto mt-4 hidden min-h-11 sm:block">Submit</Button>
      <NumericPad decimal value={answer} onChange={onAnswer} onSubmit={() => onSubmit(answer)} />
    </form>;
  }

  if (prompt.kind === "true-count") {
    const { scenario } = prompt;
    return <form onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}>
      <div className="grid gap-6 md:grid-cols-2">
        <TrayVisual totalDecks={scenario.totalDecks} remainingDecks={scenario.exactDecksRemaining} />
        {/* Labelled as one group: read as three separate paragraphs, a screen
            reader gives the number and the divisor with nothing tying them
            into a question. */}
        <div
          className="grid place-items-center rounded-2xl bg-black/20 p-6 text-center"
          aria-label={`Running count ${signed(scenario.runningCount)} with ${scenario.estimatedDecksRemaining} decks remaining`}
        >
          <div>
            <p className="text-sm text-zinc-500" aria-hidden="true">Running count</p>
            <p className="mt-2 text-6xl font-semibold" aria-hidden="true">{signed(scenario.runningCount)}</p>
            <p className="mt-3 text-zinc-400" aria-hidden="true">Estimated decks remaining: {scenario.estimatedDecksRemaining}</p>
          </div>
        </div>
      </div>
      <label className="mx-auto mt-7 block max-w-xs text-center text-sm text-zinc-400">True count
        <input autoFocus inputMode="numeric" className={`${inputClass} mt-2`} value={answer} onChange={(event) => onAnswer(event.target.value)} />
      </label>
      <Button className="mx-auto mt-4 hidden min-h-11 sm:block">Submit</Button>
      <NumericPad value={answer} onChange={onAnswer} onSubmit={() => onSubmit(answer)} />
    </form>;
  }

  if (prompt.kind === "bet") {
    return <form className="mx-auto max-w-sm py-6 text-center sm:py-14" onSubmit={(event) => { event.preventDefault(); onSubmit(answer); }}>
      <p className="text-sm text-zinc-500">True count</p>
      <p className="mt-2 text-6xl font-semibold">{signed(prompt.trueCount)}</p>
      <p className="mt-3 text-zinc-400">{prompt.spread} spread on a ${prompt.baseBet} unit</p>
      <label className="mt-6 block text-sm text-zinc-400">Bet amount
        <input autoFocus inputMode="numeric" className={`${inputClass} mt-2`} value={answer} onChange={(event) => onAnswer(event.target.value)} />
      </label>
      <Button className="mt-4 hidden min-h-11 w-full sm:block">Submit</Button>
      <NumericPad value={answer} onChange={onAnswer} onSubmit={() => onSubmit(answer)} />
    </form>;
  }

  const insurance = prompt.player.length === 0;
  return <div>
    <p className="text-center text-sm text-zinc-500">Dealer</p>
    <div className="mt-2 flex justify-center gap-2"><PlayingCard card={prompt.dealer} /><PlayingCard hidden /></div>
    {!insurance && <>
      <p className="mt-8 text-center text-sm text-zinc-500">Your hand</p>
      <div className="mt-2 flex justify-center gap-2">{prompt.player.map((card, position) => <PlayingCard key={position} card={card} />)}</div>
    </>}
    {prompt.trueCount !== null && <p className="mt-6 text-center text-zinc-400">True count <b className="text-white">{signed(prompt.trueCount)}</b></p>}
    {insurance && <p className="mt-6 text-center font-medium">Insurance?</p>}
    <div className="mt-6 hidden flex-wrap justify-center gap-2 lg:flex">
      {prompt.actions.map((action) => (
        <GhostButton className="min-h-11" key={action} onClick={() => onSubmit(action)}>{DEVIATION_ACTION_NAMES[action]}</GhostButton>
      ))}
    </div>
  </div>;
}

type ShoePhase = "bet" | "insurance" | "play" | "count";

/**
 * The capstone: a live shoe scored at the same checkpoints as the Full Shoe
 * drill — tray estimate, true count, bet, insurance where it comes up, the
 * playing decision, and the running count after the reveal.
 */
export function ShoeStage({
  section,
  rules,
  onComplete,
  onAbandon,
}: {
  section: ExamSectionConfig;
  rules: ExamRules;
  onComplete: (run: SectionRun) => void;
  onAbandon: () => void;
}) {
  const meta = sectionMeta(section.id);
  const tableRules = toBlackjackRules(rules);
  const shoe = useRef<BlackjackShoe>(undefined as unknown as BlackjackShoe);
  if (!shoe.current) shoe.current = new BlackjackShoe(rules.decks);
  const [phase, setPhase] = useState<ShoePhase>("bet");
  const [round, setRound] = useState<SimulatedRound>();
  const [rounds, setRounds] = useState(0);
  const [rc, setRc] = useState(0);
  const [answers, setAnswers] = useState({ deck: "", tc: "", bet: "", count: "" });
  const tally = useRef(emptyTally());
  const startedAt = useRef(Date.now());
  const done = useRef(false);

  const decksRemaining = shoe.current.decksRemaining();
  const expectedDecks = roundDeckEstimate(decksRemaining, rules.deckResolution);
  const currentTc = shoeTrueCount(rules, rc, decksRemaining);
  const expectedWager = expectedBet(currentTc, rules.baseBet, rules.spread, rules.wongOutNegative);

  const finish = (timedOut: boolean) => {
    if (done.current) return;
    done.current = true;
    const current = tally.current;
    onComplete({
      section: section.id,
      presented: current.presented,
      correct: current.correct,
      elapsedMs: Date.now() - startedAt.current,
      timedOut,
      bestStreak: current.bestStreak,
      mistakes: current.mistakes,
      categories: current.categories,
      roundsCompleted: current.roundsCompleted,
    });
  };

  const secondsLeft = useSectionClock(section.timeLimitSeconds, !done.current, () => finish(true));

  const submitBet = () => {
    if (done.current) return;
    const deckOk = Math.abs(Number(answers.deck) - expectedDecks) < 0.001;
    const tcOk = answers.tc.trim() !== "" && Number(answers.tc) === currentTc;
    const betOk = answers.bet.trim() !== "" && Number(answers.bet) === expectedWager;
    score(tally.current, deckOk, "deck estimate", {
      question: `Deck estimate before round ${rounds + 1}`,
      userAnswer: answers.deck || "blank",
      correctAnswer: String(expectedDecks),
      explanation: "Read the discard tray, then round to the exam's resolution.",
      category: "deck estimate",
    });
    score(tally.current, tcOk, "true count", {
      question: `True count before round ${rounds + 1}`,
      userAnswer: answers.tc || "blank",
      correctAnswer: signed(currentTc),
      explanation: `${signed(rc)} ÷ ${expectedDecks}, using ${rules.rounding} rounding.`,
      category: "true-count division",
    });
    score(tally.current, betOk, "bet sizing", {
      question: `Bet before round ${rounds + 1}`,
      userAnswer: answers.bet || "blank",
      correctAnswer: `$${expectedWager}`,
      explanation: rules.wongOutNegative && currentTc < 0
        ? "The wong-out rule sets negative-count bets to zero."
        : `Apply the ${rules.spread} ramp to a $${rules.baseBet} unit.`,
      category: "bet sizing",
    });
    const dealt = simulateRound(shoe.current, rules.spots, tableRules, currentTc);
    setRound(dealt);
    setPhase(dealt.insurancePlay ? "insurance" : "play");
  };

  const chooseInsurance = (play: "I" | "N") => {
    if (!round?.insurancePlay || done.current) return;
    score(tally.current, play === round.insurancePlay, "insurance", {
      question: `Insurance at TC ${signed(currentTc)}`,
      userAnswer: DEVIATION_ACTION_NAMES[play],
      correctAnswer: DEVIATION_ACTION_NAMES[round.insurancePlay],
      explanation: "Hi-Lo takes insurance at a true count of +3 or higher.",
      category: "playing decision",
    });
    setPhase("play");
  };

  const choosePlay = (play: DeviationAction) => {
    if (!round || done.current) return;
    const isDeviation = round.correctPlay !== round.basicPlay;
    score(tally.current, play === round.correctPlay, isDeviation ? "index deviation" : "basic strategy", {
      question: `${round.heroInitial.map((card) => card.rank).join(",")} vs ${round.dealerUpcard.rank} at TC ${signed(currentTc)}`,
      userAnswer: DEVIATION_ACTION_NAMES[play],
      correctAnswer: DEVIATION_ACTION_NAMES[round.correctPlay],
      explanation: round.explanation,
      category: "playing decision",
    });
    setPhase("count");
  };

  const submitCount = () => {
    if (!round || done.current) return;
    const ending = rc + runningCount(round.exposedCards);
    score(tally.current, answers.count.trim() !== "" && Number(answers.count) === ending, "round-end count", {
      question: `Running count after round ${rounds + 1}`,
      userAnswer: answers.count || "blank",
      correctAnswer: signed(ending),
      explanation: `The full table and the hole-card reveal moved the count by ${signed(runningCount(round.exposedCards))}.`,
      category: "hole-card reveal",
    });
    tally.current.roundsCompleted += 1;
    const nextRounds = rounds + 1;
    setRc(ending);
    setRounds(nextRounds);
    setAnswers({ deck: "", tc: "", bet: "", count: "" });
    setRound(undefined);
    const cut = rules.decks * 52 * (1 - rules.penetration);
    const exhausted = shoe.current.cardsRemaining() <= cut || shoe.current.cardsRemaining() < rules.spots * 2 + 12;
    // Reaching the cut card before the configured rounds is the shoe's own
    // limit, not the taker's failure, so it ends the section normally.
    if (nextRounds >= section.questions || exhausted) return finish(false);
    setPhase("bet");
  };

  const accuracy = tally.current.presented
    ? Math.round((tally.current.correct / tally.current.presented) * 100)
    : 0;
  const actions: DeviationAction[] = ["H", "S", "D", "P", "R"];

  return <StageFrame
    label={meta.label}
    progress={`Round ${Math.min(rounds + 1, section.questions)} / ${section.questions}`}
    secondsLeft={secondsLeft}
    accuracy={accuracy}
    onAbandon={onAbandon}
    dock={phase === "play" || phase === "insurance"
      ? <MobileActionDock label="Shoe actions">
        <div className="grid grid-cols-2 gap-2">
          {phase === "insurance"
            ? <>
              <GhostButton onClick={() => chooseInsurance("I")}>Take insurance</GhostButton>
              <GhostButton onClick={() => chooseInsurance("N")}>Decline insurance</GhostButton>
            </>
            : actions.map((action) => <GhostButton key={action} onClick={() => choosePlay(action)}>{DEVIATION_ACTION_NAMES[action]}</GhostButton>)}
        </div>
      </MobileActionDock>
      : undefined}
  >
    {phase === "bet" && <form onSubmit={(event) => { event.preventDefault(); submitBet(); }}>
      <TrayVisual totalDecks={rules.decks} remainingDecks={decksRemaining} />
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="text-sm text-zinc-400">Decks remaining
          <input className={`${inputClass} mt-2`} inputMode="decimal" value={answers.deck} onChange={(event) => setAnswers({ ...answers, deck: event.target.value })} />
        </label>
        <label className="text-sm text-zinc-400">True count
          <input className={`${inputClass} mt-2`} inputMode="numeric" value={answers.tc} onChange={(event) => setAnswers({ ...answers, tc: event.target.value })} />
        </label>
        <label className="text-sm text-zinc-400">Bet amount
          <input className={`${inputClass} mt-2`} inputMode="numeric" value={answers.bet} onChange={(event) => setAnswers({ ...answers, bet: event.target.value })} />
        </label>
      </div>
      <Button className="mx-auto mt-5 block min-h-11">Deal round</Button>
    </form>}

    {(phase === "insurance" || phase === "play") && round && <div>
      <p className="text-center text-sm text-zinc-500">Dealer</p>
      <div className="mt-2 flex justify-center gap-2"><PlayingCard card={round.dealerUpcard} /><PlayingCard hidden /></div>
      <p className="mt-8 text-center text-sm text-zinc-500">Your hand</p>
      <div className="mt-2 flex justify-center gap-2">{round.heroInitial.map((card, position) => <PlayingCard key={position} card={card} />)}</div>
      {phase === "insurance"
        ? <div className="mt-7 text-center">
          <p className="mb-3 font-medium">Insurance?</p>
          <div className="hidden justify-center gap-2 lg:flex">
            <GhostButton className="min-h-11" onClick={() => chooseInsurance("I")}>Take insurance</GhostButton>
            <GhostButton className="min-h-11" onClick={() => chooseInsurance("N")}>Decline insurance</GhostButton>
          </div>
        </div>
        : <div className="mt-7 hidden flex-wrap justify-center gap-2 lg:flex">
          {actions.map((action) => <GhostButton className="min-h-11" key={action} onClick={() => choosePlay(action)}>{DEVIATION_ACTION_NAMES[action]}</GhostButton>)}
        </div>}
    </div>}

    {phase === "count" && round && <form onSubmit={(event) => { event.preventDefault(); submitCount(); }}>
      <div className="space-y-6">
        <div>
          <p className="text-center text-sm text-zinc-500">Dealer, hole card revealed</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">{round.dealerHand.map((card, position) => <PlayingCard size="sm" key={position} card={card} />)}</div>
        </div>
        <div>
          <p className="text-center text-sm text-zinc-500">All player hands</p>
          <div className="mt-2 flex flex-wrap justify-center gap-5">
            {round.playerHands.map((hand, handIndex) => <div key={handIndex} className="flex -space-x-8">{hand.map((card, position) => <PlayingCard size="sm" key={position} card={card} />)}</div>)}
          </div>
        </div>
      </div>
      <label className="mx-auto mt-7 block max-w-xs text-center text-sm text-zinc-400">Ending running count
        <input autoFocus className={`${inputClass} mt-2`} inputMode="numeric" value={answers.count} onChange={(event) => setAnswers({ ...answers, count: event.target.value })} />
      </label>
      <Button className="mx-auto mt-4 block min-h-11">Submit</Button>
      <NumericPad value={answers.count} onChange={(value) => setAnswers({ ...answers, count: value })} onSubmit={submitCount} />
    </form>}
  </StageFrame>;
}
