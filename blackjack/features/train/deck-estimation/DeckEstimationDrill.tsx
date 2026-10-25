"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { NumberPad, TrayPhoto } from "@/components/blackjack";
import { DownloadMisses, DrillSummary, Feedback, PlayDock, PlayFrame, ResumeBanner } from "@/components/drill/DrillKit";
import { announce, Button, Callout, Card } from "@/components/ui";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { estimateBias, gradeDeckEstimate, lastDeckAccuracyFromCategories, minimumStepNote, type DeckResolution } from "@/lib/blackjack/countingTraining";
import { fitQuestionTarget, fitShoeSize, parseDeckResolutionFocus, RESOLUTION_LABEL, RESOLUTION_WORD, type FeedbackMode } from "@/lib/blackjack/countingSetup";
import { decksLeftFor, drawTrayPhoto, trayPhotoSrc, type TrayPhoto as TrayPhotoData } from "@/lib/blackjack/deckPhotos";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import { useSettings } from "@/lib/hooks/useSettings";
import { useSessions } from "@/lib/hooks/useSessions";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { relativeTime } from "@/lib/statistics/drillRound";
import { makeSession, storage, type Mistake, type Session, type Settings } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { FitTray } from "../counting-shared/FitTray";
import { readSetupMemory, useArrival, useNow, useSavedProgress, writeSetupMemory } from "../counting-shared/hooks";
import { BenchmarkNote, Breakdown, COMPACT_PAD, PadField, verdict } from "../counting-shared/parts";
import { DeckEstimationSetup, type DeckSetupState } from "./DeckEstimationSetup";

const DRILL = "Deck Estimation" as const;
const MEMORY_KEY = "countlab:drill-setup:deck-estimation";

/** Photos saved by earlier versions carry the manifest's labels instead of the discard depth. */
type LegacyPhoto = { file: string; decks: number; numDecks: number };

/**
 * Saved progress ("hilo:progress:Deck Estimation"), in the field names
 * earlier versions used so their unfinished sessions resume here.
 * `question` is the number of photos already graded.
 */
type DeckSaved = {
  decks: number; resolution: DeckResolution; feedbackMode: FeedbackMode;
  phase: "question" | "feedback"; question: number; remaining: number; photo: TrayPhotoData | LegacyPhoto | null; answer: string;
  correct: number; errors: number[]; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  message: string; totalMs: number;
  target?: number; streak?: number; best?: number; seen?: string[]; signedErrors?: number[];
};
type Memory = { decks?: number; resolution?: DeckResolution; basis?: number };
type Phase = "setup" | "question" | "feedback" | "done";

const isResolution = (value: unknown): value is DeckResolution => value === 1 || value === 0.5 || value === 0.25;
const toTrayPhoto = (photo: TrayPhotoData | LegacyPhoto | null | undefined): TrayPhotoData | null => {
  if (!photo || typeof photo.file !== "string") return null;
  if ("discarded" in photo && Number.isFinite(photo.discarded)) return { file: photo.file, discarded: photo.discarded };
  const legacy = photo as LegacyPhoto;
  return Number.isFinite(legacy.numDecks) && Number.isFinite(legacy.decks) ? { file: legacy.file, discarded: Number((legacy.numDecks - legacy.decks).toFixed(2)) } : null;
};
const usable = (saved: DeckSaved) => Boolean(toTrayPhoto(saved.photo)) && Number.isFinite(saved.decks) && Number.isFinite(saved.question);
const decksText = (value: number) => `${Number(value.toFixed(2))} ${value === 1 ? "deck" : "decks"}`;

export function DeckEstimationDrill() {
  return <Suspense fallback={null}><DeckEstimationLoader /></Suspense>;
}

function DeckEstimationLoader() {
  const { settings, ready } = useSettings();
  const arrival = useArrival(DRILL);
  const [boot, setBoot] = useState({ key: 0, resume: false });
  const restart = useCallback((resume: boolean) => setBoot((current) => ({ key: current.key + 1, resume })), []);
  if (!ready) return null;
  return <DeckEstimationSession key={boot.key} settings={settings} focus={boot.key === 0 ? arrival.focus : undefined} resume={boot.resume} restart={restart} />;
}

function DeckEstimationSession({ settings, focus, resume, restart }: { settings: Settings; focus?: string; resume: boolean; restart: (resume: boolean) => void }) {
  const history = useSessions(DRILL);
  const [init] = useState(() => {
    const progress = resume ? storage.progress<DeckSaved>(DRILL) : null;
    const saved = progress?.state && usable(progress.state) ? progress.state : undefined;
    const handoff = parseDeckResolutionFocus(focus);
    const memory = readSetupMemory<Memory>(MEMORY_KEY);
    const remembered = memory && memory.basis === settings.decks ? memory : undefined;
    const firstTime = !storage.sessions().some((session) => session.drill === DRILL);
    const setup: DeckSetupState = {
      decks: saved?.decks ?? fitShoeSize(remembered?.decks ?? settings.decks),
      resolution: saved && isResolution(saved.resolution) ? saved.resolution : handoff ?? (isResolution(remembered?.resolution) ? remembered.resolution : firstTime ? 1 : 0.5),
      feedbackMode: saved?.feedbackMode ?? settings.countingFeedback,
      target: saved?.target ?? fitQuestionTarget(settings.countingSessionQuestions),
    };
    return { saved, setup, handoff: saved ? undefined : handoff };
  });
  const saved = init.saved;
  const [setup, setSetup] = useState<DeckSetupState>(init.setup);
  const { decks, resolution, feedbackMode, target } = setup;
  const [focusNote, setFocusNote] = useState(init.handoff);

  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [answered, setAnswered] = useState(saved?.question ?? 0);
  const [photo, setPhoto] = useState<TrayPhotoData | null>(toTrayPhoto(saved?.photo));
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [errors, setErrors] = useState<number[]>(saved?.errors ?? []);
  const [signedErrors, setSignedErrors] = useState<number[]>(saved?.signedErrors ?? []);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [seen, setSeen] = useState<string[]>(saved?.seen ?? (saved?.photo ? [saved.photo.file] : []));
  const [result, setResult] = useState<Session>();
  const [dismissed, setDismissed] = useState(false);
  const answerStarted = useRef(Date.now());
  const totalMs = useRef(saved?.totalMs ?? 0);
  const feedbackShownAt = useRef(0);
  const upcoming = useRef<TrayPhotoData | undefined>(undefined);

  const remaining = photo ? decksLeftFor(photo, decks) : 0;
  const active = phase === "question" || phase === "feedback";
  const isLast = answered >= target;
  useWakeLock(active);
  const progress = useDrillProgress(DRILL, active && Boolean(photo) && !result, {
    decks, resolution, feedbackMode, phase: phase === "feedback" ? "feedback" : "question", question: answered, remaining, photo, answer,
    correct, errors, mistakes, categories, message: "", totalMs: totalMs.current,
    target, streak, best, seen, signedErrors,
  } satisfies DeckSaved);
  const now = useNow(phase === "question");

  /** Show the next tray; `count` is how many have been graded so far. */
  const nextTray = (count: number, shown: string[]) => {
    const chosen = upcoming.current && !shown.includes(upcoming.current.file) ? upcoming.current : drawTrayPhoto(decks, shown);
    upcoming.current = undefined;
    setPhoto(chosen); setSeen([...shown, chosen.file]);
    setAnswer(""); answerStarted.current = Date.now(); setPhase("question");
    announce(`Photo ${count + 1} of ${target}. How many decks are left in the ${decks}-deck shoe?`);
    track("question_presented", { drill: DRILL, category: `${resolution}_deck`, scenario: decksLeftFor(chosen, decks) <= 1 ? "last_deck" : "discard_tray", attempt: count + 1 });
  };
  // Load the next photo while the reader looks at this verdict.
  useEffect(() => {
    if (phase !== "feedback" || isLast || upcoming.current) return;
    upcoming.current = drawTrayPhoto(decks, seen);
    const preload = new window.Image();
    preload.src = trayPhotoSrc(upcoming.current);
  }, [phase, isLast, decks, seen]);

  const start = () => {
    writeSetupMemory<Memory>(MEMORY_KEY, { decks, resolution, basis: settings.decks });
    if (resolution !== init.setup.resolution) track("difficulty_changed", { drill: DRILL, from: String(init.setup.resolution), to: String(resolution) });
    setAnswered(0); setCorrect(0); setErrors([]); setSignedErrors([]); setMistakes([]); setCategories({}); setStreak(0); setBest(0); setResult(undefined);
    totalMs.current = 0;
    upcoming.current = undefined;
    nextTray(0, []);
    track("drill_started", { drill: DRILL, decks, resolution, questionTarget: target });
  };

  const finish = (count = answered, gotCorrect = correct, finalErrors = errors, finalSigned = signedErrors, finalMistakes = mistakes, finalCategories = categories, bestStreak = best) => {
    const mae = finalErrors.length ? finalErrors.reduce((sum, value) => sum + value, 0) / finalErrors.length : 0;
    const session = makeSession(DRILL, count, gotCorrect, totalMs.current, bestStreak, finalMistakes, finalCategories, {
      meanAbsoluteDeckError: Number(mae.toFixed(3)),
      meanSignedDeckError: estimateBias(finalSigned).mean,
      lastDeckAccuracy: lastDeckAccuracyFromCategories(finalCategories),
      resolution,
      decks,
    }, ["real-photo"]);
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
    setPhoto(null); setAnswered(0); setCorrect(0); setErrors([]); setSignedErrors([]); setMistakes([]); setCategories({}); setStreak(0); setBest(0);
    setPhase("setup");
  };

  const submit = () => {
    if (!photo) return;
    const parsed = parseAnswer(answer, "decimal");
    if (!parsed.ok) { announce(parsed.error); return; }
    const responseTimeMs = Date.now() - answerStarted.current;
    totalMs.current += responseTimeMs;
    const graded = gradeDeckEstimate({ remaining, resolution, value: parsed.value, decks });
    const nextCount = answered + 1, nextCorrect = correct + Number(graded.ok), nextStreak = graded.ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak);
    const nextErrors = [...errors, graded.error];
    const nextSigned = graded.signedError === null ? signedErrors : [...signedErrors, graded.signedError];
    const key = `${resolution}-deck${remaining <= 1 ? ", last deck" : ""}`;
    const previous = categories[key] ?? { correct: 0, total: 0 };
    const nextCategories = { ...categories, [key]: { correct: previous.correct + Number(graded.ok), total: previous.total + 1 } };
    const nextMistakes = graded.ok ? mistakes : [...mistakes, {
      question: `Decks left in a ${decks}-deck shoe`,
      userAnswer: parsed.text,
      correctAnswer: String(graded.expected),
      explanation: `The tray holds ${photo.discarded.toFixed(2)} decks, leaving ${remaining.toFixed(2)}, which rounds to ${graded.expected} at ${RESOLUTION_WORD[resolution]}-deck precision. ${minimumStepNote(remaining, resolution)}`.trim(),
      category: "deck estimate" as const,
      context: { file: photo.file, remaining, decks },
    }];
    setAnswer(parsed.text); setAnswered(nextCount); setCorrect(nextCorrect); setErrors(nextErrors); setSignedErrors(nextSigned); setCategories(nextCategories); setMistakes(nextMistakes); setStreak(nextStreak); setBest(nextBest);
    track("deck_estimation_answered", { ok: graded.ok, expected: graded.expected, actual: parsed.value, error: graded.error, resolution, responseTimeMs, attempt: nextCount, streak: nextStreak });
    const last = nextCount >= target;
    // Saved at the last answer, so leaving on its verdict loses nothing.
    if (last) finish(nextCount, nextCorrect, nextErrors, nextSigned, nextMistakes, nextCategories, nextBest);
    if (feedbackMode === "immediate") {
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(graded.ok ? `Correct. ${decksText(graded.expected)} left.` : `Not quite. ${decksText(graded.expected)} left; you said ${parsed.text}.`);
    } else if (last) setPhase("done");
    else nextTray(nextCount, seen);
  };

  const continueAfterFeedback = () => {
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (isLast) { if (!result) finish(); setPhase("done"); return; }
    nextTray(answered, seen);
  };

  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (answered > 0) {
      if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: answered + 1, elapsedMs: Date.now() - answerStarted.current });
      finish();
      setPhase("done");
      return;
    }
    discard();
  };

  const unfinished = useSavedProgress<DeckSaved>(DRILL, phase === "setup" && !dismissed, usable);

  if (phase === "done" && result) {
    return <DeckSummary session={result} signedErrors={signedErrors} onAgain={start} onChangeSetup={() => { setResult(undefined); setPhase("setup"); }} />;
  }

  if (phase === "setup" || !photo) {
    const bestError = history.filter((session) => session.questions >= 10).map((session) => Number(session.metrics?.meanAbsoluteDeckError)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    return (
      <DeckEstimationSetup
        setup={setup}
        onChange={(next) => { setSetup((current) => ({ ...current, ...next })); if (next.resolution !== undefined) setFocusNote(undefined); }}
        onStart={start}
        bestError={bestError}
        notice={focusNote && (
          <Callout tone="info" title="Focused practice">Set up at {RESOLUTION_LABEL[focusNote].toLowerCase()} precision. The benchmark asks for an average error of 0.25 decks or less over 10 photos.</Callout>
        )}
        resume={unfinished && (
          <ResumeBanner
            detail={`Photo ${Math.min((unfinished.state.question ?? 0) + 1, unfinished.state.target ?? target)} of ${unfinished.state.target ?? target} · ${relativeTime(unfinished.updatedAt)}`}
            onResume={() => restart(true)}
            onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); setDismissed(true); }}
          />
        )}
      />
    );
  }

  const liveMs = totalMs.current + (phase === "question" ? Math.max(0, now - answerStarted.current) : 0);
  const graded = phase === "feedback" ? gradeDeckEstimate({ remaining, resolution, value: parseAnswer(answer, "decimal").ok ? Number(answer) : null, decks }) : undefined;

  return (
    <PlayFrame title="Deck Estimation" onExit={endDrill} progress={{ done: answered - (phase === "feedback" ? 1 : 0), answered, total: target }} clock={liveMs} streak={feedbackMode === "immediate" ? streak : undefined}>
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch lg:gap-8">
        <section aria-label="Question" className="flex min-h-0 flex-1 flex-col">
          <h2 className="text-center text-lg font-semibold leading-snug sm:text-xl [@media(max-height:700px)]:text-base">
            How many decks are left?
            <span className="block text-sm font-medium text-ink-2 [@media(max-height:700px)]:text-xs">{decks}-deck shoe · nearest {RESOLUTION_WORD[resolution]} deck</span>
          </h2>
          <FitTray
            photo={photo}
            label={`Discard tray, ${decks}-deck shoe`}
            freeze={phase === "feedback"}
            className="mt-3 [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:min-h-[9.5rem]"
            overlay={graded && (
              <span className="tnum absolute left-2 top-2 whitespace-nowrap rounded-lg bg-black/65 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm sm:text-xs">
                {photo.discarded.toFixed(2)} in the tray
              </span>
            )}
          />
        </section>
        <PlayDock className="lg:static lg:mx-0 lg:mt-0 lg:self-center lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
          <div className="mx-auto w-full max-w-md space-y-2">
            {phase === "question" ? (
              <>
                <PadField label="Decks left" hint={`nearest ${RESOLUTION_WORD[resolution]}`} value={answer} />
                <NumberPad value={answer} onChange={setAnswer} onSubmit={submit} allowNegative={false} allowDecimal={resolution !== 1} maxLength={4} submitLabel="Check" className={COMPACT_PAD} />
              </>
            ) : graded && (
              <Feedback ok={graded.ok} title={graded.ok ? `Correct: ${decksText(graded.expected)} left` : `${decksText(graded.expected)} left`} onContinue={continueAfterFeedback} continueLabel={isLast ? "See results" : "Next photo"}>
                Exactly {remaining.toFixed(2)} left, with {photo.discarded.toFixed(2)} in the tray.
                {graded.signedError !== null && graded.signedError !== 0 && ` You said ${answer}: ${Math.abs(graded.signedError).toFixed(2)} decks too ${graded.signedError > 0 ? "many" : "few"}.`}
                {graded.signedError === 0 && " Spot on."}
                {minimumStepNote(remaining, resolution) && <span className="block">{minimumStepNote(remaining, resolution)}</span>}
              </Feedback>
            )}
          </div>
        </PlayDock>
      </div>
    </PlayFrame>
  );
}

function DeckSummary({ session, signedErrors, onAgain, onChangeSetup }: { session: Session; signedErrors: number[]; onAgain: () => void; onChangeSetup: () => void }) {
  const metrics = session.metrics ?? {};
  const mae = Number(metrics.meanAbsoluteDeckError ?? 0);
  const bias = estimateBias(signedErrors.length ? signedErrors : [Number(metrics.meanSignedDeckError ?? 0)]);
  // One or two photos are not a habit; name a lean from three on.
  const showLean = bias.direction !== "even" && signedErrors.length >= 3;
  const lastDeckSeen = Object.keys(session.categories ?? {}).some((key) => key.endsWith(", last deck"));
  useEffect(() => { announce(`Session complete. ${session.correct} of ${session.questions} right, ${mae.toFixed(2)} decks off on average.`); }, [session, mae]);
  const lean = bias.direction === "even" ? "Even" : `${Math.abs(bias.mean).toFixed(2)} ${bias.direction === "over" ? "high" : "low"}`;
  return (
    <DrillSummary
      title="Deck Estimation"
      score={session.accuracy}
      scoreLabel="Photos right"
      scoreSub={<><span className="tnum font-semibold text-ink">{session.correct} of {session.questions}.</span> {verdict(session.accuracy)}</>}
      stats={[
        { label: "Average error", value: `${mae.toFixed(2)} decks` },
        { label: "Lean", value: lean },
        { label: "Best streak", value: String(session.bestStreak) },
        { label: lastDeckSeen ? "Last-deck accuracy" : "Answer time", value: lastDeckSeen ? `${metrics.lastDeckAccuracy ?? 0}%` : `${(session.averageResponseTime / 1000).toFixed(1)} s` },
      ]}
      onAgain={onAgain}
      next={{ href: "/train/true-count", label: "Next: True Count" }}
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" icon={<SlidersHorizontal size={17} aria-hidden />} onClick={onChangeSetup}>Change setup</Button>
      </div>
      {showLean && (
        <Callout tone="warn" title={bias.direction === "over" ? "You see more decks left than there are" : "You see fewer decks left than there are"}>
          On average your estimates were {Math.abs(bias.mean).toFixed(2)} decks too {bias.direction === "over" ? "high: the tray holds more than it looks. Read it as a little fuller." : "low: the tray holds less than it looks. Read it as a little emptier."}
        </Callout>
      )}
      <PhotoMisses mistakes={session.mistakes} />
      <Breakdown categories={session.categories} />
      <BenchmarkNote drill="Deck Estimation" />
      {!session.mistakes.length && session.questions > 0 && <Callout tone="pos" title="No misses. Clean session." />}
    </DrillSummary>
  );
}

/** The photos missed, each with the tray itself so the reader can look again. */
function PhotoMisses({ mistakes }: { mistakes: readonly Mistake[] }) {
  if (!mistakes.length) return null;
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">Look again at your misses</h2>
        <DownloadMisses mistakes={mistakes} name="Deck Estimation" />
      </div>
      <ol className="divide-y divide-line">
        {mistakes.map((mistake, index) => {
          const file = typeof mistake.context?.file === "string" ? mistake.context.file : undefined;
          const remaining = Number(mistake.context?.remaining);
          return (
            <li key={index} className="flex gap-3.5 py-3 first:pt-0 last:pb-0">
              {file && <TrayPhoto photo={{ file, discarded: Number(mistake.context?.decks) - remaining }} width={64} label={`Missed tray ${index + 1}`} />}
              <div className="min-w-0 text-sm leading-6">
                <p className="font-medium">{mistake.question}</p>
                <p className="text-ink-2">You said <span className="tnum font-semibold text-neg">{mistake.userAnswer}</span> · correct <span className="tnum font-semibold text-pos">{mistake.correctAnswer}</span></p>
                {Number.isFinite(remaining) && <p className="tnum text-ink-3">Exactly {remaining.toFixed(2)} decks left</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
