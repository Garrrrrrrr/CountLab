"use client";
import { useEffect, useState } from "react";
import { DrillFrame, useDrillSetupPref } from "@/components/drill";
import { Callout, HelpTip, toast } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { track } from "@/lib/analytics/track";
import { ACTION_STYLE } from "@/lib/blackjack/actionStyles";
import { referenceHref } from "@/lib/blackjack/referenceLinks";
import {
  drawStrategyQuestion,
  focusCandidates,
  handLabel,
  isStrategyQuestion,
  parseStrategyQuestion,
  pickFocusCategory,
  resolveStrategyHand,
  spokenHand,
  STRATEGY_ANSWER_NAMES,
  strategyChartCell,
  strategyChartRow,
  strategyMistake,
  strategyQuestionText,
  strategyRetryQueue,
  strategyScenario,
  type StrategyAnswer,
  type StrategyHand,
  type StrategyMode,
} from "@/lib/blackjack/strategyDrill";
import { STRATEGY_CATEGORIES, type StrategyCategory, type StrategyQuestion } from "@/lib/blackjack/strategyQuestions";
import { EMPTY_TALLY, explainModeOf, historyTotals, roundLengthOf, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import { consumePracticeFocus, dueItemKeys, forceDue, leitnerStates, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { storage, type Mistake, type Settings } from "@/lib/statistics/storage";
import { ChartNote, MiniChartRow } from "./MiniChartRow";
import { HandTable } from "./HandTable";
import { PracticeLines, ReferenceLink, UnfinishedRoundCallout } from "./parts";
import { restoreRound, saveRound, savedRoundDetail, type SavedRound } from "./progress";
import { RoundPlay, type PausedView } from "./RoundPlay";
import { StrategySetup, type ModeOption } from "./StrategySetup";
import { StrategySummary } from "./StrategySummary";
import { isResumable, peekPracticeFocus, playTone, rulesFromSettings, startedRules, useStoredSessions, useStrategySettings, useUnfinishedProgress } from "./hooks";
import { useStrategyRound, type RoundAdapter, type RoundAnswer, type RoundPlan, type RoundStart } from "./useStrategyRound";

const DRILL = "Basic Strategy" as const;
const PREF_KEY = "countlab:drill-setup:basic-strategy";
const SLOW_MS = 3000;

/** Saved progress ("hilo:progress:Basic Strategy"). */
type StrategySaved = SavedRound<StrategyQuestion> & { mode: StrategyMode };
type Pref = { mode: StrategyMode; length: RoundLength; explain: ExplainMode };
const DEFAULT_PREF: Pref = { mode: "standard", length: 10, explain: "mistakes" };
const modeOf = (value: unknown): StrategyMode => (value === "adaptive" || value === "tricky" ? value : "standard");

const REFERENCE = { href: "/reference", label: "View strategy reference" };
const DESCRIPTION = "See your hand and the dealer's upcard, then pick the play. Wrong answers stop with the reason and where the hand sits on the chart.";
const KEYS = [
  { keys: ["H"], label: "Hit" }, { keys: ["S"], label: "Stand" }, { keys: ["D"], label: "Double" }, { keys: ["P"], label: "Split" },
  { keys: ["R"], label: "Surrender" }, { keys: ["N"], label: "Play it out" }, { keys: ["Enter"], label: "Next hand" },
];

export function StrategyDrill() {
  const [pref, remember, restored] = useDrillSetupPref<Pref>(PREF_KEY, DEFAULT_PREF);
  // Render nothing until the remembered setup is read, so the choices never flash from the defaults.
  if (!restored) return null;
  return <StrategySession pref={{ mode: modeOf(pref.mode), length: roundLengthOf(pref.length), explain: explainModeOf(pref.explain) }} remember={remember} />;
}

const keepFor = (settings: Settings) => (question: StrategyQuestion) => isStrategyQuestion(question) && (question.category !== "Surrender" || settings.surrender !== "none");

function boot(settings: Settings, pref: Pref) {
  const progress = storage.progress<Partial<StrategySaved>>(DRILL);
  const focusCategory = peekPracticeFocus(DRILL);
  const focus = focusCategory && STRATEGY_CATEGORIES.includes(focusCategory as StrategyCategory)
    ? { category: focusCategory as StrategyCategory, usable: focusCategory !== "Surrender" || settings.surrender !== "none" }
    : undefined;
  const restoredRound = isResumable(progress) ? restoreRound(progress!.state, keepFor(settings)) : undefined;
  const resuming = Boolean(restoredRound && !focus);
  const start: RoundStart<StrategyQuestion> = resuming
    ? { phase: "play", plan: restoredRound!.plan, tally: restoredRound!.tally, resumedAt: progress!.updatedAt }
    : { phase: "setup", plan: { length: pref.length, explain: pref.explain, retry: false }, tally: EMPTY_TALLY };
  // A focus hand-off preselects Weak spots; progress saved before any answer still restores its mode.
  const mode = focus?.usable ? "adaptive" : progress?.state?.mode ? modeOf(progress.state.mode) : pref.mode;
  // A round whose remaining hands the table no longer deals (surrender switched off elsewhere) is set aside.
  const dropped = isResumable(progress) && !restoredRound;
  return { start, focus, mode, dropped };
}

function StrategySession({ pref, remember }: { pref: Pref; remember: (next: Partial<Pref>) => void }) {
  const settings = useStrategySettings();
  const sessions = useStoredSessions();
  const [initial] = useState(() => boot(storage.settings(), pref));
  const [mode, setMode] = useState<StrategyMode>(initial.mode);
  const [length, setLength] = useState<RoundLength>(pref.length);
  const [explain, setExplainPref] = useState<ExplainMode>(pref.explain);
  const [focus, setFocus] = useState(initial.focus);
  const [expanded, setExpanded] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  // The hand-off is one-shot: clear it now, whether or not it was for this drill.
  const [setAside, setSetAside] = useState(initial.dropped);
  useEffect(() => {
    consumePracticeFocus(DRILL);
    if (initial.focus?.usable) forceDue(DRILL, initial.focus.category);
    if (initial.dropped) storage.clearProgress(DRILL);
  }, [initial]);

  const rules = rulesFromSettings(settings);
  const focusPick = () => pickFocusCategory({
    surrender: settings.surrender,
    due: dueItemKeys(DRILL, focusCandidates(settings.surrender)),
    seen: new Set(Object.keys(leitnerStates(DRILL))),
    history: historyTotals(sessions, DRILL),
  });

  const adapter: RoundAdapter<StrategyHand, StrategyQuestion> = {
    drill: DRILL,
    deal: (index, plan) => {
      const queued = plan.retry ? plan.queue?.[index] : undefined;
      const question = queued ?? drawStrategyQuestion({ mode, surrender: settings.surrender, focus: mode === "adaptive" ? focusPick()?.category : undefined });
      return resolveStrategyHand(question, rules);
    },
    grade: (hand, chosen) => ({ ok: chosen === hand.correct, category: hand.category, mistake: strategyMistake(hand, chosen as StrategyAnswer) }),
    presented: (hand, attempt) => track("question_presented", { drill: DRILL, category: hand.category, scenario: strategyScenario(hand), attempt }),
    answered: ({ hand, chosen, ok, ms, number }, streak, plan) => {
      if (mode === "adaptive" && !plan.retry) recordAnswer(DRILL, hand.category, ok);
      playTone(ok, settings.sound);
      track("basic_strategy_answered", { ok, chosen, correct: hand.correct, category: hand.category, mode, scenario: strategyScenario(hand), responseTimeMs: ms, attempt: number, streak });
    },
    skipped: (hand, attempt, elapsedMs) => track("answer_skipped", { drill: DRILL, category: hand.category, scenario: strategyScenario(hand), attempt, elapsedMs }),
    started: (plan) => ({ drill: DRILL, mode, questionTarget: plan.length, ...startedRules(settings) }),
    spoken: (hand) => `${spokenHand(hand.player, hand.dealer)}.${hand.askingSurrender ? " Surrender?" : ""}`,
    verdict: ({ hand, chosen, ok }, full) => ok
      ? `Correct. ${STRATEGY_ANSWER_NAMES[hand.correct]}.`
      : `Not quite. You chose ${STRATEGY_ANSWER_NAMES[chosen as StrategyAnswer]}; the play is ${STRATEGY_ANSWER_NAMES[hand.correct]}.${full ? ` ${hand.explanation}` : ""}`,
    progress: (plan, tally) => ({ ...saveRound(plan, tally), mode } satisfies StrategySaved),
  };
  const round = useStrategyRound(adapter, initial.start);
  const [unfinishedProgress, reloadUnfinished] = useUnfinishedProgress<Partial<StrategySaved>>(DRILL, round.phase === "setup");
  const unfinished = isResumable(unfinishedProgress) ? restoreRound(unfinishedProgress!.state, keepFor(settings)) : undefined;

  const chooseMode = (next: StrategyMode) => {
    track("practice_mode_changed", { drill: DRILL, from: mode, to: next });
    setMode(next);
    remember({ mode: next });
  };
  const newPlan = (): RoundPlan<StrategyQuestion> => ({ length, explain, retry: false });
  const startFromSetup = () => {
    if (unfinished) { setConfirmReplace(true); return; }
    setFocus(undefined);
    round.start(newPlan());
  };
  const resumeUnfinished = () => {
    if (!unfinished || !unfinishedProgress) return;
    setMode(modeOf(unfinishedProgress.state?.mode));
    setFocus(undefined);
    round.resume(unfinished.plan, unfinished.tally, unfinishedProgress.updatedAt);
  };
  const retry = (questions: ReadonlyArray<StrategyQuestion | null>) => {
    const queue = strategyRetryQueue(questions, settings.surrender);
    if (!queue.length) {
      toast({ message: "Those hands are surrender questions, and your table has no surrender now.", tone: "info" });
      return;
    }
    round.start({ length: queue.length, explain: round.plan.explain, retry: true, queue });
  };

  const header = { eyebrow: "Strategy drill", title: "Basic Strategy" };

  if (round.phase === "summary" && round.session) {
    const slow = round.log.filter((entry) => entry.ok && entry.ms > SLOW_MS);
    return (
      <StrategySummary
        session={round.session}
        drillTitle={header.title}
        onPlayAgain={() => round.start(newPlan())}
        onRetry={() => retry(round.session!.mistakes.map((mistake) => parseStrategyQuestion(mistake.question)))}
        onChangeSetup={round.changeSetup}
        breakdownTitle="By hand type"
        mistakeHref={(mistake: Mistake) => {
          const question = parseStrategyQuestion(mistake.question);
          return referenceHref("strategy", question && strategyChartCell(question));
        }}
        slow={slow.map((entry) => ({ id: entry.number, text: strategyQuestionText(entry.hand), ms: entry.ms }))}
        onRetrySlow={() => retry(slow.map((entry) => entry.hand))}
        footer={<PracticeLines drill={DRILL} sessions={sessions} unit={{ one: "hand", many: "hands" }} showLast={false} />}
      />
    );
  }

  if (round.phase === "play") {
    const hand = round.hand;
    if (!hand) return null;
    const pick = mode === "adaptive" && !round.plan.retry ? focusPick() : undefined;
    const chip = round.plan.retry
      ? <span className="hidden rounded-full border border-[var(--rule)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)] sm:inline-flex">Retrying your misses</span>
      : pick && (
        <span className="hidden items-center gap-1 rounded-full border border-[var(--rule)] py-0.5 pl-2.5 pr-1 text-xs font-semibold text-[var(--ink)] sm:inline-flex">
          Leaning on: {pick.category}
          <HelpTip label="Weak spots">Picked from hand types due for review and your lowest-accuracy type. About two hands in three come from it.</HelpTip>
        </span>
      );
    return (
      <RoundPlay
        drillTitle={header.title}
        reference={<ReferenceLink {...REFERENCE} className="hidden sm:inline-flex" />}
        round={round}
        dockLabel="Basic strategy actions"
        correctOf={(answered) => answered.correct}
        options={hand.options.map((value) => ({
          value,
          label: STRATEGY_ANSWER_NAMES[value],
          letter: value,
          swatch: value === "N" ? undefined : ACTION_STYLE[value],
          disabled: hand.disabled.includes(value),
        }))}
        table={<HandTable player={hand.player} dealer={hand.dealer} animated={settings.animations} dealKey={round.handSerial} />}
        question={hand.askingSurrender ? (
          <>
            <h2 className="font-display text-xl font-semibold">Surrender, or play the hand out?</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Surrender is decided first, before any other play.</p>
          </>
        ) : <h2 className="font-display text-xl font-semibold">What&apos;s the play?</h2>}
        paused={round.paused && pausedView(round.paused)}
        strip={round.last && stripView(round.last)}
        log={round.log.map((entry) => ({ id: entry.number, ok: entry.ok, text: strategyQuestionText(entry.hand).replace(" — surrender?", " (sur.)"), detail: entry.ok ? undefined : STRATEGY_ANSWER_NAMES[entry.hand.correct], ms: entry.ms }))}
        chip={chip}
        shortcuts={settings.shortcuts}
        remember={(next) => { setExplainPref(next); remember({ explain: next }); }}
      />
    );
  }

  const pick = mode === "adaptive" ? focusPick() : undefined;
  const modes: ModeOption<StrategyMode>[] = [
    { value: "standard", label: "Mixed", help: settings.surrender === "none"
      ? "Hard totals, soft totals and pairs at random. No surrender questions: your table has no surrender."
      : "Hard totals, soft totals and pairs at random, plus surrender questions when your table allows it." },
    { value: "adaptive", label: "Weak spots", help: "Leans on the hand types you miss most and the ones due for review. With no history yet, it cycles through each type." },
    { value: "tricky", label: "Tricky", ariaLabel: "Tricky hands", help: "Borderline hands where the play turns on the upcard: soft doubles, 12 against 2 to 4, the 9 to 11 doubles, pair splits and the stiff hands." },
  ];
  const hasHistory = sessions.some((session) => session.drill === DRILL);
  return (
    <DrillFrame {...header} description={DESCRIPTION} phase="setup" actions={<ReferenceLink {...REFERENCE} />}>
      <StrategySetup
        settings={settings}
        compact={hasHistory && !expanded && !focus && !setAside && round.notice === undefined}
        onExpand={() => setExpanded(true)}
        notices={(round.notice || focus || unfinished || setAside) && (
          <div className="grid gap-3">
            {setAside && <Callout tone="info" title="Your unfinished round was set aside" onDismiss={() => setSetAside(false)}>Its remaining hands are surrender questions, and your table rules no longer include surrender.</Callout>}
            {round.notice === "nothing-saved" && <Callout tone="info" title="Nothing was answered, so nothing was saved." onDismiss={() => round.setNotice(undefined)} />}
            {focus && (focus.usable ? (
              <Callout tone="info" title={`Focusing on ${focus.category}`} onDismiss={() => setFocus(undefined)}>
                Weak spots is selected so these hands come up more often.
              </Callout>
            ) : (
              <Callout tone="warn" title="Surrender isn't dealt at your table" onDismiss={() => setFocus(undefined)}>
                Your table rules have no surrender, so surrender hands never come up. Turn it on under Table rules to practise them.
              </Callout>
            ))}
            {unfinished && unfinishedProgress && (
              <UnfinishedRoundCallout
                detail={savedRoundDetail(unfinished)}
                answered={unfinished.tally.answered}
                updatedAt={unfinishedProgress.updatedAt}
                onResume={resumeUnfinished}
                onDiscard={() => { round.discard(); reloadUnfinished(); }}
              />
            )}
          </div>
        )}
        modeLabel="Hands to practise"
        modes={modes}
        mode={mode}
        onMode={chooseMode}
        modeNote={pick && <>Next focus: {pick.category} <span className="font-normal text-[var(--ink-muted)]">({pick.reason === "due" ? "due for review" : pick.reason === "new" ? "not practised yet" : `${Math.round((pick.correct! / pick.total!) * 100)}% of ${pick.total} hands`})</span></>}
        length={length}
        onLength={(next) => { setLength(next); remember({ length: next }); }}
        explain={explain}
        onExplain={(next) => { setExplainPref(next); remember({ explain: next }); }}
        keys={KEYS}
        onStart={startFromSetup}
        footnote={<PracticeLines drill={DRILL} sessions={sessions} unit={{ one: "hand", many: "hands" }} />}
      />
      <ConfirmModal
        open={confirmReplace}
        tone="danger"
        title="Start a new round?"
        description={`Your unfinished round has ${unfinished?.tally.answered ?? 0} answers. Starting over discards them.`}
        confirmLabel="Discard and start"
        cancelLabel="Keep it"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => { setConfirmReplace(false); setFocus(undefined); round.start(newPlan()); reloadUnfinished(); }}
      />
    </DrillFrame>
  );
}

const RANK_WORD: Record<string, string> = { A: "an ace", J: "a jack", Q: "a queen", K: "a king", "8": "an 8" };
const withArticle = (rank: string) => RANK_WORD[rank] ?? `a ${rank}`;

function chartVisual(hand: StrategyHand) {
  const shown = strategyChartRow(hand);
  return "note" in shown ? <ChartNote>{shown.note}</ChartNote> : <MiniChartRow row={shown.row} />;
}

function pausedView({ hand, chosen, ok }: RoundAnswer<StrategyHand>): PausedView {
  const correct = STRATEGY_ANSWER_NAMES[hand.correct];
  const cell = strategyChartCell(hand);
  return {
    ok,
    title: ok ? `Correct: ${correct}` : `Not quite: the play is ${correct}`,
    detail: <span className="block leading-5 sm:leading-6">{!ok && <b className="font-semibold text-[var(--ink)]">You chose {STRATEGY_ANSWER_NAMES[chosen as StrategyAnswer]}. </b>}{handLabel(hand.player)} against {withArticle(hand.dealer.rank)}<span className="hidden sm:inline"> · Hand type: {hand.category}</span></span>,
    explanation: <span className="block leading-5 sm:leading-6">{hand.explanation}</span>,
    visual: chartVisual(hand),
    link: { href: referenceHref("strategy", cell), label: cell ? `See ${cell.hand} vs ${cell.dealer} on the chart` : "Open the strategy chart" },
  };
}

function stripView({ hand, chosen, ok, ms }: RoundAnswer<StrategyHand>) {
  const text = strategyQuestionText(hand).replace(" — surrender?", " (surrender?)");
  return {
    ok,
    summary: ok
      ? <>Last hand: <span className="font-data">{text}</span> · {STRATEGY_ANSWER_NAMES[hand.correct]} · <span className="font-data">{(ms / 1000).toFixed(1)} s</span></>
      : <>Last hand: <span className="font-data">{text}</span> · you chose {STRATEGY_ANSWER_NAMES[chosen as StrategyAnswer]}, the play is {STRATEGY_ANSWER_NAMES[hand.correct]}</>,
    details: <div className="grid gap-3"><p>{hand.explanation}</p>{chartVisual(hand)}</div>,
  };
}
