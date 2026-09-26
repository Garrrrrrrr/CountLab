"use client";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { DrillFrame, DrillHud, DrillStage, FeedbackPanel, formatClock, ResumeBanner, useDrillSetupPref } from "@/components/drill";
import { announce, Button, GhostButton } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { addCategory } from "@/components/DrillKit";
import { abandonActivePractice, track } from "@/lib/analytics/track";
import { useWakeLock } from "@/lib/pwa/useWakeLock";
import { lastDeckAccuracyFromCategories, roundDeckEstimate, type DeckResolution } from "@/lib/blackjack/countingTraining";
import { parseDeckResolutionFocus, RESOLUTION_LABEL, RESOLUTION_WORD } from "@/lib/blackjack/countingSetup";
import { DECK_ESTIMATION_PHOTOS, drawDeckPhoto, DRILL_PHOTO_DECK_OPTIONS, PHOTO_DECK_OPTIONS, PHOTO_UNIQUE_COUNT, type DeckPhoto } from "@/lib/blackjack/deckPhotos";
import { parseAnswer } from "@/lib/blackjack/numericAnswer";
import { makeSession, storage, type Mistake, type Session } from "@/lib/statistics/storage";
import { useDrillProgress } from "@/lib/statistics/useDrillProgress";
import { AnswerPad } from "./AnswerPad";
import { CountingSummary } from "./CountingSummary";
import { isRecent, readArrival, useConsumeArrival, useEntryFocus, useNow, useStoredSessions, useUnfinishedProgress } from "./hooks";
import { AsideCard, FocusCallout, UnfinishedCallout, YourProgress } from "./SetupParts";
import { DeckEstimationSetup, type DeckEstimationSetupState } from "./deck-estimation/DeckEstimationSetup";

const DRILL = "Deck Estimation" as const;

/**
 * Saved progress ("hilo:progress:Deck Estimation"). `message` keeps its
 * legacy wording for older app versions; the last four fields are optional
 * additions read with fallbacks.
 */
type DeckEstimationSaved = {
  decks: number; resolution: DeckResolution; feedbackMode: "immediate" | "end";
  phase: "question" | "feedback"; question: number; remaining: number; photo: DeckPhoto | null; answer: string;
  correct: number; errors: number[]; mistakes: Mistake[]; categories: Record<string, { correct: number; total: number }>;
  message: string; totalMs: number;
  target?: number; streak?: number; best?: number; seen?: string[];
};
type DeckEstimationPref = { decks?: number; resolution?: DeckResolution; basis?: number };
const PREF_KEY = "countlab:drill-setup:deck-estimation";
type Phase = "setup" | "question" | "feedback" | "done";
type Arrival = ReturnType<typeof readArrival>;

export function DeckEstimationDrill() {
  return <Suspense fallback={null}><DeckEstimationLoader /></Suspense>;
}

function DeckEstimationLoader() {
  const params = useSearchParams();
  useConsumeArrival(DRILL);
  const [pref, remember, restored] = useDrillSetupPref<DeckEstimationPref>(PREF_KEY, {});
  const [boot, setBoot] = useState(() => ({ key: 0, arrival: readArrival(DRILL, params), resume: false }));
  const restart = useCallback((options: { resume?: boolean; keepArrival?: boolean }) => setBoot((current) => ({ key: current.key + 1, arrival: options.keepArrival ? current.arrival : { starter: false }, resume: Boolean(options.resume) })), []);
  if (!restored) return null;
  return <DeckEstimationSession key={boot.key} arrival={boot.arrival} forceResume={boot.resume} remounted={boot.key > 0} pref={pref} remember={remember} restart={restart} />;
}

const defaultShoe = (decks: number) => DRILL_PHOTO_DECK_OPTIONS.includes(decks) ? decks : DRILL_PHOTO_DECK_OPTIONS.includes(6) ? 6 : DRILL_PHOTO_DECK_OPTIONS[0] ?? PHOTO_DECK_OPTIONS[0];

function DeckEstimationSession({ arrival, forceResume, remounted, pref, remember, restart }: { arrival: Arrival; forceResume: boolean; remounted: boolean; pref: DeckEstimationPref; remember: (next: DeckEstimationPref) => void; restart: (options: { resume?: boolean; keepArrival?: boolean }) => void }) {
  const settings = storage.settings();
  const history = useStoredSessions(DRILL);
  const allSessions = useStoredSessions();

  const [initial] = useState(() => {
    const progress = storage.progress<DeckEstimationSaved>(DRILL);
    const saved = progress && (forceResume || isRecent(progress)) && progress.state?.photo ? progress.state : undefined;
    const handoff = parseDeckResolutionFocus(arrival.focus);
    const remembered = pref.basis === settings.decks ? pref : undefined;
    const firstTime = !storage.sessions().some((session) => session.drill === DRILL);
    const setup: DeckEstimationSetupState = {
      decks: saved?.decks ?? defaultShoe(remembered?.decks ?? settings.decks),
      resolution: saved?.resolution ?? handoff ?? remembered?.resolution ?? (firstTime ? 1 : 0.5),
      feedbackMode: saved?.feedbackMode ?? settings.countingFeedback,
      target: saved?.target ?? settings.countingSessionQuestions,
    };
    return { progress, saved, setup, handoff: saved ? undefined : handoff };
  });
  const saved = initial.saved;
  const [setup, setSetup] = useState<DeckEstimationSetupState>(initial.setup);
  const { decks, resolution, feedbackMode, target } = setup;
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [focusNote, setFocusNote] = useState(initial.handoff);

  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [question, setQuestion] = useState(saved?.question ?? 0);
  const [remaining, setRemaining] = useState(saved?.remaining ?? 0);
  const [photo, setPhoto] = useState<DeckPhoto | null>(saved?.photo ?? null);
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [correct, setCorrect] = useState(saved?.correct ?? 0);
  const [errors, setErrors] = useState<number[]>(saved?.errors ?? []);
  const [mistakes, setMistakes] = useState<Mistake[]>(saved?.mistakes ?? []);
  const [categories, setCategories] = useState<Record<string, { correct: number; total: number }>>(saved?.categories ?? {});
  const [message, setMessage] = useState(saved?.message ?? "");
  const [streak, setStreak] = useState(saved?.streak ?? 0);
  const [best, setBest] = useState(saved?.best ?? 0);
  const [seen, setSeen] = useState<string[]>(saved?.seen ?? (saved?.photo ? [saved.photo.file] : []));
  const [result, setResult] = useState<Session>();
  const [resumed, setResumed] = useState(() => Boolean(saved));
  const [confirmEnd, setConfirmEnd] = useState(false);
  const answerStarted = useRef(Date.now());
  const totalMs = useRef(saved?.totalMs ?? 0);
  const feedbackShownAt = useRef(0);
  const upcoming = useRef<DeckPhoto | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  useEntryFocus(root, phase === "setup" ? "setup" : phase === "done" ? "done" : "play", remounted);

  const active = phase === "question" || phase === "feedback";
  useWakeLock(active);
  const progress = useDrillProgress(DRILL, active && Boolean(photo) && !result, {
    decks, resolution, feedbackMode, phase: phase === "feedback" ? "feedback" : "question", question, remaining, photo, answer,
    correct, errors, mistakes, categories, message, totalMs: totalMs.current,
    target, streak, best, seen,
  } satisfies DeckEstimationSaved);
  const now = useNow(phase === "question");
  const isLast = question >= target;

  /** Show the next tray; `answered` is how many have been graded so far. */
  const newTray = (answered: number, shown: string[]) => {
    const chosen = upcoming.current && !shown.includes(upcoming.current.file) ? upcoming.current : drawDeckPhoto(decks, shown);
    upcoming.current = undefined;
    setPhoto(chosen); setSetup((current) => ({ ...current, decks: chosen.numDecks })); setRemaining(chosen.decks); setSeen([...shown, chosen.file]);
    setAnswer(""); answerStarted.current = Date.now(); setPhase("question");
    announce(`Tray ${answered + 1} of ${target}. How many decks are left?`);
    track("question_presented", { drill: DRILL, category: `${resolution}_deck`, scenario: chosen.decks <= 1 ? "last_deck" : "discard_tray", attempt: answered + 1 });
  };
  // Load the next photo while the reader looks at this verdict.
  useEffect(() => {
    if (phase !== "feedback" || isLast || upcoming.current) return;
    upcoming.current = drawDeckPhoto(decks, seen);
    const preload = new window.Image();
    preload.src = `/deck-estimation/${upcoming.current.file}`;
  }, [phase, isLast, decks, seen]);

  const start = () => {
    remember({ decks, resolution, basis: settings.decks });
    setQuestion(0); setCorrect(0); setErrors([]); setMistakes([]); setCategories({}); setStreak(0); setBest(0); setMessage(""); setResult(undefined); setResumed(false);
    totalMs.current = 0;
    upcoming.current = undefined;
    newTray(0, []);
    track("drill_started", { drill: DRILL, decks, resolution, questionTarget: target });
  };

  const finish = (askedCount = question, gotCorrect = correct, finalErrors = errors, finalMistakes = mistakes, finalCategories = categories, bestStreak = best) => {
    const mae = finalErrors.length ? finalErrors.reduce((a, b) => a + b, 0) / finalErrors.length : 0;
    const session = makeSession(DRILL, askedCount, gotCorrect, totalMs.current, bestStreak, finalMistakes, finalCategories, { meanAbsoluteDeckError: mae, lastDeckAccuracy: lastDeckAccuracyFromCategories(finalCategories), resolution }, ["real-photo"]);
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
    setPhoto(null); setQuestion(0); setCorrect(0); setErrors([]); setMistakes([]); setCategories({}); setStreak(0); setBest(0); setMessage(""); setResumed(false);
    setPhase("setup");
  };

  const submit = (value: number | null, text: string) => {
    const responseTimeMs = Date.now() - answerStarted.current;
    totalMs.current += responseTimeMs;
    if (value === null) track("answer_skipped", { drill: DRILL, attempt: question + 1, elapsedMs: responseTimeMs });
    const expected = roundDeckEstimate(remaining, resolution);
    const ok = value !== null && Math.abs(value - expected) < 0.001;
    // A skipped tray counts as missing by the whole shoe, as a blank always has.
    const error = value !== null ? Math.abs(value - remaining) : decks;
    const nextQuestion = question + 1, nextCorrect = correct + Number(ok), nextErrors = [...errors, error], nextStreak = ok ? streak + 1 : 0, nextBest = Math.max(best, nextStreak);
    const category = `${resolution}-deck${remaining <= 1 ? ", last deck" : ""}`, nextCategories = addCategory(categories, category, ok);
    const nextMistakes = ok ? mistakes : [...mistakes, { question: "Decks remaining in the pictured tray", userAnswer: text || "blank", correctAnswer: String(expected), explanation: `The tray contains ${(decks - remaining).toFixed(2)} decks discarded, leaving ${remaining.toFixed(2)} before rounding to ${resolution}-deck resolution.`, category: "deck estimate" as const }];
    setAnswer(text); setQuestion(nextQuestion); setCorrect(nextCorrect); setErrors(nextErrors); setCategories(nextCategories); setMistakes(nextMistakes); setStreak(nextStreak); setBest(nextBest); setResumed(false);
    track("deck_estimation_answered", { ok, expected, actual: value, error, resolution, responseTimeMs, attempt: nextQuestion, streak: nextStreak });
    const last = nextQuestion >= target;
    // The session is saved at the last answer, so leaving on its feedback loses nothing.
    if (last) finish(nextQuestion, nextCorrect, nextErrors, nextMistakes, nextCategories, nextBest);
    if (feedbackMode === "immediate") {
      setMessage(ok ? `Correct: ${expected} decks remain` : `Target estimate: ${expected} decks`);
      feedbackShownAt.current = Date.now();
      setPhase("feedback");
      announce(ok ? `Correct. ${expected} decks left.` : `Not quite. ${expected} decks left${value === null ? "" : `; you said ${text}`}.`);
    } else if (last) setPhase("done");
    else newTray(nextQuestion, seen);
  };
  const continueAfterFeedback = () => {
    if (Date.now() - feedbackShownAt.current < 250) return;
    if (isLast) {
      // Progress saved by an older version could stop here with the session unsaved.
      if (!result) finish();
      setPhase("done");
      return;
    }
    newTray(question, seen);
  };
  const endDrill = () => {
    if (result) { setPhase("done"); return; }
    if (question > 0) {
      if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: question + 1, elapsedMs: Date.now() - answerStarted.current });
      finish();
      setPhase("done");
      return;
    }
    setConfirmEnd(true);
  };
  const unfinished = useUnfinishedProgress(DRILL, phase === "setup");

  if (phase === "done" && result) {
    const metrics = result.metrics ?? {};
    const lastDeckSeen = Object.keys(result.categories ?? {}).some((key) => key.endsWith(", last deck"));
    return (
      <CountingSummary
        session={result}
        title={DRILL}
        tiles={[
          { label: "Accuracy", value: `${result.accuracy}%`, tone: result.accuracy >= 85 ? "good" : result.accuracy >= 70 ? "neutral" : "bad" },
          { label: "Average error", value: `${Number(metrics.meanAbsoluteDeckError ?? 0).toFixed(2)} decks`, tone: Number(metrics.meanAbsoluteDeckError) <= 0.25 ? "good" : "neutral", help: "How far your estimates were from the real decks left, on average. Benchmark: 0.25 or less." },
          { label: "Best streak", value: result.bestStreak, sub: "right in a row" },
          { label: "Avg answer time", value: `${(result.averageResponseTime / 1000).toFixed(1)} s` },
          ...(lastDeckSeen ? [{ label: "Last-deck accuracy", value: `${metrics.lastDeckAccuracy ?? 0}%`, help: "Trays with a deck or less left, where a small misread moves the true count most." }] : []),
        ]}
        onNew={start}
        onChangeSetup={() => { setResult(undefined); setPhase("setup"); }}
      />
    );
  }

  if (phase === "setup" || !photo) {
    const bestError = history.filter((session) => session.questions >= 10).map((session) => Number(session.metrics?.meanAbsoluteDeckError)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    return (
      <div ref={root} data-counting-drill="">
        <DrillFrame eyebrow="Visual drill" title={DRILL} description="Look at a real discard tray and estimate how many decks are left in the shoe." phase="setup">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <DeckEstimationSetup
              setup={setup}
              onChange={(next) => { setSetup((current) => ({ ...current, ...next })); if (next.resolution !== undefined) setFocusNote(undefined); }}
              customizeOpen={customizeOpen}
              onCustomizeOpen={setCustomizeOpen}
              onStart={start}
              notice={(unfinished || focusNote) && (
                <div className="grid gap-3">
                  {unfinished && <UnfinishedCallout progress={unfinished} detail={`Tray ${Math.min(((unfinished.state as DeckEstimationSaved).question ?? 0) + 1, (unfinished.state as DeckEstimationSaved).target ?? settings.countingSessionQuestions)} of ${(unfinished.state as DeckEstimationSaved).target ?? settings.countingSessionQuestions}`} onResume={() => restart({ resume: true })} onDiscard={() => { storage.clearProgress(DRILL); abandonActivePractice(); restart({}); }} />}
                  {focusNote && <FocusCallout onDismiss={() => setFocusNote(undefined)}>Set up at <b className="text-[var(--ink)]">{RESOLUTION_LABEL[focusNote].toLowerCase()}</b> precision for focused practice. The benchmark asks for an average error of 0.25 decks or less over 10 photos.</FocusCallout>}
                </div>
              )}
            />
            <div className="grid content-start gap-4">
              <YourProgress drill={DRILL} sessions={history} allSessions={allSessions} best={{ label: "Best average error", value: bestError === undefined ? "—" : `${bestError.toFixed(2)} decks` }} />
              <AsideCard title="Reading the tray">
                <p>The tray holds the cards already played. <b className="text-[var(--ink)]">Decks left = shoe size − decks in the tray.</b></p>
                <p className="mt-2 text-xs">{PHOTO_UNIQUE_COUNT} real photos ({DECK_ESTIMATION_PHOTOS.length} recorded rounds) across {PHOTO_DECK_OPTIONS.join(", ")}-deck shoes.</p>
              </AsideCard>
            </div>
          </div>
        </DrillFrame>
      </div>
    );
  }

  const endMode = feedbackMode === "end";
  const current = phase === "feedback" ? question : Math.min(question + 1, target);
  const mae = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : undefined;
  const liveMs = totalMs.current + (phase === "question" ? Math.max(0, now - answerStarted.current) : 0);
  const expected = roundDeckEstimate(remaining, resolution);
  const given = phase === "feedback" ? parseAnswer(answer, "decimal") : undefined;
  const ok = Boolean(given?.ok && Math.abs(given.value - expected) < 0.001);

  return (
    <div ref={root} data-counting-drill="" data-counting-play="">
      <DrillFrame eyebrow="Visual drill" title={DRILL} phase="play">
        <DrillHud
          progress={{ done: question, total: target, label: `Tray ${current} of ${target}` }}
          stats={[
            endMode ? { id: "answered", label: "Answered", value: question, phone: true } : { id: "accuracy", label: "Accuracy", value: question ? `${Math.round(correct / question * 100)}%` : "—", phone: true },
            ...(endMode ? [] : [{ id: "error", label: "Avg error", value: mae === undefined ? "—" : `${mae.toFixed(2)} decks` }]),
            { id: "time", label: "Time", value: formatClock(liveMs), phone: true },
          ]}
          onEnd={endDrill}
          endLabel="End drill"
        />
        <DrillStage
          label="Question"
          size="lg"
          banner={resumed && initial.progress && <ResumeBanner detail={`Tray ${current} of ${target}`} updatedAt={initial.progress.updatedAt} discardLabel="Discard and start over" onDiscard={() => { progress.cancel(); storage.clearProgress(DRILL); abandonActivePractice(); restart({ keepArrival: true }); }} />}
        >
          <div className="grid gap-5">
            <figure className="m-0">
              <Image
                src={`/deck-estimation/${photo.file}`}
                alt={`Discard tray photo from a ${decks}-deck shoe`}
                width={640}
                height={480}
                unoptimized
                onLoad={() => { if (phase === "question" && !answer) answerStarted.current = Date.now(); }}
                className="mx-auto max-h-[34svh] w-auto rounded-2xl border border-overlay/15 bg-well/40 object-contain shadow-inner sm:max-h-80"
              />
              <figcaption className="mt-2 text-center text-xs text-[var(--ink-muted)]"><b className="font-data text-[var(--ink)]">{decks}-deck shoe</b> · the tray holds cards already played</figcaption>
            </figure>
            {phase === "question" ? (
              <AnswerPad
                key={`tray-${question}`}
                fields={[{ id: "decks", label: "Decks remaining", value: answer, onChange: setAnswer, kind: "decimal", unit: "decks", help: `Nearest ${RESOLUTION_WORD[resolution]} deck` }]}
                submitLabel="Check estimate"
                onSubmit={([value], [text]) => submit(value, text)}
                secondary={<GhostButton size="compact" type="button" onClick={() => submit(null, "")}>Skip this tray</GhostButton>}
              />
            ) : (
              <FeedbackPanel
                ok={ok}
                title={ok ? "Correct" : "Not quite"}
                detail={ok ? <><b className="font-data text-[var(--ink)]">{expected}</b> decks left.</> : undefined}
                rows={ok ? undefined : [{ label: "Decks left", yours: answer || "—", correct: String(expected), ok: false }]}
                action={<Button onClick={continueAfterFeedback} className="min-w-44">{isLast ? "See results" : "Next tray"}</Button>}
              >
                Actual: {remaining.toFixed(2)} decks left ({(decks - remaining).toFixed(2)} in the tray), which rounds to {expected} at {RESOLUTION_WORD[resolution]}-deck precision.
                {given?.ok && ` Off by ${Math.abs(given.value - remaining).toFixed(2)} decks.`}
              </FeedbackPanel>
            )}
          </div>
        </DrillStage>
        <ConfirmModal open={confirmEnd} tone="danger" title="End without saving?" description="You have not answered any trays, so nothing will be saved." confirmLabel="End without saving" cancelLabel="Keep going" onCancel={() => setConfirmEnd(false)} onConfirm={() => { setConfirmEnd(false); if (phase === "question") track("answer_skipped", { drill: DRILL, attempt: question + 1, elapsedMs: Date.now() - answerStarted.current }); discard(); }} />
      </DrillFrame>
    </div>
  );
}
