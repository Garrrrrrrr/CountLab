"use client";

import { ReactNode, useId } from "react";
import { HelpTip, Panel, type SegmentOption } from "@/components/ui";

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

/**
 * The kit's SegmentedControl, with its group named by its question. The kit
 * nests its <legend> inside a <div>, where browsers don't use it to name the
 * fieldset, so screen readers hear "6:5" without "Blackjack pays". This copy
 * names the fieldset with aria-labelledby and otherwise matches the kit; it
 * can go once components/ui.tsx makes the legend the fieldset's first child.
 */
export function LabSegmented<T extends string>({ label, value, onChange, options, name, size = "default", fullWidth = false, className = "", hideLabel = false, help, analyticsField }: { label: string; value: T | null | undefined; onChange: (value: T) => void; options: ReadonlyArray<SegmentOption<T>>; name?: string; size?: "default" | "compact"; fullWidth?: boolean; className?: string; hideLabel?: boolean; help?: ReactNode; analyticsField?: string }) {
  const generated = useId();
  const groupName = name ?? `segment-${generated}`;
  const labelId = `${generated}-label`;
  return (
    <fieldset aria-labelledby={labelId} className={`m-0 grid min-w-0 gap-2 border-0 p-0 ${className}`}>
      <div className={hideLabel ? "sr-only" : "flex items-center gap-1"}>
        <span id={labelId} className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}</span>
        {help && !hideLabel && <HelpTip label={label}>{help}</HelpTip>}
      </div>
      <div className={`${fullWidth ? "flex w-full" : "inline-flex max-w-full"} min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-1`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label key={option.value} className={`pressable relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ${fullWidth ? "flex-1" : ""} ${size === "compact" ? "min-h-9 text-xs [@media(pointer:coarse)]:min-h-11" : "min-h-10 text-sm [@media(pointer:coarse)]:min-h-11"} ${selected ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)]"}`}>
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                aria-label={option.ariaLabel}
                data-analytics-field={analyticsField}
                onChange={() => { if (!selected) onChange(option.value); }}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-lg opacity-0 disabled:cursor-not-allowed"
              />
              {option.icon && <i className={`fa-solid ${option.icon} text-xs`} aria-hidden="true" />}
              <span aria-hidden={option.ariaLabel ? true : undefined}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
