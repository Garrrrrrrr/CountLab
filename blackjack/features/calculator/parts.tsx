"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { Button, Field, cx } from "@/components/ui";
import type { Calc, UndoSource } from "./useCalculator";

/** One card of the Calculator. The heading takes focus when a tab opens it. */
export function Panel({ id, title, sub, eyebrow, action, children, className }: {
  id: string; title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cx("card scroll-mt-28 p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 id={`${id}-title`} tabIndex={-1} className="text-lg leading-tight outline-none">{title}</h2>
          {sub && <p className="mt-1 text-sm leading-6 text-ink-2">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A native disclosure styled like the rest of the app; the whole summary row is the target. */
export function Disclosure({ summary, children, section, open, onToggle, className }: {
  summary: ReactNode; children: ReactNode; section: string; open?: boolean; onToggle?: (open: boolean) => void; className?: string;
}) {
  return (
    <details
      open={open}
      onToggle={onToggle ? (event) => onToggle(event.currentTarget.open) : undefined}
      data-analytics-section={section}
      className={cx("group min-w-0", className)}
    >
      <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-sm font-semibold text-ink marker:hidden hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1">{summary}</span>
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

/**
 * The pending Undo for a bulk change, beside the control that made it, until
 * the next direct edit. Ctrl+Z (⌘Z) does the same.
 */
export function InlineUndo({ calc, source, className }: { calc: Calc; source: UndoSource; className?: string }) {
  const pending = calc.pendingUndo;
  if (pending?.source !== source) return null;
  return <UndoButton message={pending.message} onUndo={calc.undoLast} className={className} />;
}

function UndoButton({ message, onUndo, className }: { message: string; onUndo: () => void; className?: string }) {
  const id = useId();
  // Some changes remove the control that made them (Start over, a fix button); keep keyboard focus here instead of losing it.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) document.getElementById(id)?.focus();
  }, [id]);
  return (
    <Button id={id} variant="secondary" size="sm" className={cx("min-h-11 sm:min-h-9", className)} onClick={onUndo} aria-label={`Undo: ${message}`} aria-keyshortcuts="Control+Z Meta+Z" icon={<RotateCcw size={15} aria-hidden />}>
      Undo
    </Button>
  );
}

const parse = (raw: string) => {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
};

/** Keeps a typed draft while focused, so "1" on the way to "1500" never fights the field. */
export function useNumberDraft(value: number, onChange: (value: number) => void, min: number, max: number) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : String(value);
  return {
    value: shown,
    onFocus: () => { setDraft(String(value)); setFocused(true); },
    onChange: (raw: string) => {
      setDraft(raw);
      const parsed = parse(raw);
      if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed);
    },
    onBlur: () => {
      setFocused(false);
      const parsed = parse(draft);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.min(max, Math.max(min, parsed));
      if (clamped !== value) onChange(clamped);
    },
  };
}

/** A labelled number input that updates the results as you type and settles into range when you leave it. */
export function NumberField({ label, value, onChange, min = -Infinity, max = Infinity, prefix, suffix, hint, field, className, step }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; prefix?: string; suffix?: string; hint?: ReactNode; field?: string; className?: string; step?: number | "any";
}) {
  const id = useId();
  const draft = useNumberDraft(value, onChange, min, max);
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? "any"}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          data-analytics-field={field}
          value={draft.value}
          onFocus={draft.onFocus}
          onChange={(event) => draft.onChange(event.target.value)}
          onBlur={draft.onBlur}
          className={cx(
            "tnum h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[1rem] text-ink transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
            prefix && "pl-8",
            suffix && "pr-20",
          )}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-3">{suffix}</span>}
      </div>
    </Field>
  );
}

/**
 * − [value] + where the value can also be typed. The input is named by
 * `label`, the buttons "Decrease …" and "Increase …"; targets are 44px.
 */
export function NumberStepper({ label, value, onChange, min = 0, max = 999, step = 1, field, className, disabled }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; field?: string; className?: string; disabled?: boolean;
}) {
  const draft = useNumberDraft(value, onChange, min, max);
  const clamp = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(6))));
  const button = "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-3 hover:text-ink disabled:opacity-30";
  return (
    <div className={cx("flex items-center rounded-xl border border-line bg-surface-2 p-0.5", className)}>
      <button type="button" className={button} aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus size={18} aria-hidden />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        aria-label={label}
        disabled={disabled}
        data-analytics-field={field}
        value={draft.value}
        onFocus={draft.onFocus}
        onChange={(event) => draft.onChange(event.target.value)}
        onBlur={draft.onBlur}
        className="tnum h-11 w-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold text-ink outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      <button type="button" className={button} aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}

/** A small figure: label, value and a line of context. */
export function Figure({ label, value, sub, tone, className, testId }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" | "warn"; className?: string; testId?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd data-testid={testId} className={cx("tnum mt-0.5 text-lg font-semibold leading-tight tracking-tight", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs leading-4 text-ink-3">{sub}</dd>}
    </div>
  );
}

/** A plain-language definition shown once, under a figure or a control. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-xs leading-5 text-ink-3", className)}>{children}</p>;
}
