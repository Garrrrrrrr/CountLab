"use client";
/**
 * Small pieces the journal's cards, lists and sheets share. They live here,
 * not in components/ui, because only this feature grades results against EV
 * and validates money as it is typed.
 */
import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown, ChevronsDown, ChevronsUp, CircleAlert, CircleCheck, CircleQuestionMark, Search, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react";
import { Button, Sheet, cx } from "@/components/ui";
import type { SessionAssessment } from "@/lib/blackjack/journalAnalysis";
import { parseAmount, type AmountEntry, type ResultDirection } from "@/lib/blackjack/journalForm";

/** Sheet, kept as the journal's name for it. */
export const JournalSheet = Sheet;

/* ------------------------------------------------------------------------ */
/* Verdicts                                                                  */
/* ------------------------------------------------------------------------ */

export const ASSESSMENT_LABEL: Record<SessionAssessment, string> = {
  "insufficient-data": "Not enough data",
  "within-expected-range": "Within expected range",
  "better-than-expected": "Better than expected",
  "worse-than-expected": "Worse than expected",
  "outlier-high": "Well above expected",
  "outlier-low": "Well below expected",
};

const ASSESSMENT_STYLE: Record<SessionAssessment, [typeof CircleCheck, string]> = {
  "insufficient-data": [CircleQuestionMark, "text-ink-3"],
  "within-expected-range": [CircleCheck, "text-ink-2"],
  "better-than-expected": [TrendingUp, "text-pos"],
  "worse-than-expected": [TrendingDown, "text-warn"],
  "outlier-high": [ChevronsUp, "text-pos"],
  "outlier-low": [ChevronsDown, "text-neg"],
};

/** How a result compares with expectation, as an icon and words, never colour alone. */
export function Verdict({ assessment, size = "md", className }: { assessment: SessionAssessment; size?: "sm" | "md"; className?: string }) {
  const [Icon, color] = ASSESSMENT_STYLE[assessment];
  return (
    <span className={cx("inline-flex items-center gap-1 font-medium", size === "sm" ? "text-xs" : "text-sm", color, className)}>
      <Icon size={size === "sm" ? 13 : 15} aria-hidden className="shrink-0" />
      <span className="truncate">{ASSESSMENT_LABEL[assessment]}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Label/value lists                                                         */
/* ------------------------------------------------------------------------ */

export type KeyValue = { label: string; value: ReactNode; sub?: ReactNode };

/** Dense label-and-value pairs in a definition list, two to a row. */
export function KeyValueList({ items, title, className }: { items: readonly KeyValue[]; title?: string; className?: string }) {
  const titleId = useId();
  return (
    <div className={cx("min-w-0", className)}>
      {title && <h3 id={titleId} className="eyebrow mb-2">{title}</h3>}
      <dl aria-labelledby={title ? titleId : undefined} className="grid grid-cols-2 gap-x-4 gap-y-3">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-b border-line pb-2">
            <dt className="text-xs text-ink-3">{item.label}</dt>
            <dd className="tnum mt-0.5 break-words text-sm font-semibold text-ink">{item.value}</dd>
            {item.sub && <dd className="text-xs text-ink-3">{item.sub}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Where one outcome fell inside its 95% range: the band, a tick at the
 * expectation and a dot for the result, pinned to an end when it fell outside.
 */
export function RangeBar({ low, high, expected, value, format, label }: { low: number; high: number; expected: number; value: number; format: (value: number) => string; label: string }) {
  const span = high - low;
  const position = (point: number) => span > 0 ? Math.max(0, Math.min(100, ((point - low) / span) * 100)) : 50;
  const outside = value < low ? "low" : value > high ? "high" : null;
  return (
    <figure className="m-0 min-w-0">
      <div role="img" aria-label={label} className="relative mx-2 h-8">
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full border border-brand/40 bg-brand/15" />
        <div className="absolute top-1 h-6 w-0.5 -translate-x-1/2 rounded bg-ink-2" style={{ left: `${position(expected)}%` }} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${position(value)}%` }}>
          {outside
            ? <span className={cx("block h-0 w-0 border-y-[7px] border-y-transparent", outside === "low" ? "border-r-[10px] border-r-ink" : "border-l-[10px] border-l-ink")} />
            : <span className="block h-4 w-4 rounded-full border-2 border-surface bg-ink shadow-1" />}
        </div>
      </div>
      <div aria-hidden className="tnum mt-1 flex justify-between gap-2 text-[0.6875rem] text-ink-3">
        <span>{format(low)}</span>
        <span>Expected {format(expected)}</span>
        <span>{format(high)}</span>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Inputs                                                                    */
/* ------------------------------------------------------------------------ */

const fieldClass = "w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[1rem] text-ink placeholder:text-ink-3 transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50 aria-[invalid=true]:border-neg aria-[invalid=true]:ring-neg/20";

/** An error under a field, linked to it by id and announced when it appears. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-neg">
      <CircleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />{children}
    </p>
  );
}

type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & { label: ReactNode; hint?: ReactNode; error?: ReactNode; prefix?: ReactNode; suffix?: ReactNode; labelClassName?: string };

/**
 * The shared TextField's look with its error wired up: the message is linked
 * by aria-describedby and the border turns red. 16px text, so iOS never zooms.
 */
export function InputField({ label, hint, error, prefix, suffix, className, labelClassName, id, ...rest }: InputFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={inputId} className={cx("mb-1.5 block text-sm font-medium text-ink-2", labelClassName)}>{label}</label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">{prefix}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cx(fieldClass, "h-12", prefix ? "pl-8" : undefined, suffix ? "pr-12" : undefined)}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-3">{suffix}</span>}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : hint ? <p id={hintId} className="mt-1.5 text-xs leading-5 text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * A number typed as text, so a half-typed "4." or a cleared field never snaps
 * back mid-edit. Valid values reach the parent as they are typed; on leaving,
 * the text shows the last valid value again.
 */
export function NumberField({ value, onValueChange, min = -Infinity, max = Infinity, ...rest }: Omit<InputFieldProps, "value" | "onChange" | "min" | "max"> & { value: number; onValueChange: (value: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);
  const parsed = Number(text.replace(/,/g, "").trim());
  const invalid = focused && (text.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max);
  return (
    <InputField
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={invalid || rest.error ? true : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const number = Number(next.replace(/,/g, "").trim());
        if (next.trim() !== "" && Number.isFinite(number) && number >= min && number <= max) onValueChange(number);
      }}
    />
  );
}

/**
 * A dollar amount that may be blank. "$1,250" reads as 1250; text that isn't a
 * number is reported as "invalid" and stays on screen to be fixed, never cut
 * back to the digits that parsed.
 */
export function AmountField({ label, value, onValueChange, error, onBlur, id, hint }: {
  label: string; value: AmountEntry; onValueChange: (value: AmountEntry) => void; error?: ReactNode; onBlur?: () => void; id?: string; hint?: ReactNode;
}) {
  const textOf = (entry: AmountEntry) => typeof entry === "number" ? String(entry) : "";
  const [text, setText] = useState(() => textOf(value));
  const [focused, setFocused] = useState(false);
  // Show changes made elsewhere (a reset, or a minus sign turned into Lost) once the field is left.
  useEffect(() => { if (!focused && value !== "invalid") setText(textOf(value)); }, [value, focused]);
  return (
    <InputField
      id={id}
      label={label}
      hint={hint}
      error={error}
      prefix="$"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(event) => { setText(event.target.value); onValueChange(parseAmount(event.target.value)); }}
      onBlur={() => { setFocused(false); onBlur?.(); }}
    />
  );
}

/**
 * Won or Lost as two radios that start unselected: a result's sign is a
 * choice, never a default. Native radios give arrow keys and grouping.
 */
export function DirectionToggle({ value, onChange, error }: { value: ResultDirection | null; onChange: (value: ResultDirection) => void; error?: boolean }) {
  const name = useId();
  const options = [
    { value: "won" as const, label: "Won", icon: TrendingUp, on: "bg-pos/10 text-pos border-pos/40" },
    { value: "lost" as const, label: "Lost", icon: TrendingDown, on: "bg-neg/10 text-neg border-neg/40" },
  ];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink-2">Result</legend>
      <div className={cx("grid grid-cols-2 gap-2", error && "rounded-xl ring-2 ring-neg/30")}>
        {options.map((option) => {
          const checked = value === option.value;
          const Icon = option.icon;
          return (
            <label key={option.value} className={cx(
              "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-[0.9375rem] font-semibold transition",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
              checked ? option.on : "border-line bg-surface-2 text-ink-2 hover:text-ink",
            )}>
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
              <Icon size={18} aria-hidden />{option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A compact filter: a native select drawn as a pill, with an icon and a screen-reader label. */
export function PillSelect({ label, icon, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; icon?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("relative min-w-0", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      {icon && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">{icon}</span>}
      <select id={id} className={cx("h-11 w-full min-w-0 appearance-none truncate rounded-full border border-line bg-surface pr-9 text-base font-medium text-ink shadow-1 transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25", icon ? "pl-9" : "pl-4")} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

/** A search input with a leading icon and a clear button; Escape clears it. */
export function SearchField({ label, value, onChange, placeholder, id }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; id?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="relative min-w-0">
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Search size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && value) { event.preventDefault(); event.stopPropagation(); onChange(""); } }}
        className={cx(fieldClass, "h-11 pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => { onChange(""); document.getElementById(inputId)?.focus(); }} className="absolute right-0.5 top-1/2 grid grid-cols-1 h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:text-ink">
          <X size={17} aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Unsaved-changes guard                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Asks before unsaved input is thrown away, in place of a sheet's footer
 * rather than as a second dialog. Focus starts on the safe choice.
 */
export function DiscardBar({ message, onKeep, onDiscard }: { message: string; onKeep: () => void; onDiscard: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => { bar.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  return (
    <div ref={bar} role="alert" className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 font-semibold text-ink"><TriangleAlert size={18} aria-hidden className="text-warn" />{message}</p>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={onKeep}>Keep editing</Button>
        <Button variant="danger" className="flex-1 sm:flex-none" onClick={onDiscard}>Discard</Button>
      </div>
    </div>
  );
}

/**
 * The guard the form sheets share. Closing a changed form (Cancel, Close,
 * Escape, the backdrop or browser Back) shows the DiscardBar instead. Keeping
 * the edits puts focus back where it was, or on Cancel when that was the
 * button the bar replaced.
 *
 * Put `actionsRef` on the footer element whose first button is Cancel, and
 * pass `onSheetClose` to the Sheet.
 */
export function useDiscardGuard({ dirty, onClose, registerGuard }: {
  dirty: boolean;
  onClose: () => void;
  /** Lets the page ask before closing on browser Back; the guard returns false while there are unsaved changes. */
  registerGuard: (guard: (() => boolean) | null) => void;
}) {
  const [discarding, setDiscarding] = useState(false);
  const dirtyRef = useRef(dirty);
  const origin = useRef<Element | null>(null);
  const restoring = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  // Closing the tab or reloading (including a reload the app itself starts) asks first while there is unsaved input.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const ask = useCallback(() => {
    origin.current = document.activeElement;
    setDiscarding(true);
  }, []);
  useEffect(() => {
    registerGuard(() => {
      if (!dirtyRef.current) return true;
      ask();
      return false;
    });
    return () => registerGuard(null);
  }, [registerGuard, ask]);

  useEffect(() => {
    if (discarding || !restoring.current) return;
    restoring.current = false;
    const target = origin.current;
    origin.current = null;
    const inSheet = target instanceof HTMLElement && target.isConnected && target.getAttribute("role") !== "dialog" && target.closest("[role=dialog]") !== null;
    (inSheet ? target : actionsRef.current?.querySelector("button"))?.focus();
  }, [discarding]);

  const requestClose = () => { if (dirty) ask(); else onClose(); };
  const keepEditing = () => {
    restoring.current = true;
    setDiscarding(false);
  };
  /** Closing the sheet while the bar is up means "not yet": keep editing. */
  const onSheetClose = () => { if (discarding) keepEditing(); else requestClose(); };
  return { discarding, requestClose, keepEditing, onSheetClose, actionsRef };
}

/** A collapsible block, closed by default, with a real button and aria-expanded. */
export function Disclosure({ summary, children, defaultOpen = false, onOpen, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; onOpen?: () => void; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}
        className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-lg px-1 text-left text-sm font-semibold text-ink hover:text-brand-text">
        {summary}
        <ChevronDown size={18} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      <div id={panel} hidden={!open} className="pt-2">{open && children}</div>
    </div>
  );
}

/**
 * A labelled figure. Unlike the shared Stat it never truncates the value, so a
 * long amount wraps the grid rather than hiding its last digits.
 */
export function Figure({ label, value, sub, tone, size = "md", className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg"; size?: "lg" | "md"; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className={cx("tnum mt-1 whitespace-nowrap font-semibold tracking-tight", size === "lg" ? "text-2xl sm:text-3xl" : "text-base xs:text-lg", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-5 text-ink-3">{sub}</p>}
    </div>
  );
}
