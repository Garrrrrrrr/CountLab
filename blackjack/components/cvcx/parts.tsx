"use client";

import { ReactNode, useId } from "react";
import { HelpTip, Panel } from "@/components/ui";

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

/** A heading-less group label with an optional explanation, for rows of read-only facts. */
export function FieldCaption({ children, help, helpLabel }: { children: ReactNode; help?: ReactNode; helpLabel?: string }) {
  return (
    <div className="flex min-h-6 items-center gap-1 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
      <span>{children}</span>
      {help && helpLabel && <HelpTip label={helpLabel}>{help}</HelpTip>}
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
