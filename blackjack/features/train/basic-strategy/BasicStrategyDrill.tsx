"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionPad, ACTION_NAME } from "@/components/blackjack";
import { Kbd } from "@/components/ui";
import { DrillSetup, Feedback, PlayDock, PlayFrame, PresetPicker, ResumeBanner, SetupGroup } from "@/components/drill/DrillKit";
import { track } from "@/lib/analytics/track";
import type { Action } from "@/lib/blackjack/types";
import { useSessions } from "@/lib/hooks/useSessions";
import { useSettings } from "@/lib/hooks/useSettings";
import { explainModeOf, relativeTime, roundLengthOf, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import { consumePracticeFocus, leitnerStates, peekPracticeFocus, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { storage } from "@/lib/statistics/storage";
import { rulesFromSettings, rulesSummary, surrenderOffered, type TableRules } from "@/lib/strategy";
import { BASIC_CATEGORIES, basicFocusOf, basicMistake, basicScenario, explainBasic, FOCUS_FOR_CATEGORY, isBasicQuestion, questionFromMistake, recentMisses, resolveBasic, spokenHand, drawBasic, weakPool, type BasicCategory, type BasicFocus, type BasicHand, type BasicQuestion } from "@/lib/strategy-drills/basic";
import { ranksText, totalLabel } from "@/lib/strategy-drills/cards";
import { ChartRow } from "../strategy-shared/ChartRow";
import { HandStage } from "../strategy-shared/HandStage";
import { EndRoundSheet, ExplainPicker, LastAnswer, LengthPicker, RecentRounds, ReplaceRoundSheet, startedRules } from "../strategy-shared/parts";
import { RoundSummary, slowAnswers } from "../strategy-shared/RoundSummary";
import { RulesBar } from "../strategy-shared/RulesBar";
import { useSetupPref } from "../strategy-shared/useSetupPref";
import { restoreRound, useStrategyRound, type RoundAdapter, type RoundPlan, type SavedRound, type StrategyRound } from "../strategy-shared/useStrategyRound";

const DRILL = "Basic Strategy" as const;
type Options = { focus: BasicFocus };
type Pref = { focus: BasicFocus; length: RoundLength; explain: ExplainMode };
const DEFAULT_PREF: Pref = { focus: "mixed", length: 20, explain: "mistakes" };
const cleanPref = (raw: Partial<Pref>): Pref => ({ focus: basicFocusOf(raw.focus), length: roundLengthOf(raw.length), explain: explainModeOf(raw.explain) });

const FOCUS: { value: BasicFocus; title: string; detail: string }[] = [
  { value: "mixed", title: "Mixed", detail: "Hard, soft and pair hands at random, with surrender hands when your table offers it." },
  { value: "weak", title: "Weak spots", detail: "Hands you missed recently or that are due for review." },
  { value: "hard", title: "Hard totals", detail: "8 through 17, including hands you have already hit." },
  { value: "soft", title: "Soft totals", detail: "Ace hands, including three-card ones that can no longer double." },
  { value: "pairs", title: "Pairs", detail: "When to split, and how to play the pairs you keep." },
  { value: "surrender", title: "Surrender", detail: "The hands your table lets you give up, and their neighbours that you play on." },
];

const name = (action: Action) => ACTION_NAME[action].toLowerCase();

function adapterFor(): RoundAdapter<BasicQuestion, BasicHand, Options> {
  return {
    drill: DRILL,
    deal: (_index, plan, dealt) => {
      const previous = dealt[dealt.length - 1];
      const avoid = previous ? resolveBasic(previous, plan.rules)?.key : undefined;
      const weak = plan.options.focus === "weak" ? weakPool(plan.rules, leitnerStates(DRILL), recentMisses(storage.sessions())) : undefined;
      return drawBasic({ focus: plan.options.focus, rules: plan.rules, weak, avoid });
    },
    resolve: resolveBasic,
    question: (hand) => ({ cards: hand.cards, upcard: hand.upcard }),
    grade: (hand, chosen, rules) => ({ ok: chosen === hand.correct, category: hand.category, mistake: basicMistake(hand, chosen as Action, rules) }),
    answered: ({ hand, chosen, ok, ms, number }, plan, tally) => {
      if (!plan.retry) recordAnswer(DRILL, hand.key, ok);
      track("basic_strategy_answered", { ok, chosen, correct: hand.correct, category: hand.category, mode: plan.options.focus, scenario: basicScenario(hand), responseTimeMs: ms, attempt: number, streak: tally.streak });
    },
    presented: (hand, number) => track("question_presented", { drill: DRILL, category: hand.category, scenario: basicScenario(hand), attempt: number }),
    started: (plan) => ({ drill: DRILL, mode: plan.options.focus, questionTarget: plan.length, ...startedRules(plan.rules) }),
    spoken: (hand) => `${spokenHand(hand)}.`,
    verdict: ({ hand, ok }) => (ok ? `Right: ${name(hand.correct)}.` : `Missed: the play was ${name(hand.correct)}.`),
    isQuestion: isBasicQuestion,
    cleanOptions: (value) => ({ focus: basicFocusOf((value as Partial<Options> | undefined)?.focus) }),
  };
}

export function BasicStrategyDrill() {
  const { settings, update } = useSettings();
  const sessions = useSessions(DRILL);
  const [pref, remember] = useSetupPref<Pref>("basic-strategy", DEFAULT_PREF, cleanPref);
  // A "practise this" hand-off from Progress picks the focus once; it is cleared after mount.
  const [handoff] = useState(() => {
    const category = peekPracticeFocus(DRILL);
    return BASIC_CATEGORIES.includes(category as BasicCategory) ? FOCUS_FOR_CATEGORY[category as BasicCategory] : undefined;
  });
  useEffect(() => { consumePracticeFocus(DRILL); if (handoff) remember({ focus: handoff }); }, [handoff, remember]);

  const adapter = useMemo(adapterFor, []);
  const round = useStrategyRound(adapter);
  const rules = rulesFromSettings(settings);
  const [saved, setSaved] = useState(() => storage.progress<Partial<SavedRound<BasicQuestion, Options>>>(DRILL));
  const restored = round.phase === "setup" ? restoreRound(adapter, saved?.state, rules) : undefined;

  const surrender = surrenderOffered(rules);
  const focus: BasicFocus = pref.focus === "surrender" && !surrender ? "mixed" : pref.focus;
  const plan = (patch: Partial<RoundPlan<BasicQuestion, Options>> = {}): RoundPlan<BasicQuestion, Options> =>
    ({ length: pref.length, explain: pref.explain, retry: false, rules, options: { focus }, ...patch });
  const [replacing, setReplacing] = useState(false);
  const begin = () => { setReplacing(false); setSaved(null); round.start(plan()); };
  const startFresh = () => (restored ? setReplacing(true) : begin());

  if (round.phase === "play" && round.plan && round.hand) return <BasicPlay round={round} hand={round.hand} rules={round.plan.rules} />;

  if (round.phase === "summary" && round.session && round.plan) {
    const slow = slowAnswers(round.log, (hand: BasicHand) => `${ranksText(hand.cards)} v ${hand.upcard.rank}`);
    const retryWith = (queue: BasicQuestion[]) => round.start(plan({ length: queue.length, retry: true, queue, explain: round.plan!.explain, options: round.plan!.options }));
    return (
      <RoundSummary
        title="Basic Strategy"
        session={round.session}
        breakdownTitle="By hand type"
        slow={slow}
        onAgain={() => round.start(plan({ options: round.plan!.options }))}
        onRetry={() => retryWith(round.session!.mistakes.map(questionFromMistake).filter((question): question is BasicQuestion => question !== null))}
        onRetrySlow={() => retryWith(slow.map((entry) => ({ cards: entry.hand.cards, upcard: entry.hand.upcard })))}
        onSetup={round.toSetup}
        next={{ href: "/train/deviations", label: "Try Index Plays" }}
      />
    );
  }

  const weak = focus === "weak" ? weakPool(rules, leitnerStates(DRILL), recentMisses(sessions)) : undefined;
  return (
    <DrillSetup
      title="Basic Strategy"
      intro="See your hand and the dealer's upcard, then pick the play. Every answer comes from the chart for your table rules, and a miss shows you why."
      onStart={startFresh}
      startLabel={`Start ${pref.length} hands`}
      resume={restored && saved && (
        <ResumeBanner
          detail={`${restored.plan.retry ? "Retry" : "Hand"} ${restored.tally.answered + 1} of ${restored.plan.length} at ${rulesSummary(restored.plan.rules)}, saved ${relativeTime(saved.updatedAt)}.`}
          onResume={() => { setSaved(null); round.resume(restored); }}
          onDiscard={() => { storage.clearProgress(DRILL); setSaved(null); }}
        />
      )}
      aside={<RecentRounds sessions={sessions} />}
    >
      <ReplaceRoundSheet open={replacing} detail={`Your unfinished round has ${restored?.tally.answered ?? 0} answered.`} onConfirm={begin} onClose={() => setReplacing(false)} />
      <RulesBar settings={settings} update={update} />
      <SetupGroup title="Hands to practise" hint={!surrender ? "Surrender hands are off: your table rules have no surrender." : undefined}>
        <PresetPicker label="Hands to practise" value={focus} onChange={(value) => remember({ focus: value })}
          options={FOCUS.filter((option) => option.value !== "surrender" || surrender)} />
        {weak && (
          <p className="mt-2 text-sm leading-5 text-ink-2">
            {weak.source === "history"
              ? <>Leaning on <span className="tnum font-semibold text-ink">{weak.entries.length}</span> {weak.entries.length === 1 ? "hand" : "hands"} you missed or that are due, about two hands in three.</>
              : "No misses on record yet, so it leans on the borderline hands: the edges of each colour on the chart, where most misses happen."}
          </p>
        )}
      </SetupGroup>
      <SetupGroup title="Round">
        <div className="space-y-4">
          <LengthPicker value={pref.length} onChange={(length) => remember({ length })} />
          <ExplainPicker value={pref.explain} onChange={(explain) => remember({ explain })} />
        </div>
      </SetupGroup>
      <p className="hidden text-sm text-ink-3 [@media(hover:hover)]:block">
        Keys: <Kbd>H</Kbd> hit, <Kbd>S</Kbd> stand, <Kbd>D</Kbd> double, <Kbd>P</Kbd> split, <Kbd>R</Kbd> surrender, <Kbd>↵</Kbd> next.
      </p>
    </DrillSetup>
  );
}

function BasicPlay({ round, hand, rules }: { round: StrategyRound<BasicQuestion, BasicHand, Options>; hand: BasicHand; rules: TableRules }) {
  const plan = round.plan!;
  const stage = useRef<HTMLElement>(null);
  // A new hand: keep focus off the answer buttons, so a carried-over Enter cannot answer it.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("[data-answer-dock]")) stage.current?.focus({ preventScroll: true });
  }, [round.handSerial]);
  const paused = round.paused;
  const two = !hand.drawn;
  const note = !two ? `${hand.cards.length} cards: you can only hit or stand.` : surrenderOffered(rules) ? "First two cards: surrender is allowed." : "First two cards. No surrender at this table.";
  const last = round.last;
  return (
    <PlayFrame title="Basic Strategy" onExit={round.requestEnd} progress={{ done: paused ? round.tally.answered - 1 : round.tally.answered, total: plan.length }} streak={round.tally.streak}>
      <div className="flex flex-1 flex-col gap-3">
        {last && !paused && plan.explain === "never" && (
          <LastAnswer ok={last.ok} text={`${ranksText(last.hand.cards)} v ${last.hand.upcard.rank}: ${last.ok ? name(last.hand.correct) : `${name(last.hand.correct)}, not ${name(last.chosen as Action)}`}`} />
        )}
        <HandStage ref={stage} upcard={hand.upcard} cards={hand.cards} total={totalLabel(hand.cards)} dealKey={round.handSerial} compact={Boolean(paused)} className="max-h-[32rem] flex-1" />
        {!paused && (
          <div className="pb-1 text-center">
            <h2 className="text-lg font-semibold">What&apos;s the play?</h2>
            <p className="mt-0.5 text-sm text-ink-2">{note}</p>
          </div>
        )}
      </div>
      <PlayDock>
        <div data-answer-dock>
          {paused ? (
            <Feedback
              ok={paused.ok}
              title={paused.ok ? `Right: ${name(hand.correct)}` : `${ACTION_NAME[hand.correct]}, not ${name(paused.chosen as Action)}`}
              onContinue={round.next}
              continueLabel={round.tally.answered >= plan.length ? "See results" : "Next hand"}
            >
              <p>{explainBasic(hand, rules)}</p>
              <div className="-ml-9 mt-2.5">
                <ChartRow rules={rules} cell={hand.cell} caption={`${totalLabel(hand.cards)} against ${hand.upcard.rank === "A" ? "an ace" : hand.cell.dealer} on your chart${hand.drawn ? " (first two cards)" : ""}`} />
              </div>
            </Feedback>
          ) : (
            <ActionPad onAnswer={round.answer} available={hand.available} disabled={round.confirmingEnd} />
          )}
        </div>
      </PlayDock>
      <EndRoundSheet open={round.confirmingEnd} answered={round.tally.answered} length={plan.length} onConfirm={round.confirmEnd} onClose={round.cancelEnd} />
    </PlayFrame>
  );
}
