"use client";
import type { MouseEvent } from "react";
import { Button, KeyHint, MobileActionDock } from "@/components/ui";

export interface PadOption {
  value: string;
  label: string;
  /** The key that answers it, and the letter on its colour swatch. */
  letter: string;
  /** Fixed chart colours (ACTION_STYLE); neutral when absent. */
  swatch?: string;
  /** Offered for muscle memory but not playable here (Split on a non-pair). */
  disabled?: boolean;
}

const NEUTRAL_SWATCH = "border-[var(--ink-muted)] bg-[var(--paper)] text-[var(--ink)]";

function Swatch({ option, small = false }: { option: PadOption; small?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-md border font-data font-bold ${small ? "h-5 w-5 text-[.65rem]" : "h-7 w-7 text-xs"} ${option.swatch ?? NEUTRAL_SWATCH}`}>
      {option.letter}
    </span>
  );
}

function Mark({ kind }: { kind: "chosen" | "correct" }) {
  return kind === "correct"
    ? <span className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)]"><i className="fa-solid fa-check" aria-hidden="true" />Correct play</span>
    : <span className="flex items-center gap-1 text-xs font-semibold text-[var(--negative)]"><i className="fa-solid fa-xmark" aria-hidden="true" />Your answer</span>;
}

/**
 * The answer buttons: one colour-coded button per play, in the chart's own
 * colours, with a key hint on wide screens. They sit inline from lg up and in
 * the thumb dock below that. After an answer that pauses, the buttons stay
 * put, marked with the answer given and the correct play, and the dock swaps
 * to the single Next button.
 *
 * Accessible names are the plain labels ("Hit"); the key is announced through
 * aria-keyshortcuts, never read into the name.
 */
export function AnswerPad({ dockLabel, options, onAnswer, result, shortcuts, next }: {
  dockLabel: string;
  options: readonly PadOption[];
  onAnswer: (value: string, event: MouseEvent<HTMLButtonElement>) => void;
  /** Set while paused on an answered hand. */
  result?: { chosen: string; correct: string };
  shortcuts: boolean;
  next?: { label: string; onClick: () => void };
}) {
  const paused = Boolean(result);
  const button = (option: PadOption, docked: boolean) => {
    const correct = result?.correct === option.value;
    const chosenWrong = result && result.chosen === option.value && !correct;
    const tone = correct ? "border-[var(--accent)] bg-emerald-400/[.12]" : chosenWrong ? "border-[var(--negative)] bg-red-500/[.08]" : "border-[var(--rule)] bg-[var(--paper-raised)]";
    const unavailable = option.disabled && !paused;
    return (
      <button
        key={option.value}
        type="button"
        disabled={paused}
        aria-disabled={unavailable || undefined}
        aria-keyshortcuts={shortcuts && !docked ? option.letter : undefined}
        onClick={(event) => { if (!unavailable) onAnswer(option.value, event); }}
        className={`pressable flex min-w-0 items-center gap-2.5 rounded-xl border px-3 text-left shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] ${docked ? "min-h-12" : "min-h-14"} ${tone} ${unavailable ? "cursor-not-allowed opacity-40" : paused && !correct && !chosenWrong ? "opacity-45" : "hover:border-[var(--ink-muted)]"}`}
      >
        <Swatch option={option} small={docked} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold text-[var(--ink)] ${docked ? "text-base" : "text-lg"}`}>{option.label}</span>
          {correct && <Mark kind="correct" />}
          {chosenWrong && <Mark kind="chosen" />}
        </span>
        {shortcuts && !docked && !paused && <span aria-hidden="true" className="hidden sm:inline"><KeyHint>{option.letter}</KeyHint></span>}
      </button>
    );
  };
  const columns = options.length > 2 ? "grid-cols-4" : "grid-cols-2";
  return (
    <>
      <div role="group" aria-label="Your play" className={`hidden gap-2 lg:grid ${columns}`}>
        {options.map((option) => button(option, false))}
      </div>
      <MobileActionDock label={dockLabel}>
        {paused && next ? (
          <Button onClick={next.onClick} className="w-full">{next.label}</Button>
        ) : (
          <div role="group" aria-label="Your play" className="grid grid-cols-2 gap-2">
            {options.map((option) => button(option, true))}
          </div>
        )}
      </MobileActionDock>
    </>
  );
}
