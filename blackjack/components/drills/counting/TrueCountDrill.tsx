"use client";
import { useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useCallback, useRef, useState } from "react";
import { DrillFrame, DrillHud, DrillStage, FeedbackPanel, formatClock, ResumeBanner, useDrillSetupPref } from "@/components/drill";
import { announce, Button, GhostButton, HelpTip } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { addCategory, TrayVisual } from "@/components/DrillKit";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { classifyTrueCountError, ERROR_CATEGORY_LABEL, makeTrueCountScenario, rightForOwnEstimate, type DeckResolution, type TrueCountScenario } from "@/lib/blackjack/countingTraining";
import {
  matchTrueCountPreset,
  normalizeTrueCountFocus,
  RESOLUTION_WORD,
  roundingExamples,
  ROUNDING_LABEL,
  TRUE_COUNT_FOCUS_LABEL,
  TRUE_COUNT_SESSION_CARDS,
  type TrueCountCardId,
  type TrueCountFocus,
  type TrueCountMode,
  type TrueCountValues,
} from "@/lib/blackjack/countingSetup";
import { signed, trueCount } from "@/lib/blackjack/hiLo";
import { displaySigned, parseAnswer } from "@/lib/blackjack/numericAnswer";
import { dueItemKeys, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { makeSession, storage, type CountingErrorCategory, type Mistake, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { AnswerPad } from "./AnswerPad";
import { CountingSummary } from "./CountingSummary";
import { isRecent, readArrival, useConsumeArrival, useEntryFocus, useNow, useStoredSessions, useUnfinishedProgress } from "./hooks";
import { AsideCard, FocusCallout, UnfinishedCallout, YourProgress } from "./SetupParts";
import { TrueCountSetup, type TrueCountSetupState } from "./true-count/TrueCountSetup";

const DRILL = "True Count" as const;

/**
 * Saved progress ("hilo:progress:True Count"). `message` keeps its legacy
 * wording so older app versions can still show it on resume; `target` is an
 * optional addition (falls back to the Settings default).
 */
type TrueCountSaved = {
  decks: number; resolution: DeckResolution; mode: TrueCountMode; focus: TrueCountFocus;
  feedbackMode: "immediate" | "end"; phase: "question" | "feedback"; question: TrueCountScenario;
  tcAnswer: string; deckAnswer: string; index: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>; message: string; totalMs: number;
  target?: number;
};
type TrueCountPref = { values?: TrueCountValues; decks?: number; basis?: number };
const PREF_KEY = "countlab:drill-setup:true-count";
type Phase = "setup" | "question" | "feedback" | "done";
type Arrival = ReturnType<typeof readArrival>;

export function TrueCountDrill() {
  return <Suspense fallback={null}><TrueCountLoader /></Suspense>;
}

function TrueCountLoader() {
  const params = useSearchParams();
  useConsumeArrival(DRILL);
  const [pref, remember, restored] = useDrillSetupPref<TrueCountPref>(PREF_KEY, {});
  const [boot, setBoot] = useState(() => ({ key: 0, arrival: readArrival(DRILL, params), resume: false }));
  const restart = useCallback((options: { resume?: boolean; keepArrival?: boolean }) => setBoot((current) => ({ key: current.key + 1, arrival: options.keepArrival ? current.arrival : { starter: false }, resume: Boolean(options.resume) })), []);
  if (!restored) return null;
  return <TrueCountSession key={boot.key} arrival={boot.arrival} forceResume={boot.resume} remounted={boot.key > 0} pref={pref} remember={remember} restart={restart} />;
}

/** Grade a question from its stored answers (so a resumed feedback screen shows the same verdict). */
function grade(question: TrueCountScenario, mode: TrueCountMode, tcText: string, deckText: string) {
  const tc = parseAnswer(tcText, "signed-int");
  const deck = parseAnswer(deckText, "decimal");
  const tcOk = tc.ok && tc.value === question.answer;
  const deckOk = mode === "division" || (deck.ok && Math.abs(deck.value - question.estimatedDecksRemaining) < 0.001);
  return { tcOk, deckOk, ok: tcOk && deckOk, tc: tc.ok ? tc.value : null, deck: deck.ok ? deck.value : null };
}

function Tile({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`grid min-w-0 content-start gap-2 rounded-2xl bg-well/20 p-3 sm:p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">{title}</p>
      {children}
    </div>
  );
}

function TrueCountSession({ arrival, forceResume, remounted, pref, remember, restart }: { arrival: Arrival; forceResume: boolean; remounted: boolean; pref: TrueCountPref; remember: (next: TrueCountPref) => void; restart: (options: { resume?: boolean; keepArrival?: boolean }) => void }) {
  const settings = storage.settings();
  const history = useStoredSessions(DRILL);
  const allSessions = useStoredSessions();
  const wide = useMediaQuery("(min-width: 768px)");

  const [initial] = useState(() => {
    const progress = storage.progress<TrueCountSaved>(DRILL);
    const saved = progress && (forceResume || isRecent(progress)) && progress.state?.question ? progress.state : undefined;
    const handoff = arrival.focus ? normalizeTrueCountFocus(arrival.focus) : undefined;
    const starter = TRUE_COUNT_SESSION_CARDS[0].values;
    const tray = TRUE_COUNT_SESSION_CARDS.find((card) => card.id === "tray")!.values;
    const remembered = pref.values && pref.basis === settings.decks ? pref : undefined;
    const values: TrueCountValues = saved
      ? { mode: saved.mode, resolution: saved.resolution, focus: saved.focus }
      : handoff && handoff !== "adaptive" ? { ...tray, focus: handoff }
      : remembered?.values ?? (storage.sessions().some((session) => session.drill === DRILL) ? tray : starter);
    const setup: TrueCountSetupState = {
      ...values,
      decks: saved?.decks ?? remembered?.decks ?? settings.decks,
      feedbackMode: saved?.feedbackMode ?? settings.countingFeedback,
      target: saved?.target ?? settings.countingSessionQuestions,
    };
    return { progress, saved, setup, handoff: !saved && handoff && handoff !== "adaptive" ? handoff : undefined };
  });
  const saved = initial.saved;
  const [setup, setSetup] = useState<TrueCountSetupState>(initial.setup);
  const { decks, mode, resolution, focus, feedbackMode, target } = setup;
  const matched = matchTrueCountPreset(setup);
  const loaded = useRef<TrueCountValues>({ mode: initial.setup.mode, resolution: initial.setup.resolution, focus: initial.setup.focus });
  const [lastPicked, setLastPicked] = useState<TrueCountCardId>(() => matchTrueCountPreset(initial.setup) ?? "tray");
  const [customizeOpen, setCustomizeOpen] = useState(() => !saved && !initial.handoff && matched === null);
  const [focusNote, setFocusNote] = useState(initial.handoff);

  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [question, setQuestion] = useState<TrueCountScenario | undefined>(saved?.question);
  const [tcAnswer, setTcAnswer] = useState(saved?.tcAnswer ?? "");
  const [deckAnswer, setDeckAnswer] = useState(saved?.deckAnswer ?? "");
  const [index, setIndex] = useState(saved?.index ?? 0);
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [message, setMessage] = useState(saved?.message ?? "");
  const [category, setCategory] = useState<CountingErrorCategory>();
  const [result, setResult] = useState<Session>();
  const [resumed, setResumed] = useState(() => Boolean(saved));
  const [confirmEnd, setConfirmEnd] = useState(false);
  const answerStarted = useRef(Date.now());
  const totalMs = useRef(saved?.totalMs ?? 0);
  const feedbackShownAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  useEntryFocus(root, phase === "setup" ? "setup" : phase === "done" ? "done" : "play", remounted);

  const active = phase === "question" || phase === "feedback";
  useWakeLock(active);
  const progress = useDrillProgress(DRILL, active && Boolean(question) && !result, {
    decks, resolution, mode, focus, feedbackMode, phase: phase === "feedback" ? "feedback" : "question", question: question as TrueCountScenario,
    tcAnswer, deckAnswer, index, correct, streak, best, mistakes, categories, message, totalMs: totalMs.current, target,
  } satisfies TrueCountSaved);
  const now = useNow(phase === "question");

  /** Which counts to draw: the chosen focus, or for adaptive the due or weakest sign. */
  const scenarioFocusNow = (): Exclude<TrueCountFocus, "adaptive"> => {
    if (focus !== "adaptive") return focus;
    const due = dueItemKeys(DRILL, ["negative", "positive", "zero"]);
    if (due.length > 0) return due[0] as "negative" | "positive" | "zero";
    const past = storage.sessions().filter((session) => session.drill === DRILL).flatMap((session) => Object.entries(session.categories ?? {}));
    const weakest = past.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0]?.[0] ?? "";
    return weakest.includes("negative") ? "negative" : weakest.includes("positive") ? "positive" : weakest.includes("zero") ? "zero" : "all";
  };
  /** Show the next question; `answered` is how many have been graded so far. */
  const nextQuestion = (answered: number) => {
    const scenarioFocus = scenarioFocusNow();
    const next = makeTrueCountScenario({ decks, resolution, rounding: settings.rounding, focus: scenarioFocus });
    setQuestion(next); setTcAnswer(""); setDeckAnswer(""); setCategory(undefined); answerStarted.current = Date.now(); setPhase("question");
    announce(`Question ${answered + 1} of ${target}. Running count ${signed(next.runningCount)}${mode === "division" ? `, ${next.estimatedDecksRemaining} decks left` : `, ${decks}-deck shoe`}.`);
    track("question_presented", { drill: DRILL, category: scenarioFocus, scenario: `${next.runningCount < 0 ? "negative" : next.runningCount > 0 ? "positive" : "zero"}_${resolution}_deck`, attempt: answered + 1 });
  };

  const start = () => {
    // One event per setting changed since the page loaded (not per card browsed).
    const from = loaded.current;
    if (from.mode !== mode) track("practice_mode_changed", { drill: DRILL, from: from.mode, to: mode });
    if (from.resolution !== resolution) track("difficulty_changed", { drill: DRILL, from: String(from.resolution), to: String(resolution) });
    if (from.focus !== focus) track("difficulty_changed", { drill: DRILL, from: from.focus, to: focus });
    loaded.current = { mode, resolution, focus };
    remember({ values: { mode, resolution, focus }, decks, basis: settings.decks });
    setIndex(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setMessage(""); setResult(undefined); setResumed(false);
    totalMs.current = 0;
    nextQuestion(0);
    track("drill_started", { drill: DRILL, decks, resolution, mode, focus, questionTarget: target });
  };

  const finish = (askedCount = index, gotCorrect = correct, bestStreak = best, finalMistakes = mistakes, finalCategories = categories) => {
    const session = makeSession(DRILL, askedCount, gotCorrect, totalMs.current, bestStreak, finalMistakes, finalCategories, { divisorResolution: resolution, combinedAccuracy: askedCount ? Math.round(gotCorrect / askedCount * 100) : 0 }, [mode, focus, settings.rounding]);
    progress.cancel();
    storage.addSession(session);
    storage.clearProgress(DRILL);
    setResult(session);
    return session;
  };
  const discard = () => {
    progress.cancel();
    storage.clearProgress(DRILL);
    abandonActivePractice();
    setQuestion(undefined); setIndex(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({}); setMessage(""); setResumed(false);
    setPhase("setup");
  };

  const submit = (tcText: string, deckText: string, skipped = false) => {
    if (!question) return;
    const responseTimeMs = Date.now() - answerStarted.current;
    totalMs.current += responseTimeMs;
    if (skipped) track("answer_skipped", { drill: DRILL, attempt: index + 1, elapsedMs: responseTimeMs });
    const { tcOk, deckOk, ok, tc } = grade(question, mode, tcText, deckText);
    const bucket = question.runningCount < 0 ? "negative" : question.runningCount > 0 ? "positive" : "zero";
    const label = `${bucket}, ${resolution}-deck divisor`, nextCategories = addCategory(categories, label, ok);
    if (focus === "adaptive") recordAnswer(DRILL, bucket, ok);
    const errorCategory: CountingErrorCategory = !deckOk ? "deck estimate" : classifyTrueCountError(question.runningCount, question.estimatedDecksRemaining, question.answer, tc ?? 0);
    const nextMistakes = ok ? mistakes : [...mistakes, { question: `RC ${signed(question.runningCount)} with ${question.estimatedDecksRemaining} decks remaining`, userAnswer: `TC ${tcText || "blank"}${mode === "combined" ? `, ${deckText || "blank"} decks` : ""}`, correctAnswer: `TC ${signed(question.answer)}, ${question.estimatedDecksRemaining} decks`, explanation: `${signed(question.runningCount)} ÷ ${question.estimatedDecksRemaining} = ${(question.runningCount / question.estimatedDecksRemaining).toFixed(2)}. ${settings.rounding === "floor" ? "Floor moves toward negative infinity, so -1.2 becomes -2." : settings.rounding === "truncate" ? "Truncate drops the decimal toward zero, so -1.2 becomes -1." : "Round to the nearest integer."}`, category: errorCategory }];
    const nextCorrect = correct + Number(ok), nextStreak = ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak), nextIndex = index + 1;
    setTcAnswer(tcText); setDeckAnswer(deckText); setCategory(ok ? undefined : errorCategory);
    setCorrect(nextCorrect); setStreak(nextStreak); setBest(nextBest); setMistakes(nextMistakes); setCategories(nextCategories); setIndex(nextIndex); setResumed(false);
    track("true_count_answered", { ok, tcOk, deckOk, mode, focus, category: errorCategory, scenario: label, userAnswer: tcText, correctAnswer: question.answer, responseTimeMs, attempt: nextIndex, streak: nextStreak, tc: question.answer });
    const last = nextIndex >= target;
    // The session is saved at the last answer, so leaving on its feedback loses nothing.
    if (last) finish(nextIndex, nextCorrect, nextBest, nextMistakes, nextCategories);
    if (feedbackMode === "immediate") {
      setMessage(ok ? `Correct: ${signed(question.answer)}` : `Correct answer: ${signed(question.answer)}`);
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(ok ? `Correct. True count ${signed(question.answer)}.` : `Not quite. The true count is ${signed(question.answer)}${mode === "combined" ? ` with ${question.estimatedDecksRemaining} decks left` : ""}.`);
    } else if (last) setPhase("done");
    else nextQuestion(nextIndex);
  };
  const isLast = index >= target;
  const continueAfterFeedback = () => {
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (isLast) {
      // Progress saved by an older version could stop here with the session unsaved.
      if (!result) finish();
      setPhase("done");
      return;
    }
    nextQuestion(index);
  };
  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (index > 0) {
      if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: index + 1, elapsedMs: Date.now() - answerStarted.current });
      finish();
      setPhase("done");
      return;
    }
    setConfirmEnd(true);
  };

  const onPickCard = (id: TrueCountCardId) => {
    const card = TRUE_COUNT_SESSION_CARDS.find((option) => option.id === id)!;
    setSetup((current) => ({ ...current, ...card.values }));
    setLastPicked(id);
    setFocusNote(undefined);
  };
  const unfinished = useUnfinishedProgress(DRILL, phase === "setup");

  if (phase === "done" && result) {
    return (
      <CountingSummary
        session={result}
        title={DRILL}
        tiles={[
          { label: "Accuracy", value: `${result.accuracy}%`, tone: result.accuracy >= 85 ? "good" : result.accuracy >= 70 ? "neutral" : "bad" },
          { label: "Avg answer time", value: `${(result.averageResponseTime / 1000).toFixed(1)} s` },
          { label: "Best streak", value: result.bestStreak, sub: "right in a row" },
        ]}
        onNew={start}
        onChangeSetup={() => { setResult(undefined); setPhase("setup"); }}
      />
    );
  }

  if (phase === "setup" || !question) {
    const bestAccuracy = history.filter((session) => session.questions >= 10).map((session) => session.accuracy).sort((a, b) => b - a)[0];
    const exampleA = trueCount(7, 2.5, settings.rounding), exampleB = trueCount(-3, 2, settings.rounding);
    return (
      <div ref={root} data-counting-drill="">
        <DrillFrame eyebrow="Counting drill" title={DRILL} description="Turn a running count into a true count: estimate the decks left, divide, and round." phase="setup">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <TrueCountSetup
              setup={setup}
              rounding={settings.rounding}
              matched={matched}
              onChange={(next) => setSetup((current) => ({ ...current, ...next }))}
              onPickCard={onPickCard}
              onReset={() => onPickCard(lastPicked)}
              resetLabel={`Reset to ${TRUE_COUNT_SESSION_CARDS.find((card) => card.id === lastPicked)!.title}`}
              customizeOpen={customizeOpen}
              onCustomizeOpen={setCustomizeOpen}
              firstTime={history.length === 0}
              onStart={start}
              notice={(unfinished || focusNote) && (
                <div className="grid gap-3">
                  {unfinished && <UnfinishedCallout progress={unfinished} detail={`Question ${Math.min(((unfinished.state as TrueCountSaved).index ?? 0) + 1, (unfinished.state as TrueCountSaved).target ?? settings.countingSessionQuestions)} of ${(unfinished.state as TrueCountSaved).target ?? settings.countingSessionQuestions}`} onResume={() => restart({ resume: true })} onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); restart({}); }} />}
                  {focusNote && (
                    <FocusCallout onDismiss={() => setFocusNote(undefined)} action={focus !== "adaptive" && <GhostButton size="compact" onClick={() => { setSetup((current) => ({ ...current, focus: "adaptive" })); setFocusNote(undefined); }}>Use adaptive instead</GhostButton>}>
                      Questions focus on <b className="text-[var(--ink)]">{TRUE_COUNT_FOCUS_LABEL[focusNote]}</b>, picked from your results.
                    </FocusCallout>
                  )}
                </div>
              )}
            />
            <div className="grid content-start gap-4">
              <YourProgress drill={DRILL} sessions={history} allSessions={allSessions} best={{ label: "Best accuracy (10+ questions)", value: bestAccuracy === undefined ? "—" : `${bestAccuracy}%` }} />
              <AsideCard title="How to convert">
                <p><b className="text-[var(--ink)]">True count = running count ÷ decks left.</b></p>
                <p className="mt-2">With {ROUNDING_LABEL[settings.rounding]} rounding: <span className="font-data text-[var(--ink)]">+7 ÷ 2.5 = 2.8 → {signed(exampleA)}</span>; <span className="font-data text-[var(--ink)]">−3 ÷ 2 = −1.5 → {signed(exampleB)}</span>.</p>
              </AsideCard>
            </div>
          </div>
        </DrillFrame>
      </div>
    );
  }

  const endMode = feedbackMode === "end";
  const current = phase === "feedback" ? index : Math.min(index + 1, target);
  const liveMs = totalMs.current + (phase === "question" ? Math.max(0, now - answerStarted.current) : 0);
  const graded = phase === "feedback" ? grade(question, mode, tcAnswer, deckAnswer) : undefined;
  const raw = question.runningCount / question.estimatedDecksRemaining;
  const ownEstimate = graded && !graded.deckOk && graded.deck !== null && graded.tc !== null && rightForOwnEstimate({ runningCount: question.runningCount, decksAnswer: graded.deck, trueCountAnswer: graded.tc, rounding: settings.rounding });
  const rcTile = <Tile title="Running count" className="grid-rows-[auto_1fr]"><p className="self-center font-data text-5xl font-semibold text-[var(--ink)] sm:text-6xl">{displaySigned(question.runningCount)}</p></Tile>;

  return (
    <div ref={root} data-counting-drill="" data-counting-play="">
      <DrillFrame eyebrow="Counting drill" title={DRILL} phase="play">
        <DrillHud
          progress={{ done: index, total: target, label: `Question ${current} of ${target}` }}
          stats={[
            endMode ? { id: "answered", label: "Answered", value: index, phone: true } : { id: "accuracy", label: "Accuracy", value: index ? `${Math.round(correct / index * 100)}%` : "—", phone: true },
            ...(endMode ? [] : [{ id: "streak", label: "Streak", value: streak }]),
            { id: "time", label: "Time", value: formatClock(liveMs), phone: true },
          ]}
          onEnd={endDrill}
          endLabel="End drill"
        />
        <DrillStage
          label="Question"
          size="lg"
          banner={resumed && initial.progress && <ResumeBanner detail={`Question ${current} of ${target}`} updatedAt={initial.progress.updatedAt} discardLabel="Discard and start over" onDiscard={() => { progress.cancel(); storage.clearProgress(DRILL); abandonActivePractice(); restart({ keepArrival: true }); }} />}
        >
          <div className="grid gap-5">
            <div className="grid grid-cols-[1.2fr_1fr] gap-3 sm:gap-4 md:grid-cols-2">
              {mode === "combined"
                ? <Tile title="Discard tray"><TrayVisual totalDecks={question.totalDecks} remainingDecks={question.exactDecksRemaining} size={wide ? "md" : "sm"} caption={<><b className="font-data text-[var(--ink)]">{question.totalDecks}-deck shoe</b><span className="hidden sm:inline"> · the fill is cards already played</span></>} /></Tile>
                : rcTile}
              {mode === "combined"
                ? rcTile
                : <Tile title="Decks left"><p className="font-data text-5xl font-semibold text-[var(--ink)] sm:text-6xl">{question.estimatedDecksRemaining}</p><p className="text-xs">{question.totalDecks}-deck shoe</p></Tile>}
            </div>
            {phase === "question" ? (
              <div className="grid gap-3">
                <AnswerPad
                  key={`question-${index}`}
                  fields={[
                    ...(mode === "combined" ? [{ id: "decks", label: "Decks remaining", ariaLabel: "Estimated decks remaining", value: deckAnswer, onChange: setDeckAnswer, kind: "decimal" as const, unit: "decks", help: `Nearest ${RESOLUTION_WORD[resolution]} deck` }] : []),
                    { id: "true-count", label: "True count", value: tcAnswer, onChange: setTcAnswer, kind: "signed-int" as const, help: <span className="inline-flex items-center">{ROUNDING_LABEL[settings.rounding]} rounding<HelpTip label={`${ROUNDING_LABEL[settings.rounding]} rounding`}>Round the division result the way your Settings say: {roundingExamples(settings.rounding)}.</HelpTip></span> },
                  ]}
                  submitLabel="Check answer"
                  onSubmit={(_, texts) => mode === "combined" ? submit(texts[1], texts[0]) : submit(texts[0], "")}
                  secondary={<GhostButton size="compact" type="button" onClick={() => submit("", "", true)}>Skip question</GhostButton>}
                />
              </div>
            ) : graded && (
              <FeedbackPanel
                ok={graded.ok}
                title={graded.ok ? "Correct" : "Not quite"}
                detail={graded.ok ? <>True count <b className="font-data text-[var(--ink)]">{displaySigned(question.answer)}</b> from {displaySigned(question.runningCount)} ÷ {question.estimatedDecksRemaining}.</> : undefined}
                rows={graded.ok ? undefined : [
                  ...(mode === "combined" ? [{ label: "Decks left", yours: deckAnswer || "—", correct: String(question.estimatedDecksRemaining), ok: graded.deckOk }] : []),
                  { label: "True count", yours: graded.tc === null ? "—" : displaySigned(graded.tc), correct: displaySigned(question.answer), ok: graded.tcOk },
                ]}
                cause={graded.ok || !category ? undefined : ERROR_CATEGORY_LABEL[category]}
                action={<Button onClick={continueAfterFeedback} className="min-w-44">{isLast ? "See results" : "Next question"}</Button>}
              >
                <p className="font-data text-[var(--ink)]">{displaySigned(question.runningCount)} ÷ {question.estimatedDecksRemaining} = {raw.toFixed(2).replace("-", "\u2212")} → {ROUNDING_LABEL[settings.rounding]} → {displaySigned(question.answer)}</p>
                {ownEstimate && <p className="mt-1">Your true count was right for your estimate of {graded.deck} decks. The miss was the tray reading.</p>}
              </FeedbackPanel>
            )}
          </div>
        </DrillStage>
        <ConfirmModal open={confirmEnd} tone="danger" title="End without saving?" description="You have not answered any questions, so nothing will be saved." confirmLabel="End without saving" cancelLabel="Keep going" onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: index + 1, elapsedMs: Date.now() - answerStarted.current }); discard(); }} />
      </DrillFrame>
    </div>
  );
}
