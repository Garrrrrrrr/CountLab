"use client";
import { Suspense, useCallback, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { NumberPad } from "@/components/blackjack";
import { DrillSummary, Feedback, PlayDock, PlayFrame, ResumeBanner } from "@/components/drill/DrillKit";
import { announce, Button, Callout } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import {
  divisionText,
  ERROR_CATEGORY_LABEL,
  gradeTrueCount,
  makeTrueCountScenario,
  type DeckResolution,
  type TrueCountScenario,
} from "@/lib/blackjack/countingTraining";
import {
  fitQuestionTarget,
  fitShoeSize,
  matchTrueCountPreset,
  normalizeTrueCountFocus,
  RESOLUTION_WORD,
  ROUNDING_LABEL,
  TRUE_COUNT_FOCUS_LABEL,
  TRUE_COUNT_SESSION_CARDS,
  type FeedbackMode,
  type TrueCountCardId,
  type TrueCountFocus,
  type TrueCountMode,
  type TrueCountValues,
} from "@/lib/blackjack/countingSetup";
import { decksLeftFor, drawTrayPhoto, drawTrayPhotoWhere, trayPhotoFor, type TrayPhoto as TrayPhotoData } from "@/lib/blackjack/deckPhotos";
import { signed } from "@/lib/blackjack/hiLo";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import { useSettings } from "@/lib/hooks/useSettings";
import { useSessions } from "@/lib/hooks/useSessions";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { relativeTime } from "@/lib/statistics/drillRound";
import { dueItemKeys, recordAnswer } from "@/lib/statistics/spacedRepetition";
import { makeSession, storage, type CountingErrorCategory, type Mistake, type Session, type Settings } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { FitTray } from "../counting-shared/FitTray";
import { readSetupMemory, useArrival, useNow, useSavedProgress, writeSetupMemory } from "../counting-shared/hooks";
import { BenchmarkNote, Breakdown, CauseCard, COMPACT_PAD, displayMistakes, PadField, signedText, verdict } from "../counting-shared/parts";
import { TrueCountSetup, type TrueCountSetupState } from "./TrueCountSetup";

const DRILL = "True Count" as const;
const MEMORY_KEY = "countlab:drill-setup:true-count";

/**
 * Saved progress ("hilo:progress:True Count"), in the field names earlier
 * versions used so their unfinished sessions resume here. `index` is the
 * number of questions already graded. The fields after `target` are additions.
 */
type TrueCountSaved = {
  decks: number; resolution: DeckResolution; mode: TrueCountMode; focus: TrueCountFocus;
  feedbackMode: FeedbackMode; phase: "question" | "feedback"; question: TrueCountScenario;
  tcAnswer: string; deckAnswer: string; index: number; correct: number; streak: number; best: number;
  mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>; message: string; totalMs: number;
  target?: number; photo?: TrayPhotoData | null; seen?: string[]; deckRight?: number; divisionRight?: number;
};
type Memory = { values?: TrueCountValues; decks?: number; basis?: number };
type Phase = "setup" | "question" | "feedback" | "done";
type Field = "decks" | "tc";

const usable = (saved: TrueCountSaved) => Boolean(saved.question && Number.isFinite(saved.question.runningCount) && Number.isFinite(saved.index));
/** The tray for a saved question; sessions saved before tray photos get the photo nearest their depth. */
const savedPhoto = (saved: TrueCountSaved | undefined): TrayPhotoData | null => {
  if (!saved || saved.mode !== "combined") return null;
  if (saved.photo) return saved.photo;
  return trayPhotoFor(saved.question.totalDecks - saved.question.exactDecksRemaining) ?? null;
};

const ROUNDING_NOTE = { floor: "Floor moves toward minus infinity, so −1.2 becomes −2.", truncate: "Truncate drops the decimal toward zero, so −1.2 becomes −1.", nearest: "Round to the nearest whole number." } as const;

export function TrueCountDrill() {
  return <Suspense fallback={null}><TrueCountLoader /></Suspense>;
}

function TrueCountLoader() {
  const { settings, ready } = useSettings();
  const arrival = useArrival(DRILL);
  const [boot, setBoot] = useState({ key: 0, resume: false });
  const restart = useCallback((resume: boolean) => setBoot((current) => ({ key: current.key + 1, resume })), []);
  if (!ready) return null;
  return <TrueCountSession key={boot.key} settings={settings} focus={boot.key === 0 ? arrival.focus : undefined} resume={boot.resume} restart={restart} />;
}

function TrueCountSession({ settings, focus: arrivalFocus, resume, restart }: { settings: Settings; focus?: string; resume: boolean; restart: (resume: boolean) => void }) {
  const history = useSessions(DRILL);
  const rounding = settings.rounding;

  const [init] = useState(() => {
    const progress = resume ? storage.progress<TrueCountSaved>(DRILL) : null;
    const saved = progress?.state && usable(progress.state) ? progress.state : undefined;
    const handoff = arrivalFocus ? normalizeTrueCountFocus(arrivalFocus) : undefined;
    const starter = TRUE_COUNT_SESSION_CARDS[0].values;
    const tray = TRUE_COUNT_SESSION_CARDS.find((card) => card.id === "tray")!.values;
    const memory = readSetupMemory<Memory>(MEMORY_KEY);
    const remembered = memory?.values && memory.basis === settings.decks ? memory : undefined;
    const values: TrueCountValues = saved
      ? { mode: saved.mode, resolution: saved.resolution, focus: saved.focus }
      : handoff && handoff !== "adaptive" ? { ...tray, focus: handoff }
      : remembered?.values ?? (storage.sessions().some((session) => session.drill === DRILL) ? tray : starter);
    const setup: TrueCountSetupState = {
      ...values,
      decks: saved?.decks ?? fitShoeSize(remembered?.decks ?? settings.decks),
      feedbackMode: saved?.feedbackMode ?? settings.countingFeedback,
      target: saved?.target ?? fitQuestionTarget(settings.countingSessionQuestions),
    };
    return { saved, setup, handoff: !saved && handoff && handoff !== "adaptive" ? handoff : undefined };
  });
  const saved = init.saved;
  const [setup, setSetup] = useState<TrueCountSetupState>(init.setup);
  const { decks, mode, resolution, focus, feedbackMode, target } = setup;
  const matched = matchTrueCountPreset(setup);
  const loaded = useRef<TrueCountValues>({ mode: init.setup.mode, resolution: init.setup.resolution, focus: init.setup.focus });
  const [lastPicked, setLastPicked] = useState<TrueCountCardId>(() => matchTrueCountPreset(init.setup) ?? "tray");
  const [focusNote, setFocusNote] = useState(init.handoff);

  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [question, setQuestion] = useState<TrueCountScenario | undefined>(saved?.question);
  const [photo, setPhoto] = useState<TrayPhotoData | null>(() => savedPhoto(saved));
  const [tcAnswer, setTcAnswer] = useState(saved?.tcAnswer ?? "");
  const [deckAnswer, setDeckAnswer] = useState(saved?.deckAnswer ?? "");
  const [field, setField] = useState<Field>(saved?.mode === "combined" && !saved.deckAnswer ? "decks" : "tc");
  const [index, setIndex] = useState(saved?.index ?? 0);
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [deckRight, setDeckRight] = useState(saved?.deckRight ?? 0);
  const [divisionRight, setDivisionRight] = useState(saved?.divisionRight ?? 0);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [seen, setSeen] = useState<string[]>(saved?.seen ?? (saved?.photo ? [saved.photo.file] : []));
  const [result, setResult] = useState<Session>();
  const [dismissed, setDismissed] = useState(false);
  const answerStarted = useRef(Date.now());
  const totalMs = useRef(saved?.totalMs ?? 0);
  const feedbackShownAt = useRef(0);

  const active = phase === "question" || phase === "feedback";
  useWakeLock(active);
  const progress = useDrillProgress(DRILL, active && Boolean(question) && !result, {
    decks, resolution, mode, focus, feedbackMode, phase: phase === "feedback" ? "feedback" : "question", question: question as TrueCountScenario,
    tcAnswer, deckAnswer, index, correct, streak, best, mistakes, categories, message: "", totalMs: totalMs.current, target,
    photo, seen, deckRight, divisionRight,
  } satisfies TrueCountSaved);
  const now = useNow(phase === "question");

  /** Which counts to draw: the chosen focus, or for adaptive the due or weakest sign. */
  const scenarioFocusNow = (): Exclude<TrueCountFocus, "adaptive"> => {
    if (focus !== "adaptive") return focus;
    const due = dueItemKeys(DRILL, ["negative", "positive", "zero"]);
    if (due.length > 0) return due[0] as "negative" | "positive" | "zero";
    const past = history.flatMap((session) => Object.entries(session.categories ?? {}));
    const weakest = past.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0]?.[0] ?? "";
    return weakest.includes("negative") ? "negative" : weakest.includes("positive") ? "positive" : weakest.includes("zero") ? "zero" : "all";
  };

  /** Show the next question; `count` is how many have been graded so far. */
  const nextQuestion = (count: number, shown: string[]) => {
    const scenarioFocus = scenarioFocusNow();
    let nextPhoto: TrayPhotoData | null = null;
    if (mode === "combined") {
      nextPhoto = scenarioFocus === "last-deck" ? drawTrayPhotoWhere(decks, shown, (candidate) => decksLeftFor(candidate, decks) <= 1) : drawTrayPhoto(decks, shown);
      setSeen([...shown, nextPhoto.file]);
    }
    const next = makeTrueCountScenario({ decks, resolution, rounding, focus: scenarioFocus, discarded: nextPhoto?.discarded });
    setQuestion(next); setPhoto(nextPhoto); setTcAnswer(""); setDeckAnswer(""); setField(mode === "combined" ? "decks" : "tc");
    answerStarted.current = Date.now();
    setPhase("question");
    announce(`Question ${count + 1} of ${target}. Running count ${signedText(next.runningCount)}${mode === "division" ? `, ${next.estimatedDecksRemaining} decks left` : `, ${decks}-deck shoe. Estimate the decks left from the tray photo`}.`);
    track("question_presented", { drill: DRILL, category: scenarioFocus, scenario: `${next.runningCount < 0 ? "negative" : next.runningCount > 0 ? "positive" : "zero"}_${resolution}_deck`, attempt: count + 1 });
  };

  const start = () => {
    const from = loaded.current;
    if (from.mode !== mode) track("practice_mode_changed", { drill: DRILL, from: from.mode, to: mode });
    if (from.resolution !== resolution) track("difficulty_changed", { drill: DRILL, from: String(from.resolution), to: String(resolution) });
    if (from.focus !== focus) track("difficulty_changed", { drill: DRILL, from: from.focus, to: focus });
    loaded.current = { mode, resolution, focus };
    writeSetupMemory<Memory>(MEMORY_KEY, { values: { mode, resolution, focus }, decks, basis: settings.decks });
    setIndex(0); setCorrect(0); setStreak(0); setBest(0); setDeckRight(0); setDivisionRight(0); setMistakes([]); setCategories({}); setResult(undefined);
    totalMs.current = 0;
    nextQuestion(0, []);
    track("drill_started", { drill: DRILL, decks, resolution, mode, focus, questionTarget: target });
  };

  const finish = (count = index, gotCorrect = correct, bestStreak = best, finalMistakes = mistakes, finalCategories = categories, decksOk = deckRight, divisionOk = divisionRight) => {
    const pct = (value: number) => (count ? Math.round((value / count) * 100) : 0);
    const session = makeSession(DRILL, count, gotCorrect, totalMs.current, bestStreak, finalMistakes, finalCategories, {
      divisorResolution: resolution,
      combinedAccuracy: pct(gotCorrect),
      mode,
      decks,
      divisionAccuracy: pct(divisionOk),
      ...(mode === "combined" ? { deckAccuracy: pct(decksOk) } : {}),
    }, [mode, focus, rounding]);
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
    setQuestion(undefined); setPhoto(null); setIndex(0); setCorrect(0); setStreak(0); setBest(0); setMistakes([]); setCategories({});
    setPhase("setup");
  };

  const submit = () => {
    if (!question) return;
    const responseTimeMs = Date.now() - answerStarted.current;
    totalMs.current += responseTimeMs;
    const graded = gradeTrueCount({ question, mode, tcText: tcAnswer, deckText: deckAnswer, rounding });
    const bucket = question.runningCount < 0 ? "negative" : question.runningCount > 0 ? "positive" : "zero";
    const key = `${bucket}, ${resolution}-deck divisor`;
    const previous = categories[key] ?? { correct: 0, total: 0 };
    const nextCategories = { ...categories, [key]: { correct: previous.correct + Number(graded.ok), total: previous.total + 1 } };
    if (focus === "adaptive") recordAnswer(DRILL, bucket, graded.ok);
    const est = question.estimatedDecksRemaining;
    const nextMistakes = graded.ok ? mistakes : [...mistakes, {
      question: mode === "combined" ? `Running count ${signed(question.runningCount)}, tray in a ${decks}-deck shoe` : `Running count ${signed(question.runningCount)} with ${est} decks left`,
      userAnswer: `TC ${graded.tc === null ? "blank" : signed(graded.tc)}${mode === "combined" ? `, ${graded.deck ?? "blank"} decks` : ""}`,
      correctAnswer: `TC ${signed(question.answer)}${mode === "combined" ? `, ${est} decks` : ""}`,
      explanation: `${divisionText(question.runningCount, est)}. ${ROUNDING_NOTE[rounding]}${graded.ownEstimate ? ` Your true count was right for your estimate of ${graded.deck} decks: the miss was the tray reading.` : ""}`,
      category: graded.category as CountingErrorCategory,
      ...(photo ? { context: { file: photo.file, discarded: photo.discarded } } : {}),
    }];
    const nextCorrect = correct + Number(graded.ok), nextStreak = graded.ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak), nextIndex = index + 1;
    const nextDeckRight = deckRight + Number(mode === "combined" && graded.deckOk);
    const nextDivisionRight = divisionRight + Number(graded.tcOk || graded.ownEstimate);
    setCorrect(nextCorrect); setStreak(nextStreak); setBest(nextBest); setMistakes(nextMistakes); setCategories(nextCategories); setIndex(nextIndex);
    setDeckRight(nextDeckRight); setDivisionRight(nextDivisionRight);
    track("true_count_answered", { ok: graded.ok, tcOk: graded.tcOk, deckOk: graded.deckOk, mode, focus, category: graded.category, scenario: key, userAnswer: tcAnswer, correctAnswer: question.answer, responseTimeMs, attempt: nextIndex, streak: nextStreak, tc: question.answer });
    const last = nextIndex >= target;
    // Saved at the last answer, so leaving on its verdict loses nothing.
    if (last) finish(nextIndex, nextCorrect, nextBest, nextMistakes, nextCategories, nextDeckRight, nextDivisionRight);
    if (feedbackMode === "immediate") {
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(graded.ok ? `Correct. True count ${signedText(question.answer)}.` : `Not quite. The true count is ${signedText(question.answer)}${mode === "combined" ? ` with ${est} decks left` : ""}.`);
    } else if (last) setPhase("done");
    else nextQuestion(nextIndex, seen);
  };

  /** Enter: from the decks box to the true count box, then grade. */
  const onEnter = () => {
    if (mode === "combined" && field === "decks") {
      const decksLeft = parseAnswer(deckAnswer, "decimal");
      if (!decksLeft.ok || decksLeft.value <= 0) { announce("Enter the decks left as a number, like 2.5."); return; }
      if (tcAnswer === "" || tcAnswer === "-") { setField("tc"); announce("Now the true count."); return; }
      return submit();
    }
    const tc = parseAnswer(tcAnswer, "signed-int");
    if (!tc.ok) { announce(tc.error); return; }
    if (mode === "combined" && deckAnswer === "") { setField("decks"); announce("Enter the decks left first."); return; }
    submit();
  };

  const continueAfterFeedback = () => {
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (index >= target) { if (!result) finish(); setPhase("done"); return; }
    nextQuestion(index, seen);
  };

  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (index > 0) {
      if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: index + 1, elapsedMs: Date.now() - answerStarted.current });
      finish();
      setPhase("done");
      return;
    }
    discard();
  };

  const onPick = (id: TrueCountCardId) => {
    const card = TRUE_COUNT_SESSION_CARDS.find((option) => option.id === id)!;
    setSetup((current) => ({ ...current, ...card.values }));
    setLastPicked(id);
    setFocusNote(undefined);
  };
  const unfinished = useSavedProgress<TrueCountSaved>(DRILL, phase === "setup" && !dismissed, usable);

  if (phase === "done" && result) {
    return <TrueCountSummary session={result} onAgain={start} onChangeSetup={() => { setResult(undefined); setPhase("setup"); }} />;
  }

  if (phase === "setup" || !question) {
    const bestAccuracy = history.filter((session) => session.questions >= 10).map((session) => session.accuracy).sort((a, b) => b - a)[0];
    return (
      <TrueCountSetup
        setup={setup}
        rounding={rounding}
        matched={matched}
        onChange={(next) => setSetup((current) => ({ ...current, ...next }))}
        onPick={onPick}
        onReset={() => onPick(lastPicked)}
        resetLabel={`Back to ${TRUE_COUNT_SESSION_CARDS.find((card) => card.id === lastPicked)!.title}`}
        onStart={start}
        bestAccuracy={bestAccuracy}
        notice={focusNote && (
          <Callout tone="info" title="Focused practice" action={<Button size="sm" variant="secondary" onClick={() => { setSetup((current) => ({ ...current, focus: "adaptive" })); setFocusNote(undefined); }}>Use adaptive instead</Button>}>
            Questions focus on {TRUE_COUNT_FOCUS_LABEL[focusNote].toLowerCase()}, picked from your results.
          </Callout>
        )}
        resume={unfinished && (
          <ResumeBanner
            detail={`Question ${Math.min((unfinished.state.index ?? 0) + 1, unfinished.state.target ?? target)} of ${unfinished.state.target ?? target} · ${relativeTime(unfinished.updatedAt)}`}
            onResume={() => restart(true)}
            onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); setDismissed(true); }}
          />
        )}
      />
    );
  }

  const liveMs = totalMs.current + (phase === "question" ? Math.max(0, now - answerStarted.current) : 0);
  const graded = phase === "feedback" ? gradeTrueCount({ question, mode, tcText: tcAnswer, deckText: deckAnswer, rounding }) : undefined;
  const combined = mode === "combined";
  const est = question.estimatedDecksRemaining;
  const padValue = combined && field === "decks" ? deckAnswer : tcAnswer;
  const setPadValue = combined && field === "decks" ? setDeckAnswer : setTcAnswer;

  return (
    <PlayFrame title="True Count" onExit={endDrill} progress={{ done: index - (phase === "feedback" ? 1 : 0), total: target }} clock={liveMs} streak={feedbackMode === "immediate" ? streak : undefined}>
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch lg:gap-8">
        {/* Short phones put the count beside the photo, so the photo keeps the height. */}
        <section aria-label="Question" className={cx("flex min-h-0 flex-1 flex-col gap-3", combined && "[@media(max-height:700px)]:flex-row-reverse")}>
          <div className={cx("flex items-center gap-3 rounded-2xl border border-line bg-surface px-4", combined ? "py-2.5 [@media(max-height:700px)]:w-[40%] [@media(max-height:700px)]:shrink-0 [@media(max-height:700px)]:flex-col [@media(max-height:700px)]:items-start [@media(max-height:700px)]:justify-center [@media(max-height:700px)]:px-3" : "py-3 [@media(max-height:700px)]:py-2")}>
            <div className="min-w-0 flex-1 [@media(max-height:700px)]:flex-none">
              <p className="eyebrow">Running count</p>
              <p className="tnum text-4xl font-semibold leading-tight text-brand-text">{signedText(question.runningCount)}</p>
            </div>
            {combined ? (
              <div className="text-right text-sm leading-5 text-ink-2 [@media(max-height:700px)]:text-left [@media(max-height:700px)]:text-xs [@media(max-height:700px)]:leading-5">
                <p className="font-semibold text-ink">{decks}-deck shoe</p>
                <p>Decks to the {RESOLUTION_WORD[resolution]}</p>
                <p>{ROUNDING_LABEL[rounding]} rounding</p>
              </div>
            ) : (
              <div className="min-w-0 flex-1 border-l border-line pl-4">
                <p className="eyebrow">Decks left</p>
                <p className="tnum text-4xl font-semibold leading-tight">{est}</p>
              </div>
            )}
          </div>
          {combined ? (
            <FitTray
              photo={photo ?? undefined}
              label={`Discard tray, ${decks}-deck shoe`}
              freeze={phase === "feedback"}
              overlay={graded && photo && (
                <span className="tnum absolute left-2 top-2 whitespace-nowrap rounded-lg bg-black/65 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm sm:text-xs">
                  {decksLeftFor(photo, decks).toFixed(2)} decks left
                </span>
              )}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center [@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:py-1">
              <p className="text-lg font-semibold">What is the true count?</p>
              <p className="tnum text-sm text-ink-2">Running count ÷ decks left, then {ROUNDING_LABEL[rounding].toLowerCase()} rounding.</p>
              <p className="text-xs text-ink-3">{decks}-deck shoe</p>
            </div>
          )}
        </section>

        <PlayDock className="lg:static lg:mx-0 lg:mt-0 lg:self-center lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
          <div className="mx-auto w-full max-w-md space-y-2">
            {phase === "question" ? (
              <>
                <div className="flex gap-2">
                  {combined && <PadField label="Decks left" value={deckAnswer} active={field === "decks"} onSelect={() => setField("decks")} />}
                  <PadField label="True count" value={tcAnswer} active={field === "tc"} onSelect={combined ? () => setField("tc") : undefined} />
                </div>
                <NumberPad
                  value={padValue}
                  onChange={setPadValue}
                  onSubmit={onEnter}
                  allowNegative={!combined || field === "tc"}
                  allowDecimal={combined && field === "decks"}
                  maxLength={combined && field === "decks" ? 4 : 3}
                  submitLabel={combined && field === "decks" && tcAnswer === "" ? "Next" : "Check"}
                  className={COMPACT_PAD}
                />
              </>
            ) : graded && (
              <Feedback ok={graded.ok} title={graded.ok ? `Correct: true count ${signedText(question.answer)}` : `True count ${signedText(question.answer)}`}
                onContinue={continueAfterFeedback} continueLabel={index >= target ? "See results" : "Next question"}>
                <span className="tnum block">{divisionText(question.runningCount, est)} → {signedText(question.answer)}</span>
                {!graded.ok && <span className="tnum block">You said {combined ? `${graded.deck ?? "nothing"} decks and ` : ""}{graded.tc === null ? "nothing" : signedText(graded.tc)}.</span>}
                {combined && !graded.deckOk && (
                  <span className="tnum block">The tray leaves {photo ? decksLeftFor(photo, decks).toFixed(2) : est} decks, {est} to the nearest {RESOLUTION_WORD[resolution]}.</span>
                )}
                {graded.ownEstimate && <span className="block font-medium text-ink">Your division was right for {graded.deck} decks, so the miss was the tray reading.</span>}
                {!graded.ok && !graded.ownEstimate && graded.category === "true-count rounding" && <span className="block font-medium text-ink">{ERROR_CATEGORY_LABEL[graded.category]}: {ROUNDING_NOTE[rounding]}</span>}
                {!graded.ok && !graded.ownEstimate && graded.category === "true-count division" && <span className="block font-medium text-ink">The division slipped. Check the sign, then how many times the decks go into the count.</span>}
              </Feedback>
            )}
          </div>
        </PlayDock>
      </div>
    </PlayFrame>
  );
}

function TrueCountSummary({ session, onAgain, onChangeSetup }: { session: Session; onAgain: () => void; onChangeSetup: () => void }) {
  const metrics = session.metrics ?? {};
  const combined = metrics.mode === "combined";
  const deckMisses = session.mistakes.filter((mistake) => mistake.category === "deck estimate").length;
  const next = deckMisses > 0 && deckMisses * 2 >= session.mistakes.length
    ? { href: "/train/deck-estimation", label: "Practise Deck Estimation" }
    : session.accuracy >= 85 ? { href: "/train/deviations", label: "Next: Index Plays" } : undefined;
  return (
    <DrillSummary
      title="True Count"
      score={session.accuracy}
      scoreLabel="Questions right"
      scoreSub={<><span className="tnum font-semibold text-ink">{session.correct} of {session.questions}.</span> {verdict(session.accuracy)}</>}
      stats={[
        { label: "Answer time", value: `${(session.averageResponseTime / 1000).toFixed(1)} s` },
        { label: "Best streak", value: String(session.bestStreak) },
        ...(combined && typeof metrics.deckAccuracy === "number" ? [{ label: "Tray reads right", value: `${metrics.deckAccuracy}%` }] : []),
        ...(typeof metrics.divisionAccuracy === "number" ? [{ label: "Division right", value: `${metrics.divisionAccuracy}%` }] : []),
      ]}
      mistakes={displayMistakes(session.mistakes)}
      onAgain={onAgain}
      next={next}
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={onChangeSetup}>Change setup</Button>
      </div>
      <CauseCard mistakes={session.mistakes} />
      <Breakdown categories={session.categories} />
      <BenchmarkNote drill="True Count" />
      {!session.mistakes.length && session.questions > 0 && <Callout tone="pos" title="No misses. Clean session." />}
    </DrillSummary>
  );
}
