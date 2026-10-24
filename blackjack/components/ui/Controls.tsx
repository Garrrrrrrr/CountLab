"use client";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { cx } from "./cx";

export type Option<T extends string | number> = { value: T; label: ReactNode; hint?: string; disabled?: boolean };

/**
 * A segmented control built on native radio inputs, so arrow keys, form
 * semantics and screen-reader grouping all come from the browser.
 */
export function Segmented<T extends string | number>({ label, value, options, onChange, size = "md", block = true, hideLabel = false, className, name }: {
  label: string; value: T; options: readonly Option<T>[]; onChange: (value: T) => void; size?: "sm" | "md"; block?: boolean; hideLabel?: boolean; className?: string; name?: string;
}) {
  const id = useId();
  const group = name ?? id;
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className={cx(hideLabel ? "sr-only" : "mb-1.5 text-sm font-medium text-ink-2")}>{label}</legend>
      <div className={cx("flex rounded-xl border border-line bg-surface-2 p-1", block ? "w-full" : "inline-flex")}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={String(option.value)}
              title={option.hint}
              className={cx(
                "relative flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[0.6rem] px-2 text-center font-semibold transition",
                size === "sm" ? "h-8 text-[0.8125rem]" : "h-10 text-sm",
                checked ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink",
                option.disabled && "cursor-not-allowed opacity-40",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={group}
                value={String(option.value)}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="truncate">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A switch. The whole row is the hit target, which matters at thumb size. */
export function Toggle({ label, description, checked, onChange, disabled, className }: {
  label: ReactNode; description?: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-center justify-between gap-4", disabled && "cursor-not-allowed opacity-50", className)}>
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm leading-5 text-ink-2">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-surface-3 transition peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-1 transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** − value + with 44px targets. Holds a number; formatting is the caller's. */
export function Stepper({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, format = String, hideLabel, className, size = "md" }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; format?: (value: number) => ReactNode; hideLabel?: boolean; className?: string; size?: "sm" | "md";
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(6))));
  const btn = cx("grid place-items-center rounded-lg text-ink-2 transition hover:bg-surface-3 hover:text-ink disabled:opacity-30", size === "md" ? "h-10 w-10" : "h-8 w-8");
  return (
    <div className={cx("min-w-0", className)}>
      {!hideLabel && <p className="mb-1.5 text-sm font-medium text-ink-2">{label}</p>}
      <div role="group" aria-label={label} className="flex items-center justify-between gap-1 rounded-xl border border-line bg-surface-2 p-1">
        <button type="button" className={btn} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          <Minus size={18} aria-hidden />
        </button>
        <output aria-live="polite" className="tnum min-w-[3ch] flex-1 text-center text-base font-semibold">{format(value)}</output>
        <button type="button" className={btn} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}

const fieldBase = "w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[1rem] text-ink placeholder:text-ink-3 transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50";

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-2">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-neg">{error}</p> : hint ? <p className="mt-1.5 text-xs leading-5 text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * A text or number input with its label. Inputs are 16px so iOS never zooms
 * the page on focus.
 */
export function TextField({ label, hint, error, className, prefix, suffix, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode; prefix?: ReactNode; suffix?: ReactNode }) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={id}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">{prefix}</span>}
        <input id={id} aria-invalid={error ? true : undefined} className={cx(fieldBase, "h-12", prefix ? "pl-8" : undefined, suffix ? "pr-12" : undefined)} {...rest} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-ink-3">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SelectField({ label, hint, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode }) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} className={className} htmlFor={id}>
      <div className="relative">
        <select id={id} className={cx(fieldBase, "h-12 appearance-none pr-10")} {...rest}>{children}</select>
        <ChevronDown size={18} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
      </div>
    </Field>
  );
}

export function TextArea({ label, hint, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode }) {
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} hint={hint} className={className} htmlFor={id}>
      <textarea id={id} className={cx(fieldBase, "min-h-24 py-3 leading-6")} {...rest} />
    </Field>
  );
}

/** Tabs that switch a panel in place. Renders a real tablist with roving arrow keys. */
export function Tabs<T extends string>({ label, value, tabs, onChange, className }: { label: string; value: T; tabs: readonly { value: T; label: ReactNode }[]; onChange: (value: T) => void; className?: string }) {
  const move = (direction: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    onChange(next.value);
    requestAnimationFrame(() => document.getElementById(`tab-${label}-${next.value}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} className={cx("scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      }}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`tab-${label}-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cx(
              "relative h-11 shrink-0 whitespace-nowrap px-3 text-sm font-semibold transition",
              selected ? "text-ink after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-brand" : "text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
