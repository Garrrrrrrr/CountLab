"use client";
import Link from "next/link";
import { KeyboardEvent, MouseEvent, ReactNode, useEffect, useRef } from "react";
import { DrillFrame, DrillHud, DrillStage, FeedbackPanel, useDrillKeys } from "@/components/drill";
import { Button, KeyHint, toast } from "@/components/ui";
import type { ExplainMode } from "@/lib/statistics/drillRound";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { AnswerPad, type PadOption } from "./AnswerPad";
import { reveal } from "./hooks";
import { EndRoundConfirm, LastAnswerStrip, RoundLog, RoundResumeNotice } from "./parts";
import type { useStrategyRound } from "./useStrategyRound";

export type Round<H, Q> = ReturnType<typeof useStrategyRound<H, Q>>;

export interface PausedView {
  ok: boolean;
  title: string;
  detail?: ReactNode;
  explanation: ReactNode;
  visual?: ReactNode;
  link?: { href: string; label: string };
}

/** Keyboard activation of an answer this soon after a new hand is a carried-over Enter or Space, not a choice. */
const REPEAT_GUARD_MS = 300;

/**
 * The Play phase shared by the strategy drills: compact title, the round's
 * progress and score, the table, the question, the answer pad, and the
 * explanation after an answer that pauses.
 *
 * Focus: a new hand moves focus to the table (never to an answer button, so
 * a repeated Enter cannot answer). A paused explanation takes focus itself,
 * so Enter or Space continues through the one visible Next button.
 */
export function RoundPlay<H, Q>({ drillTitle, reference, round, dockLabel, options, correctOf, table, question, paused, strip, log, chip, shortcuts, remember }: {
  drillTitle: string;
  /** The answer value marked correct on a hand. */
  correctOf: (hand: H) => string;
  reference: ReactNode;
  round: Round<H, Q>;
  dockLabel: string;
  options: readonly PadOption[];
  table: ReactNode;
  question: ReactNode;
  paused?: PausedView;
  strip?: { ok: boolean; summary: ReactNode; details: ReactNode };
  log: ReadonlyArray<{ id: number; ok: boolean; text: string; detail?: string; ms: number }>;
  chip?: ReactNode;
  shortcuts: boolean;
  /** Saves a new explain mode as this device's preference. */
  remember: (explain: ExplainMode) => void;
}) {
  const { plan, tally, session } = round;
  const wide = useMediaQuery("(min-width: 640px)");
  const stage = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const isPaused = Boolean(round.paused);
  const last = tally.answered >= plan.length;
  const current = isPaused ? tally.answered : Math.min(tally.answered + 1, plan.length);
  const progressLabel = `${plan.retry ? "Retry" : "Hand"} ${current} of ${plan.length}`;
  const nextLabel = last ? "See results" : "Next hand";
  // A resumed round says so until its next answer, even one resumed before its first (a retry or focused round).
  const resumed = round.resumedAt !== undefined && !isPaused && {
    title: tally.answered > 0 ? "Picked up where you left off" : plan.retry ? "Picked up your retry round" : "Picked up your focused round",
    detail: tally.answered > 0 ? `${progressLabel}.` : plan.retry ? `${progressLabel}: the hands you missed last time.` : `${progressLabel}. It mixes the play you chose to focus on with other plays.`,
  };

  const answerable = (option: PadOption) => !option.disabled;
  useDrillKeys(isPaused || session ? {} : Object.fromEntries(options.filter(answerable).map((option) => [option.letter.toLowerCase(), () => round.answer(option.value)])), !isPaused);

  // A new hand: keep focus off the answer buttons, and bring the table back into view after a pause.
  const serial = round.handSerial;
  const previousSerial = useRef(serial);
  useEffect(() => {
    if (previousSerial.current === serial) return;
    previousSerial.current = serial;
    const active = document.activeElement;
    const scope = stage.current;
    if (!scope) return;
    if (!active || active === document.body || scope.contains(active) || active.closest(".mobile-action-dock")) {
      scope.querySelector<HTMLElement>("[data-drill-focus]")?.focus({ preventScroll: true });
    }
  }, [serial]);

  // A pause: the explanation sits right under the hand; on phones make sure it clears the dock.
  useEffect(() => {
    if (!isPaused) return;
    const frame = requestAnimationFrame(() => reveal(feedback.current));
    return () => cancelAnimationFrame(frame);
  }, [isPaused]);
  const wasPaused = useRef(isPaused);
  useEffect(() => {
    if (wasPaused.current && !isPaused) reveal(stage.current?.querySelector("[data-drill-focus]"));
    wasPaused.current = isPaused;
  }, [isPaused]);

  const choose = (value: string, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0 && round.shownFor() < REPEAT_GUARD_MS) return;
    round.answer(value);
  };
  const continueOnSpace = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " || (event.target as HTMLElement).getAttribute("role") !== "group") return;
    event.preventDefault();
    round.next();
  };
  const changeExplain = (explain: ExplainMode) => {
    const previous = plan.explain;
    round.setExplain(explain);
    remember(explain);
    toast({
      message: explain === "never" ? "Answers won't pause now. The last hand shows at the top." : "Only mistakes will pause now.",
      tone: "info",
      action: { label: "Undo", onClick: () => { round.setExplain(previous); remember(previous); } },
    });
  };

  return (
    <DrillFrame eyebrow={wide ? "Strategy drill" : ""} title={drillTitle} phase="play" actions={reference}>
      {/* Pinned from lg up. Below that the wrapper is its only room, so it scrolls away and the answered hand and its reason get the screen. */}
      <div className="lg:contents">
      <DrillHud
        progress={{ done: tally.answered, total: plan.length, label: progressLabel }}
        stats={[
          { id: "correct", label: "Correct", value: `${tally.correct} of ${tally.answered}`, tone: tally.answered && tally.correct === tally.answered ? "good" : "neutral", phone: true },
          { id: "streak", label: "Streak", value: tally.streak, sub: wide ? `Best ${tally.best}` : undefined },
        ]}
        chip={chip}
        onEnd={round.requestEnd}
        endLabel="End round"
      />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div ref={stage} className="min-w-0">
          <DrillStage
            label={progressLabel}
            className="!p-3 sm:!p-6 [scroll-margin-top:.5rem] sm:[scroll-margin-top:4.5rem] lg:[scroll-margin-top:calc(4rem+5.5rem)]"
            banner={resumed && <RoundResumeNotice {...resumed} answered={tally.answered} updatedAt={round.resumedAt} onDiscard={() => round.discard()} />}
          >
            {strip && !isPaused && <LastAnswerStrip key={round.last?.number} ok={strip.ok} summary={strip.summary}>{strip.details}</LastAnswerStrip>}
            {table}
            <div className="mt-5 sm:mt-6">{question}</div>
            <div className="mt-4">
              <AnswerPad
                dockLabel={dockLabel}
                options={options}
                onAnswer={choose}
                result={round.paused && { chosen: round.paused.chosen, correct: correctOf(round.paused.hand) }}
                shortcuts={shortcuts}
                next={{ label: nextLabel, onClick: round.next }}
              />
            </div>
            {paused && (
              <div ref={feedback} onKeyDown={continueOnSpace} className="mt-4 [scroll-margin-bottom:calc(var(--dock-clearance,0px)+4.75rem+env(safe-area-inset-bottom))] [scroll-margin-top:.5rem] sm:[scroll-margin-top:4.5rem] lg:[scroll-margin-bottom:1rem] lg:[scroll-margin-top:calc(4rem+5.5rem)]">
                <FeedbackPanel
                  ok={paused.ok}
                  title={paused.title}
                  detail={paused.detail}
                  visual={paused.visual}
                  link={paused.link}
                  testId="drill-feedback"
                  action={
                    <>
                      <Button onClick={round.next} className="hidden lg:inline-flex lg:items-center lg:gap-2">
                        {nextLabel}<span aria-hidden="true"><KeyHint>Enter</KeyHint></span>
                      </Button>
                      {plan.explain !== "never" && (
                        <button type="button" onClick={() => changeExplain(plan.explain === "every" ? "mistakes" : "never")} className="hidden min-h-11 rounded-lg sm:inline-block text-xs font-medium text-[var(--ink-muted)] underline underline-offset-2 outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] lg:min-h-9">
                          {plan.explain === "every" ? "Pause only on mistakes" : "Stop pausing on mistakes"}
                        </button>
                      )}
                    </>
                  }
                >
                  {paused.explanation}
                </FeedbackPanel>
              </div>
            )}
            {!shortcuts && (
              <p className="mt-4 hidden text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:block">
                Keyboard shortcuts are off. <Link href="/settings" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">Turn them on in Settings.</Link>
              </p>
            )}
          </DrillStage>
        </div>
        <div className="hidden lg:block">
          <RoundLog entries={log} />
        </div>
      </div>
      <EndRoundConfirm open={round.confirmingEnd} answered={tally.answered} length={plan.length} onConfirm={round.confirmEnd} onCancel={round.cancelEnd} />
    </DrillFrame>
  );
}
