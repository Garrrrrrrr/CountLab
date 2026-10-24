"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { ActionPad, ACTION_FILL, ACTION_NAME } from "@/components/blackjack";
import { Callout, cx, Kbd, Toggle } from "@/components/ui";
import { DrillSetup, Feedback, PlayDock, PlayFrame, PresetPicker, ResumeBanner, SetupGroup } from "@/components/drill/DrillKit";
import { track } from "@/lib/analytics/track";
import type { Action } from "@/lib/blackjack/types";
import { useSessions } from "@/lib/hooks/useSessions";
import { useSettings } from "@/lib/hooks/useSettings";
import { explainModeOf, historyTotals, relativeTime, roundLengthOf, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import { consumePracticeFocus, peekPracticeFocus } from "@/lib/statistics/spacedRepetition";
import { storage } from "@/lib/statistics/storage";
import { indexList, rulesFromSettings, rulesSummary, signedCount, SOURCE_NAME, type TableRules } from "@/lib/strategy";
import { totalLabel } from "@/lib/strategy-drills/cards";
import { answerName, dealIndex, entryLabel, explainIndex, focusQuestions, indexMistake, indexPool, indexRule, indexSetOf, isIndexQuestion, permissionsFor, questionFromMistake, resolveIndex, spokenIndexHand, surrenderNote, type IndexAnswer, type IndexHand, type IndexQuestion, type IndexSet, type IndexSide } from "@/lib/strategy-drills/indexPlays";
import { handLadder, insuranceLadder, ladderDomain } from "@/lib/strategy-drills/ladder";
import { CountLadder, type LadderBand } from "../strategy-shared/CountLadder";
import { HandStage } from "../strategy-shared/HandStage";
import { EndRoundSheet, ExplainPicker, LastAnswer, LengthPicker, RecentRounds, ReplaceRoundSheet, startedRules } from "../strategy-shared/parts";
import { RoundSummary, slowAnswers } from "../strategy-shared/RoundSummary";
import { RulesBar } from "../strategy-shared/RulesBar";
import { useSetupPref } from "../strategy-shared/useSetupPref";
import { restoreRound, useStrategyRound, type RoundAdapter, type RoundPlan, type SavedRound, type StrategyRound } from "../strategy-shared/useStrategyRound";

const DRILL = "Deviations" as const;
type Options = { set: IndexSet; study: boolean; lean: boolean };
type Pref = Options & { length: RoundLength; explain: ExplainMode };
const DEFAULT_PREF: Pref = { set: "core", study: false, lean: false, length: 20, explain: "mistakes" };
const cleanOptions = (raw: Partial<Options> | undefined): Options => ({ set: indexSetOf(raw?.set), study: raw?.study === true, lean: raw?.lean === true });
const cleanPref = (raw: Partial<Pref>): Pref => ({ ...cleanOptions(raw), length: roundLengthOf(raw.length), explain: explainModeOf(raw.explain) });

const lower = (answer: IndexAnswer) => answerName(answer).toLowerCase();
const handText = (hand: IndexHand) => `${hand.category} at ${signedCount(hand.tc)}`;

function adapterFor(): RoundAdapter<IndexQuestion, IndexHand, Options> {
  return {
    drill: DRILL,
    deal: (_index, plan, dealt) => {
      const sides: Record<string, IndexSide> = {};
      for (const question of dealt) sides[question.id] = question.side;
      const history = plan.options.lean ? historyTotals(storage.sessions(), DRILL) : undefined;
      return dealIndex(indexPool(plan.rules, plan.options.set), plan.rules, { sides, last: dealt[dealt.length - 1]?.id }, { lean: plan.options.lean, history });
    },
    resolve: (question, rules) => resolveIndex(question, rules),
    question: ({ id, tc, side, cards, upcard }) => ({ id, tc, side, cards, upcard }),
    grade: (hand, chosen, rules) => ({ ok: chosen === hand.correct, category: hand.category, mistake: indexMistake(hand, chosen as IndexAnswer, rules) }),
    answered: ({ hand, chosen, ok, ms, number }, _plan, tally) => track("deviation_answered", {
      ok, chosen, correct: hand.correct, category: hand.category, hand: hand.entry.ref?.row ?? "Insurance", dealer: hand.entry.ref?.dealer ?? "A",
      tc: hand.tc, responseTimeMs: ms, attempt: number, streak: tally.streak, isDeviation: hand.side === "index",
    }),
    presented: (hand, number) => track("question_presented", { drill: DRILL, category: hand.category, scenario: `${hand.entry.ref?.row ?? "Insurance"}_v_${hand.entry.ref?.dealer ?? "A"}`, attempt: number }),
    started: (plan) => ({ drill: DRILL, mode: plan.options.set, questionTarget: plan.length, ...startedRules(plan.rules) }),
    spoken: spokenIndexHand,
    verdict: ({ hand, ok }) => (ok ? `Right: ${lower(hand.correct)}.` : `Missed: the play was ${lower(hand.correct)}.`),
    isQuestion: isIndexQuestion,
    cleanOptions: (value) => cleanOptions(value as Partial<Options> | undefined),
  };
}

export function IndexPlaysDrill() {
  const { settings, update } = useSettings();
  const sessions = useSessions(DRILL);
  const [pref, remember] = useSetupPref<Pref>("deviations", DEFAULT_PREF, cleanPref);
  const adapter = useMemo(adapterFor, []);
  const round = useStrategyRound(adapter);
  const rules = rulesFromSettings(settings);
  const [saved, setSaved] = useState(() => storage.progress<Partial<SavedRound<IndexQuestion, Options>>>(DRILL));
  const restored = round.phase === "setup" ? restoreRound(adapter, saved?.state, rules) : undefined;
  // A "practise this" hand-off names one play; the round opens with it on both sides of its index.
  const [focusLabel, setFocusLabel] = useState(() => peekPracticeFocus(DRILL));
  useEffect(() => { consumePracticeFocus(DRILL); }, []);
  // Older reports name insurance "Insurance vs A"; every other play is named as entryLabel names it.
  const wanted = focusLabel && (/^insurance( vs a)?$/i.test(focusLabel.trim()) ? "insurance" : focusLabel.trim().toLowerCase());
  const focusEntry = wanted ? indexList(rules).find((entry) => entryLabel(entry).toLowerCase() === wanted) : undefined;

  const rulesKey = JSON.stringify(rules);
  const { pool, core } = useMemo(() => {
    const parsed = JSON.parse(rulesKey) as TableRules;
    return { pool: indexPool(parsed, "all"), core: indexPool(parsed, "core") };
  }, [rulesKey]);
  const surrenders = pool.filter((entry) => entry.kind === "surrender").length;
  const plan = (patch: Partial<RoundPlan<IndexQuestion, Options>> = {}): RoundPlan<IndexQuestion, Options> =>
    ({ length: pref.length, explain: pref.explain, retry: false, rules, options: cleanOptions(pref), ...patch });
  const [replacing, setReplacing] = useState(false);
  const startFresh = () => (restored ? setReplacing(true) : begin());
  const begin = () => {
    setReplacing(false);
    setSaved(null);
    const queue = focusEntry ? focusQuestions(focusEntry, rules) : undefined;
    setFocusLabel(undefined);
    round.start(plan({ queue }));
  };

  if (round.phase === "play" && round.plan && round.hand) return <IndexPlay round={round} hand={round.hand} rules={round.plan.rules} />;

  if (round.phase === "summary" && round.session && round.plan) {
    const slow = slowAnswers(round.log, handText);
    const retryWith = (queue: IndexQuestion[]) => round.start(plan({ length: queue.length, retry: true, queue, explain: round.plan!.explain, options: round.plan!.options }));
    return (
      <RoundSummary
        title="Index Plays"
        session={round.session}
        breakdownTitle="By index"
        slow={slow}
        onAgain={() => round.start(plan({ options: round.plan!.options }))}
        onRetry={() => retryWith(round.session!.mistakes.map(questionFromMistake).filter((question): question is IndexQuestion => question !== null))}
        onRetrySlow={() => retryWith(slow.map((entry) => adapter.question(entry.hand)))}
        onSetup={round.toSetup}
        next={{ href: "/train/chart-recall", label: "Try Chart Recall" }}
      />
    );
  }

  return (
    <DrillSetup
      title="Index Plays"
      intro="At some true counts the best play is not basic strategy. Each question gives a hand, the dealer's card and the true count; you learn the exact count where the play switches."
      onStart={startFresh}
      startLabel={`Start ${pref.length} hands`}
      resume={restored && saved && (
        <ResumeBanner
          detail={`${restored.plan.retry ? "Retry" : "Hand"} ${restored.tally.answered + 1} of ${restored.plan.length} at ${rulesSummary(restored.plan.rules)}, saved ${relativeTime(saved.updatedAt)}.`}
          onResume={() => { setSaved(null); round.resume(restored); }}
          onDiscard={() => { storage.clearProgress(DRILL); setSaved(null); }}
        />
      )}
      aside={<RecentRounds sessions={sessions} chartHref="/charts/indices" chartLabel="Open the index list" />}
    >
      {focusEntry && <Callout tone="info" title={`Focusing on ${entryLabel(focusEntry)}`}>The round opens with this play just either side of its index, then mixes in the rest.</Callout>}
      <ReplaceRoundSheet open={replacing} detail={`Your unfinished round has ${restored?.tally.answered ?? 0} answered.`} onConfirm={begin} onClose={() => setReplacing(false)} />
      <RulesBar settings={settings} update={update} note={`${pool.length} index plays for these rules${surrenders ? `, ${surrenders} of them surrender decisions` : ""}.`} />
      <SetupGroup title="Which indices">
        <PresetPicker label="Which indices" value={pref.set} onChange={(set) => remember({ set })} options={[
          { value: "core", title: "Illustrious 18 + Fab 4", detail: `The ${core.length} plays worth the most, in the order counters learn them.` },
          { value: "all", title: "All indices", detail: `Every index for your rules: ${pool.length} plays, including soft doubles and pair splits.` },
        ]} />
      </SetupGroup>
      <SetupGroup title="How to practise">
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <Toggle label="Study mode" description="Show the index on screen before you answer. Turn it off to test yourself." checked={pref.study} onChange={(study) => remember({ study })} />
          <Toggle label="Lean on my misses" description="Plays you get wrong come back more often." checked={pref.lean} onChange={(lean) => remember({ lean })} />
        </div>
      </SetupGroup>
      <SetupGroup title="Round">
        <div className="space-y-4">
          <LengthPicker value={pref.length} onChange={(length) => remember({ length })} />
          <ExplainPicker value={pref.explain} onChange={(explain) => remember({ explain })} />
        </div>
      </SetupGroup>
      <p className="hidden text-sm text-ink-3 [@media(hover:hover)]:block">
        Keys: <Kbd>H</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> <Kbd>P</Kbd> <Kbd>R</Kbd> for the play, <Kbd>I</Kbd> take or <Kbd>N</Kbd> decline insurance, <Kbd>↵</Kbd> next.
      </p>
    </DrillSetup>
  );
}

function TrueCountBadge({ tc }: { tc: number }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-brand px-2 py-1 text-brand-ink shadow-1 xs:rounded-2xl xs:px-2.5 xs:py-1.5">
      {/* Phones under 400px keep the badge clear of the dealer's cards. */}
      <span className="text-[0.625rem] font-bold uppercase tracking-[0.12em] opacity-80"><span className="xs:hidden">TC</span><span className="hidden xs:inline">True count</span></span>
      <span className="tnum text-xl font-bold leading-none xs:text-2xl">{signedCount(tc)}</span>
    </div>
  );
}

function InsurancePad({ onAnswer, disabled }: { onAnswer: (answer: "I" | "N") => void; disabled?: boolean }) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "i" || key === "y") { event.preventDefault(); onAnswer("I"); }
      if (key === "n") { event.preventDefault(); onAnswer("N"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer, disabled]);
  const button = "relative flex h-14 items-center justify-center gap-2 rounded-2xl border text-[0.9375rem] font-bold transition active:scale-[0.98] sm:h-16";
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Insurance">
      <button type="button" aria-keyshortcuts="i" onClick={() => onAnswer("I")} className={cx(button, "border-brand/40 bg-brand/15 text-ink hover:bg-brand/25")}>
        <ShieldCheck size={18} aria-hidden className="text-brand-text" /> Take insurance <span className="hidden font-mono text-[0.625rem] font-medium uppercase text-ink-3 [@media(hover:hover)]:inline">i</span>
      </button>
      <button type="button" aria-keyshortcuts="n" onClick={() => onAnswer("N")} className={cx(button, "border-line bg-surface-2 text-ink hover:bg-surface-3")}>
        <X size={18} aria-hidden className="text-ink-3" /> Decline <span className="hidden font-mono text-[0.625rem] font-medium uppercase text-ink-3 [@media(hover:hover)]:inline">n</span>
      </button>
    </div>
  );
}

function ladderFor(hand: IndexHand, rules: TableRules): { bands: LadderBand[]; min: number; max: number } {
  const { min, max } = ladderDomain([hand.entry.at, hand.tc], -4, 8);
  if (hand.entry.kind === "insurance") {
    return { min, max, bands: insuranceLadder(rules, min, max).map((segment) => ({ from: segment.from, to: segment.to, label: segment.take ? "Take insurance" : "Decline", short: segment.take ? "Take" : "No", fill: segment.take ? "bg-brand text-brand-ink" : "bg-surface-3 text-ink-2" })) };
  }
  const segments = handLadder(rules, hand.cell!, permissionsFor(hand.drawn ? "drawn" : "two", rules, hand.cell!), min, max);
  return {
    min, max,
    bands: segments.map((segment) => ({
      from: segment.from, to: segment.to,
      label: segment.action === "R" && segment.fallback ? `Surrender, else ${ACTION_NAME[segment.fallback].toLowerCase()}` : ACTION_NAME[segment.action],
      short: segment.action === "R" && segment.fallback ? `R${segment.fallback.toLowerCase()}` : segment.action,
      fill: ACTION_FILL[segment.action],
    })),
  };
}

function IndexPlay({ round, hand, rules }: { round: StrategyRound<IndexQuestion, IndexHand, Options>; hand: IndexHand; rules: TableRules }) {
  const plan = round.plan!;
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("[data-answer-dock]")) stage.current?.focus({ preventScroll: true });
  }, [round.handSerial]);
  const paused = round.paused;
  const insurance = hand.entry.kind === "insurance";
  const last = round.last;
  const ladder = paused ? ladderFor(hand, rules) : undefined;
  return (
    <PlayFrame title="Index Plays" onExit={round.requestEnd} progress={{ done: paused ? round.tally.answered - 1 : round.tally.answered, total: plan.length }} streak={round.tally.streak}>
      <div className="flex flex-1 flex-col gap-3">
        {last && !paused && plan.explain === "never" && (
          <LastAnswer ok={last.ok} text={`${handText(last.hand)}: ${last.ok ? lower(last.hand.correct) : `${lower(last.hand.correct)}, not ${lower(last.chosen as IndexAnswer)}`}`} />
        )}
        <HandStage ref={stage} upcard={hand.upcard} cards={hand.cards} total={totalLabel(hand.cards)} dealKey={round.handSerial} compact={Boolean(paused)} badge={<TrueCountBadge tc={hand.tc} />} className="max-h-[32rem] flex-1" />
        {!paused && (
          <div className="pb-1 text-center">
            <h2 className="text-lg font-semibold">{insurance ? `Take insurance at ${signedCount(hand.tc)}?` : `What's the play at ${signedCount(hand.tc)}?`}</h2>
            <p className="mt-0.5 text-sm text-ink-2">{surrenderNote(hand)}</p>
            {plan.options.study && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/10 px-3 py-1 text-sm font-semibold text-brand-text">
                <span className="text-xs font-medium text-ink-2">Index</span> {indexRule(hand.entry)}
              </p>
            )}
          </div>
        )}
      </div>
      <PlayDock>
        <div data-answer-dock>
          {paused ? (
            <Feedback
              ok={paused.ok}
              title={paused.ok ? `Right: ${lower(hand.correct)}` : `${answerName(hand.correct)}, not ${lower(paused.chosen as IndexAnswer)}`}
              onContinue={round.next}
              continueLabel={round.tally.answered >= plan.length ? "See results" : "Next hand"}
            >
              <p>{explainIndex(hand, rules)}</p>
              {ladder && (
                <div className="-ml-9 mt-3">
                  <p className="mb-1 text-xs font-medium text-ink-3">{insurance ? "Insurance" : `${totalLabel(hand.cards)}${hand.drawn ? ` (${hand.cards.length} cards)` : ""} vs ${hand.entry.ref!.dealer === "A" ? "ace" : hand.entry.ref!.dealer}`} across the count<span className="hidden sm:inline"> · index {indexRule(hand.entry).toLowerCase()}</span></p>
                  <CountLadder bands={ladder.bands} min={ladder.min} max={ladder.max} tc={hand.tc} />
                  <p className="mt-1 hidden text-[0.6875rem] text-ink-3 sm:block">Source: {SOURCE_NAME[hand.entry.source]}</p>
                </div>
              )}
            </Feedback>
          ) : insurance ? (
            <InsurancePad onAnswer={round.answer} disabled={round.confirmingEnd} />
          ) : (
            <ActionPad onAnswer={round.answer} available={hand.available as Action[]} disabled={round.confirmingEnd} />
          )}
        </div>
      </PlayDock>
      <EndRoundSheet open={round.confirmingEnd} answered={round.tally.answered} length={plan.length} onConfirm={round.confirmEnd} onClose={round.cancelEnd} />
    </PlayFrame>
  );
}

