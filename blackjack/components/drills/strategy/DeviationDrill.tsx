"use client";
import { useEffect, useMemo, useState } from "react";
import { DrillFrame, useDrillSetupPref } from "@/components/drill";
import { Callout, GhostButton, HelpTip, toast } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { track } from "@/lib/analytics/track";
import { ACTION_STYLE } from "@/lib/blackjack/actionStyles";
import type { DeviationAction } from "@/lib/blackjack/deviations";
import {
  countText,
  drawTrueCount,
  findIndexRow,
  focusQueue,
  focusRows,
  indexAnswerName,
  indexCategory,
  indexChartCell,
  indexMistake,
  indexReasoning,
  indexRetryQueue,
  indexTrainingRows,
  mostMissed,
  parseIndexMistake,
  pickIndexRow,
  resolveIndexHand,
  spokenIndexHand,
  type IndexHand,
  type IndexMode,
  type IndexQueueItem,
  type IndexRow,
} from "@/lib/blackjack/indexDrill";
import { referenceHref } from "@/lib/blackjack/referenceLinks";
import { EMPTY_TALLY, explainModeOf, historyTotals, roundLengthOf, type ExplainMode, type RoundLength } from "@/lib/statistics/drillRound";
import { consumePracticeFocus } from "@/lib/statistics/spacedRepetition";
import { storage, type Settings } from "@/lib/statistics/storage";
import { CountStrip } from "./CountStrip";
import { HandTable } from "./HandTable";
import { IndexLine } from "./IndexLine";
import { PracticeLines, ReferenceLink, UnfinishedRoundCallout } from "./parts";
import { restoreRound, saveRound, savedRoundDetail, type SavedRound } from "./progress";
import { RoundPlay, type PausedView } from "./RoundPlay";
import { StrategySetup, type ModeOption } from "./StrategySetup";
import { StrategySummary } from "./StrategySummary";
import { isResumable, peekPracticeFocus, playTone, startedRules, useStoredSessions, usePhaseEntry, useStrategySettings, useUnfinishedProgress } from "./hooks";
import { useStrategyRound, type RoundAdapter, type RoundAnswer, type RoundPlan, type RoundStart } from "./useStrategyRound";

const DRILL = "Deviations" as const;
const PREF_KEY = "countlab:drill-setup:deviations";
const SLOW_MS = 3000;

/** Saved progress ("hilo:progress:Deviations"); `mode` is an optional addition. */
type DeviationSaved = SavedRound<IndexQueueItem> & { mode?: IndexMode };
type Pref = { mode: IndexMode; length: RoundLength; explain: ExplainMode };
const DEFAULT_PREF: Pref = { mode: "standard", length: 10, explain: "mistakes" };
const modeOf = (value: unknown): IndexMode => (value === "adaptive" ? "adaptive" : "standard");

const REFERENCE = { href: "/reference/deviations", label: "View deviation reference" };
const DESCRIPTION = "At some true counts the best play differs from basic strategy. These are index plays, also called deviations. See the hand and the count, then choose.";
const KEYS = [
  { keys: ["H"], label: "Hit" }, { keys: ["S"], label: "Stand" }, { keys: ["D"], label: "Double" }, { keys: ["P"], label: "Split" },
  { keys: ["R"], label: "Surrender" }, { keys: ["I"], label: "Insurance" }, { keys: ["N"], label: "No insurance / play it out" }, { keys: ["Enter"], label: "Next hand" },
];
const LETTER: Record<DeviationAction, string> = { H: "H", S: "S", D: "D", P: "P", R: "R", I: "I", N: "N" };

export function DeviationDrill() {
  const [pref, remember, restored] = useDrillSetupPref<Pref>(PREF_KEY, DEFAULT_PREF);
  if (!restored) return null;
  return <DeviationSession pref={{ mode: modeOf(pref.mode), length: roundLengthOf(pref.length), explain: explainModeOf(pref.explain) }} remember={remember} />;
}

const rowsFor = (settings: Settings) => indexTrainingRows({ decks: settings.decks, dealerHitsSoft17: settings.dealerHitsSoft17, surrender: settings.surrender });
const keepFor = (rows: readonly IndexRow[]) => (item: IndexQueueItem) => Boolean(item && typeof item.tc === "number" && findIndexRow(rows, item));

interface Focus {
  label: string;
  rows: IndexRow[];
}

function boot(settings: Settings, pref: Pref) {
  const rows = rowsFor(settings);
  const progress = storage.progress<Partial<DeviationSaved>>(DRILL);
  const category = peekPracticeFocus(DRILL);
  const focus: Focus | undefined = category ? { label: /^insurance/i.test(category) ? "insurance" : category, rows: focusRows(category, rows) } : undefined;
  const restoredRound = isResumable(progress) ? restoreRound(progress!.state, keepFor(rows)) : undefined;
  const mode = progress?.state?.mode ? modeOf(progress.state.mode) : pref.mode;
  const start: RoundStart<IndexQueueItem> = restoredRound && !focus
    ? { phase: "play", plan: { ...restoredRound.plan, mode }, tally: restoredRound.tally, resumedAt: progress!.updatedAt }
    : { phase: "setup", plan: { length: pref.length, explain: pref.explain, retry: false, mode }, tally: EMPTY_TALLY };
  // A round whose remaining hands the rules no longer deal (surrender switched off elsewhere) is set aside.
  const dropped = isResumable(progress) && !restoredRound;
  return { start, focus, mode, dropped };
}

const TC_TONE = (tc: number) => (tc <= -3 ? "var(--count-cold)" : tc < 0 ? "var(--count-low)" : tc === 0 ? "var(--count-flat)" : tc < 3 ? "var(--count-warm)" : "var(--count-hot)");

function DeviationSession({ pref, remember }: { pref: Pref; remember: (next: Partial<Pref>) => void }) {
  const settings = useStrategySettings();
  const sessions = useStoredSessions();
  const [initial] = useState(() => boot(storage.settings(), pref));
  const [mode, setMode] = useState<IndexMode>(initial.mode);
  const [length, setLength] = useState<RoundLength>(pref.length);
  const [explain, setExplainPref] = useState<ExplainMode>(pref.explain);
  const [focus, setFocus] = useState<Focus | undefined>(initial.focus);
  const [expanded, setExpanded] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [setAside, setSetAside] = useState(initial.dropped);
  useEffect(() => {
    consumePracticeFocus(DRILL);
    if (initial.dropped) storage.clearProgress(DRILL);
  }, [initial]);

  const rows = useMemo(() => rowsFor(settings), [settings]);
  const history = historyTotals(sessions, DRILL);

  const adapter: RoundAdapter<IndexHand, IndexQueueItem> = {
    drill: DRILL,
    deal: (index, plan) => {
      // Retry rounds play their queue in order; a focused round mixes its seeded hands with random ones.
      const queued = plan.retry ? plan.queue?.[index] : index % 2 === 0 ? plan.queue?.[index / 2] : undefined;
      const seeded = queued && findIndexRow(rows, queued);
      if (queued && seeded) return resolveIndexHand(seeded, queued.tc);
      const entry = pickIndexRow(rows, modeOf(plan.mode), history);
      return resolveIndexHand(entry, drawTrueCount(entry.row));
    },
    grade: (hand, chosen) => ({ ok: chosen === hand.correct, category: indexCategory(hand), mistake: indexMistake(hand, chosen as DeviationAction) }),
    presented: (hand, attempt) => track("question_presented", { drill: DRILL, category: hand.hand, scenario: `${hand.hand}_v_${hand.dealer}`, attempt }),
    answered: ({ hand, chosen, ok, ms, number }, streak) => {
      playTone(ok, settings.sound);
      track("deviation_answered", { ok, chosen, correct: hand.correct, category: indexCategory(hand), hand: hand.hand, dealer: hand.dealer, tc: hand.tc, responseTimeMs: ms, attempt: number, streak, isDeviation: hand.departureApplies });
    },
    skipped: (hand, attempt, elapsedMs) => track("answer_skipped", { drill: DRILL, category: hand.hand, scenario: `${hand.hand}_v_${hand.dealer}`, attempt, elapsedMs }),
    started: (plan) => ({ drill: DRILL, questionTarget: plan.length, ...startedRules(settings) }),
    spoken: spokenIndexHand,
    verdict: ({ hand, chosen, ok }, full) => ok
      ? `Correct. ${indexAnswerName(hand.correct, hand.kind)}.`
      : `Not quite. You chose ${indexAnswerName(chosen as DeviationAction, hand.kind)}; the play is ${indexAnswerName(hand.correct, hand.kind)}.${full ? ` ${indexReasoning(hand)}` : ""}`,
    progress: (plan, tally) => ({ ...saveRound(plan, tally), mode: modeOf(plan.mode) } satisfies DeviationSaved),
  };
  const round = useStrategyRound(adapter, initial.start);
  usePhaseEntry(round.phase);
  const [unfinishedProgress, reloadUnfinished] = useUnfinishedProgress<Partial<DeviationSaved>>(DRILL, round.phase === "setup");
  const unfinished = isResumable(unfinishedProgress) ? restoreRound(unfinishedProgress!.state, keepFor(rows)) : undefined;

  const newPlan = (): RoundPlan<IndexQueueItem> => {
    const queue = focus?.rows.length ? focusQueue(focus.rows) : undefined;
    return { length, explain, retry: false, queue, mode };
  };
  const startFromSetup = () => {
    if (unfinished) { setConfirmReplace(true); return; }
    begin();
  };
  const begin = () => {
    round.start(newPlan());
    setFocus(undefined);
  };
  const retry = (items: IndexQueueItem[]) => {
    if (!items.length) {
      toast({ message: "Those plays are not index plays under your table rules now.", tone: "info" });
      return;
    }
    round.start({ length: items.length, explain: round.plan.explain, retry: true, queue: items, mode: round.plan.mode });
  };
  const header = { eyebrow: "Strategy drill", title: "Deviations" };

  if (round.phase === "summary" && round.session) {
    const slow = round.log.filter((entry) => entry.ok && entry.ms > SLOW_MS);
    return (
      <StrategySummary
        session={round.session}
        drillTitle={header.title}
        onPlayAgain={() => round.start({ length, explain, retry: false, mode })}
        onRetry={() => retry(indexRetryQueue(round.session!.mistakes, rows))}
        onChangeSetup={round.changeSetup}
        // Every play in the round, weakest first: a 50-hand round can touch 30 plays, and each one is worth a look.
        breakdownTitle="By hand"
        mistakeHref={(mistake) => {
          const parsed = parseIndexMistake(mistake);
          return referenceHref("deviations", parsed && indexChartCell(parsed));
        }}
        slow={slow.map((entry) => ({ id: entry.number, text: `${entry.hand.hand} vs ${entry.hand.dealer} at ${countText(entry.hand.tc)}`, ms: entry.ms }))}
        onRetrySlow={() => retry(slow.map((entry) => ({ hand: entry.hand.hand, dealer: entry.hand.dealer, kind: entry.hand.kind, tc: entry.hand.tc })))}
        footer={<PracticeLines drill={DRILL} sessions={sessions} unit={{ one: "hand", many: "hands" }} showLast={false} />}
      />
    );
  }

  if (round.phase === "play") {
    const hand = round.hand;
    if (!hand) return null;
    const question = hand.kind === "insurance"
      ? `The dealer shows an ace. Take insurance at true count ${countText(hand.tc)}?`
      : hand.kind === "surrender" ? `Surrender at true count ${countText(hand.tc)}, or play it out?` : `What's the play at true count ${countText(hand.tc)}?`;
    return (
      <RoundPlay
        drillTitle={header.title}
        reference={<ReferenceLink {...REFERENCE} className="hidden sm:inline-flex" />}
        round={round}
        dockLabel="Deviation actions"
        correctOf={(answered) => answered.correct}
        options={hand.options.map((value) => ({
          value,
          label: indexAnswerName(value, hand.kind),
          letter: LETTER[value],
          swatch: value === "N" || value === "I" ? undefined : ACTION_STYLE[value],
          disabled: hand.disabled.includes(value),
        }))}
        table={(
          <HandTable player={hand.kind === "insurance" ? undefined : hand.player} dealer={hand.dealerCard} dealKey={round.handSerial}>
            <CountStrip tc={hand.tc} rc={hand.rc} tone={TC_TONE(hand.tc)} />
          </HandTable>
        )}
        question={<h2 className="font-display text-xl font-semibold">{question}</h2>}
        paused={round.paused && pausedView(round.paused)}
        strip={round.last && stripView(round.last)}
        log={round.log.map((entry) => ({ id: entry.number, ok: entry.ok, text: `${entry.hand.hand === "Insurance" ? "Ins." : `${entry.hand.hand} v ${entry.hand.dealer}`} @ ${countText(entry.hand.tc)}`, detail: entry.ok ? undefined : indexAnswerName(entry.hand.correct, entry.hand.kind), ms: entry.ms }))}
        chip={round.plan.retry ? <span className="hidden rounded-full border border-[var(--rule)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)] sm:inline-flex">Retrying your misses</span> : undefined}
        shortcuts={settings.shortcuts}
        remember={(next) => { setExplainPref(next); remember({ explain: next }); }}
      />
    );
  }

  const surrenderRows = rows.filter((entry) => entry.kind === "surrender").length;
  const missed = mostMissed(rows, history);
  const modes: ModeOption<IndexMode>[] = [
    { value: "standard", label: "All plays", ariaLabel: "All index plays", help: "Every index play for your rules, at random, each at a count near its index." },
    { value: "adaptive", label: "Most missed", help: "Plays you get wrong come back more often, weighted by how often you miss them. Plays you have not tried count as half-missed." },
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
            {setAside && <Callout tone="info" title="Your unfinished round was set aside" onDismiss={() => setSetAside(false)}>Its remaining plays are not index plays under your current table rules.</Callout>}
            {round.notice === "nothing-saved" && <Callout tone="info" title="Nothing was answered, so nothing was saved." onDismiss={() => round.setNotice(undefined)} />}
            {focus && (focus.rows.length ? (
              <Callout tone="info" title={`Focusing on ${focus.label}`} onDismiss={() => setFocus(undefined)}>
                The round opens with this play at counts just below, at and above its index, mixed with other plays.
              </Callout>
            ) : (
              <Callout tone="warn" title={`${focus.label} isn't an index play under your table rules`} onDismiss={() => setFocus(undefined)}>
                The round deals your usual mix. Your rules decide which plays have an index, for example whether surrender is offered.
              </Callout>
            ))}
            {unfinished && unfinishedProgress && (
              <UnfinishedRoundCallout
                detail={savedRoundDetail(unfinished)}
                answered={unfinished.tally.answered}
                updatedAt={unfinishedProgress.updatedAt}
                onResume={() => {
                  const saved = modeOf(unfinishedProgress.state?.mode);
                  setMode(saved);
                  setFocus(undefined);
                  round.resume({ ...unfinished.plan, mode: saved }, unfinished.tally, unfinishedProgress.updatedAt);
                }}
                onDiscard={() => { round.discard(); reloadUnfinished(); }}
              />
            )}
          </div>
        )}
        modeLabel="Hands to practise"
        modes={modes}
        mode={mode}
        onMode={(next) => { track("practice_mode_changed", { drill: DRILL, from: mode, to: next }); setMode(next); remember({ mode: next }); }}
        modeNote={missed && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Most missed so far: {missed.category}, {Math.round((missed.correct / missed.total) * 100)}% of {missed.total}.</span>
            <GhostButton size="compact" onClick={() => setFocus({ label: missed.category, rows: focusRows(missed.category, rows) })}>Focus on it</GhostButton>
          </span>
        )}
        length={length}
        onLength={(next) => { setLength(next); remember({ length: next }); }}
        explain={explain}
        onExplain={(next) => { setExplainPref(next); remember({ explain: next }); }}
        rulesNote={<>{rows.length} index plays for these rules{surrenderRows ? `, ${surrenderRows} of them surrender decisions` : ""}.</>}
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
        onConfirm={() => { setConfirmReplace(false); begin(); reloadUnfinished(); }}
      />
    </DrillFrame>
  );
}

function IndexFacts({ hand }: { hand: IndexHand }) {
  return (
    <span className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--ink)] sm:font-data">
      <span>Basic strategy: {indexAnswerName(hand.baseline, hand.kind)}</span>
      <span>Index: {hand.always ? "Always" : countText(hand.index)}{!hand.always && <HelpTip label="Index">The true count at which the play changes. It applies at that count or beyond, in the direction shown on the line below.</HelpTip>}</span>
    </span>
  );
}

function pausedView({ hand, chosen, ok }: RoundAnswer<IndexHand>): PausedView {
  const correct = indexAnswerName(hand.correct, hand.kind);
  const cell = indexChartCell(hand);
  const caveat = / Use surrender instead[^.]*\./.exec(hand.sentence)?.[0];
  return {
    ok,
    title: ok ? `Correct: ${correct}` : `Not quite: the play is ${correct}`,
    detail: <>{!ok && <b className="font-semibold text-[var(--ink)]">You chose {indexAnswerName(chosen as DeviationAction, hand.kind)}.</b>}<IndexFacts hand={hand} /></>,
    explanation: <span className="block leading-5 sm:leading-6">{indexReasoning(hand)}{caveat && <span className="mt-1 block text-xs leading-4 sm:mt-0 sm:inline sm:text-sm sm:leading-6">{caveat}</span>}</span>,
    visual: <IndexLine hand={hand} />,
    link: cell
      ? { href: referenceHref("deviations", cell), label: `See ${hand.hand} vs ${hand.dealer} on the chart` }
      : { href: referenceHref("deviations"), label: "Open the deviation chart" },
  };
}

function stripView({ hand, chosen, ok, ms }: RoundAnswer<IndexHand>) {
  const text = hand.kind === "insurance" ? `Insurance at ${countText(hand.tc)}` : `${hand.hand} vs ${hand.dealer} at ${countText(hand.tc)}`;
  return {
    ok,
    summary: ok
      ? <>Last hand: <span className="font-data">{text}</span> · {indexAnswerName(hand.correct, hand.kind)} · <span className="font-data">{(ms / 1000).toFixed(1)} s</span></>
      : <>Last hand: <span className="font-data">{text}</span> · you chose {indexAnswerName(chosen as DeviationAction, hand.kind)}, the play is {indexAnswerName(hand.correct, hand.kind)}</>,
    details: <div className="grid gap-3"><p>{indexReasoning(hand)}</p><IndexLine hand={hand} /></div>,
  };
}
