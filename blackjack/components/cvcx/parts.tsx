"use client";

import { ReactNode, useEffect, useId } from "react";
import { GhostButton, HelpTip, KeyHint, Panel, SegmentedControl } from "@/components/ui";
import type { Lab, UndoSource } from "./useLab";

/**
 * One numbered input card of the Lab (1 Game, 2 Bankroll, 3 Bet ramp). The
 * heading takes focus when a step is opened from the step tabs or a Next
 * button, and the card is a container for its own responsive field grid.
 */
export function StepCard({ id, step, title, summary, children, className = "", onInteract }: { id: string; step?: number; title: string; summary?: ReactNode; children: ReactNode; className?: string; onInteract?: () => void }) {
  return (
    <Panel id={id} aria-labelledby={`${id}-title`} className={`lab-card scroll-mt-20 ${className}`} onFocusCapture={onInteract} onPointerDownCapture={onInteract}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} tabIndex={-1} className="flex items-center gap-2.5 font-display text-lg font-semibold outline-none">
          {step !== undefined && <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-data text-xs text-[var(--paper)]">{step}</span>}
          {title}
        </h2>
        {summary && <p className="min-w-0 font-data text-xs text-[var(--ink-muted)]">{summary}</p>}
      </div>
      {children}
    </Panel>
  );
}

/**
 * A labelled select whose explanation sits beside the label rather than inside
 * it, so the control's accessible name stays exactly the label.
 */
export function LabSelect({ label, help, helpLabel, hint, value, onChange, analyticsField, children }: { label: string; help?: ReactNode; helpLabel?: string; hint?: ReactNode; value: string | number; onChange: (value: string) => void; analyticsField?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-h-6 items-center gap-1">
        <label htmlFor={id} className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}</label>
        {help && <HelpTip label={helpLabel ?? label.toLowerCase()}>{help}</HelpTip>}
      </div>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} data-analytics-field={analyticsField} className="field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none">
        {children}
      </select>
      {hint && <p id={`${id}-hint`} className="text-xs leading-5 text-[var(--ink-muted)]">{hint}</p>}
    </div>
  );
}

/** A small status mark: Audited, Estimated, Custom. */
export function StatusMark({ tone, icon, children }: { tone: "good" | "warn" | "neutral"; icon?: string; children: ReactNode }) {
  const color = tone === "good" ? "var(--accent)" : tone === "warn" ? "var(--warning)" : "var(--ink-muted)";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ borderColor: color, color }}>
      {icon && <i className={`fa-solid ${icon} text-[.7rem]`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * The pending Undo for a bulk change, beside the control that made it, until
 * the next direct edit. The toast offers the same Undo, but it sits at the end
 * of the page; this one is a Tab away. Ctrl+Z (⌘Z) does the same.
 */
export function InlineUndo({ lab, source, className = "" }: { lab: Lab; source: UndoSource; className?: string }) {
  const pending = lab.pendingUndo;
  if (pending?.source !== source) return null;
  return <UndoButton message={pending.message} onUndo={lab.undoLast} className={className} />;
}

function UndoButton({ message, onUndo, className }: { message: string; onUndo: () => void; className: string }) {
  const id = useId();
  // Some changes remove the control that made them (Start over, a fix button); keep keyboard focus here instead of losing it.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) document.getElementById(id)?.focus();
  }, [id]);
  // Only ever rendered after a change in the browser, so reading the platform here can't cause a hydration mismatch.
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <GhostButton id={id} size="compact" className={className} onClick={onUndo} aria-label={`Undo: ${message}`} aria-keyshortcuts="Control+Z Meta+Z">
      <i className="fa-solid fa-rotate-left mr-2" aria-hidden="true" />Undo
      <span className="ml-2 [@media(pointer:coarse)]:hidden"><KeyHint>{mac ? "⌘Z" : "Ctrl+Z"}</KeyHint></span>
    </GhostButton>
  );
}

/** The Lab's choices use the kit control, which names each group by its question. */
export const LabSegmented = SegmentedControl;
