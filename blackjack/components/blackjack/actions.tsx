"use client";
import { useEffect } from "react";
import type { Action } from "@/lib/blackjack/types";
import { cx } from "@/components/ui/cx";

export const ACTION_NAME: Record<Action, string> = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

/** Fill and ink for each action. The same hues in both themes; only Hit's neutral grey adapts. */
export const ACTION_FILL: Record<Action, string> = {
  H: "bg-act-h text-act-h-ink",
  S: "bg-act-s text-act-ink",
  D: "bg-act-d text-act-ink",
  P: "bg-act-p text-act-ink",
  R: "bg-act-r text-act-ink",
};

/** The keyboard key for each action in every strategy drill. */
export const ACTION_KEY: Record<Action, string> = { H: "h", S: "s", D: "d", P: "p", R: "r" };

export function ActionChip({ action, fallback, size = "md", className }: { action: Action; fallback?: Action; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-lg font-semibold", ACTION_FILL[action], size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm", className)}>
      {ACTION_NAME[action]}
      {fallback && <span className="font-medium opacity-80">· else {ACTION_NAME[fallback].toLowerCase()}</span>}
    </span>
  );
}

/**
 * The five action buttons every strategy drill answers with. Sized for thumbs
 * (56px) on phones, with the keyboard letter shown on devices that have one.
 *
 * Actions the hand cannot take are still shown but disabled, so the layout
 * never shifts between questions — muscle memory is the point of the drill.
 */
export function ActionPad({ onAnswer, available = ["H", "S", "D", "P", "R"], disabled = false, highlight, wrong, className }: {
  onAnswer: (action: Action) => void;
  available?: readonly Action[];
  disabled?: boolean;
  /** Marks the correct action after an answer. */
  highlight?: Action;
  /** Marks the action the player chose when it was wrong. */
  wrong?: Action;
  className?: string;
}) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const action = (Object.keys(ACTION_KEY) as Action[]).find((key) => ACTION_KEY[key] === event.key.toLowerCase());
      if (action && available.includes(action)) { event.preventDefault(); onAnswer(action); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer, available, disabled]);
  const order: Action[] = ["H", "S", "D", "P", "R"];
  return (
    <div className={cx("grid grid-cols-5 gap-1.5 sm:gap-2", className)} role="group" aria-label="Choose an action">
      {order.map((action) => {
        const enabled = available.includes(action) && !disabled;
        return (
          <button
            key={action}
            type="button"
            disabled={!enabled}
            onClick={() => onAnswer(action)}
            aria-keyshortcuts={ACTION_KEY[action]}
            aria-label={ACTION_NAME[action]}
            className={cx(
              "relative flex h-14 flex-col items-center justify-center rounded-2xl text-[0.9375rem] font-bold transition active:scale-[0.97] sm:h-16",
              ACTION_FILL[action],
              !available.includes(action) && "opacity-25",
              highlight === action && "ring-4 ring-brand ring-offset-2 ring-offset-bg",
              wrong === action && "opacity-60 line-through",
              disabled && available.includes(action) && highlight !== action && "opacity-50",
            )}
          >
            {/* Five buttons share 288px on a 320px phone: the label scales with the screen so "Surrender" always fits. */}
            <span className="text-[clamp(0.5625rem,3vw,0.9375rem)] leading-none tracking-tight">{ACTION_NAME[action]}</span>
            <span className="mt-1 hidden font-mono text-[0.625rem] font-medium uppercase opacity-60 [@media(hover:hover)]:block">{ACTION_KEY[action]}</span>
          </button>
        );
      })}
    </div>
  );
}
