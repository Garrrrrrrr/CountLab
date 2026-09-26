"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, RefObject, useCallback, useId, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/useModalFocus";
export const Panel = ({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) => (
  <section {...rest} className={`surface min-w-0 rounded-[1.35rem] p-4 sm:p-5 md:p-6 ${className}`}>
    {children}
  </section>
);
/**
 * The page's primary action. `enterAction` (default on) lets Enter anywhere on
 * the page press it when it is the only such button visible; turn it off for
 * secondary or live-calculator buttons so Enter never triggers them by surprise.
 */
export const Button = ({
  className = "",
  variant = "primary",
  size = "default",
  enterAction = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "quiet"; size?: "default" | "compact"; enterAction?: boolean }) => (
  <button
    data-enter-action={enterAction ? "true" : undefined}
    {...props}
    className={`pressable min-h-11 rounded-lg border px-4 py-2.5 font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 ${variant === "danger" ? "border-red-700 bg-red-700 text-white" : variant === "quiet" ? "border-[var(--rule)] bg-transparent text-[var(--ink)]" : "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"} ${size === "compact" ? "min-h-9 px-3 py-1.5 text-sm" : ""} ${className}`}
  />
);
export const GhostButton = ({
  className = "",
  selected = false,
  size = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; size?: "default" | "compact" }) => (
  <button
    {...props}
    className={`pressable rounded-lg border font-medium ${size === "compact" ? "min-h-9 px-3 py-1.5 text-sm [@media(pointer:coarse)]:min-h-11" : "min-h-11 px-4 py-2.5"} shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:opacity-90" : "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] hover:bg-[var(--paper)]"} ${className}`}
  />
);
export function MobileActionDock({
  children,
  className = "",
  label = "Available actions",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const dock = useRef<HTMLDivElement>(null);
  // The dock floats above the page, so publish its height for the footer to
  // clear; otherwise the last links on the page sit underneath it.
  useEffect(() => {
    const element = dock.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--dock-clearance", `${element.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => { observer.disconnect(); root.style.removeProperty("--dock-clearance"); };
  }, []);
  return (
    <div
      ref={dock}
      role="group"
      aria-label={label}
      className={`mobile-action-dock lg:hidden ${className}`}
    >
      {children}
    </div>
  );
}
export const Select = ({
  label,
  children,
  className = "",
  ...props
}: {
  label: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
    {label}
    <select
      {...props}
      className={`field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none ${className}`}
    >
      {children}
    </select>
  </label>
);
export function NumberField({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  ariaLabel,
  className = "",
  disabled = false,
  inputStep,
  analyticsField,
  help,
}: {
  label?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  /** A unit shown after the number, e.g. "h" or "units". */
  suffix?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** The native input's step; "any" allows fractional values the spinner would otherwise mark invalid. */
  inputStep?: number | "any";
  /** A stable name for analytics autocapture, independent of the visible label. */
  analyticsField?: string;
  /** One line of guidance under the field. */
  help?: ReactNode;
}) {
  const [draft, setDraft] = useState(String(value)),
    [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.min(
      max ?? Infinity,
      Math.max(min ?? -Infinity, parsed),
    );
    onValueChange(normalized);
    setDraft(String(normalized));
  };
  const field = (
    <div
      className={`field flex min-h-11 w-full min-w-0 items-center rounded-xl ${focused ? "field-active" : ""} ${className}`}
    >
      {prefix && <span className="pl-3 text-[var(--ink-muted)]">{prefix}</span>}
      <input
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        inputMode="decimal"
        type="number"
        min={min}
        max={max}
        step={inputStep ?? step}
        data-analytics-field={analyticsField}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw.trim() !== "") {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) onValueChange(parsed);
          }
        }}
        onBlur={commit}
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[.9rem] text-[var(--ink)] outline-none disabled:opacity-50"
      />
      {suffix && <span className="shrink-0 pr-3 text-[.85rem] text-[var(--ink-muted)]">{suffix}</span>}
    </div>
  );
  return label ? (
    <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
      {label}
      {field}
      {help && <span className="text-xs font-normal leading-5">{help}</span>}
    </label>
  ) : (
    field
  );
}

/**
 * A number that may be left blank (e.g. an amount not yet entered). Unlike
 * NumberField it never substitutes a value: empty stays null, and a typed
 * minus sign is kept rather than clamped away.
 */
export function OptionalNumberField({ label, value, onValueChange, min, max, prefix, suffix, placeholder, analyticsField, help, invalid = false, className = "" }: { label: string; value: number | null; onValueChange: (value: number | null) => void; min?: number; max?: number; prefix?: string; suffix?: string; placeholder?: string; analyticsField?: string; help?: ReactNode; invalid?: boolean; className?: string }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const helpId = useId();
  useEffect(() => { if (!focused) setDraft(value === null ? "" : String(value)); }, [value, focused]);
  const parse = (raw: string) => {
    if (raw.trim() === "") return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
  };
  return (
    <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
      {label}
      <span className={`field flex min-h-11 w-full min-w-0 items-center rounded-xl ${focused ? "field-active" : ""} ${invalid ? "!border-[var(--negative)]" : ""} ${className}`}>
        {prefix && <span className="pl-3 text-[var(--ink-muted)]">{prefix}</span>}
        <input
          inputMode="decimal"
          type="text"
          value={draft}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={help ? helpId : undefined}
          data-analytics-field={analyticsField}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = parse(event.target.value);
            if (parsed !== undefined) onValueChange(parsed);
          }}
          onBlur={() => { setFocused(false); const parsed = parse(draft); setDraft(parsed === null || parsed === undefined ? "" : String(parsed)); }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[.9rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
        />
        {suffix && <span className="shrink-0 pr-3 text-[.85rem] text-[var(--ink-muted)]">{suffix}</span>}
      </span>
      {help && <span id={helpId} className="text-xs font-normal leading-5">{help}</span>}
    </label>
  );
}
export const Switch = ({
  label,
  checked,
  onChange,
  disabled = false,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) => (
  <div className={`grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)] ${className}`}>
    <span className="truncate">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`pressable flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "border-[var(--count-low)] bg-[color:color-mix(in_srgb,var(--count-low)_12%,transparent)]" : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--ink-muted)]"}`}
    >
      <span className={checked ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}>{checked ? "On" : "Off"}</span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? "border-[var(--count-low)] bg-[var(--count-low)]" : "border-[var(--rule)] bg-[var(--paper-raised)]"}`}>
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_7px_rgba(0,0,0,.35)] transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
    </button>
  </div>
);
export function TextField({ label, className = "", ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}<input {...props} className={`field min-h-11 w-full min-w-0 rounded-lg px-3 text-[.9rem] text-[var(--ink)] outline-none ${className}`} /></label>;
}
export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "cold" | "warm" | "hot"; className?: string }) {
  const color = tone === "cold" ? "var(--count-cold)" : tone === "warm" ? "var(--count-warm)" : tone === "hot" ? "var(--count-hot)" : "var(--ink-muted)";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`} style={{ borderColor: color, color }}>{children}</span>;
}
export function Tabs<T extends string>({ value, onChange, items, label = "Sections", className = "", panelId }: { value: T; onChange: (value: T) => void; items: ReadonlyArray<{ value: T; label: string }>; label?: string; className?: string; panelId?: string }) {
  const id = useId();
  // Public pages render these controls before their JavaScript arrives. Keep
  // them unfocusable until hydration has attached the keyboard handlers.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  useEffect(() => { if (panelId) document.getElementById(panelId)?.setAttribute("aria-labelledby", `${id}-${value}`); }, [panelId, id, value]);
  return <><p className="mt-3 text-xs text-[var(--ink-muted)] sm:hidden">Swipe tabs to see more sections.</p><div role={panelId ? "tablist" : "group"} aria-label={label} className={`mobile-scroll-rail flex gap-2 overflow-x-auto border-b border-[var(--rule)] pb-2 sm:flex-wrap ${className}`} onKeyDown={(event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.value === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }}>{items.map((item) => <GhostButton key={item.value} selected={value === item.value} disabled={!ready} id={`${id}-${item.value}`} role={panelId ? "tab" : undefined} aria-controls={panelId} aria-selected={panelId ? value === item.value : undefined} aria-pressed={panelId ? undefined : value === item.value} tabIndex={value === item.value ? 0 : -1} onClick={() => onChange(item.value)} className="shrink-0 whitespace-nowrap">{item.label}</GhostButton>)}</div></>;
}
export function StickyBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 border-y border-[var(--rule)] bg-[var(--paper-raised)]/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-lg sm:border ${className}`}>{children}</div>;
}
export function CountRule({ value, min = -5, max = 10, label = "True count" }: { value?: number; min?: number; max?: number; label?: string }) {
  const position = value === undefined ? undefined : `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`;
  return <div className="count-rule" aria-label={value === undefined ? label : `${label}: ${value >= 0 ? "+" : ""}${value}`}><div className="flex justify-between text-[.65rem] font-semibold text-[var(--ink-muted)]"><span>TC {min}</span><span>−3</span><span>0</span><span>+2</span><span>+4</span><span>+6</span><span>+{max}</span></div><div className="relative mt-1 h-3 rounded-sm" style={{ background: "linear-gradient(90deg, var(--count-cold), var(--count-low) 26%, var(--count-flat) 42%, var(--count-warm) 63%, var(--count-hot) 100%)" }}>{value !== undefined && <span aria-hidden="true" className="absolute -top-1 h-5 w-0.5 bg-[var(--ink)]" style={{ left: position }} />}</div>{value !== undefined && <p className="mt-1 text-right text-xs font-semibold text-[var(--ink)]">▲ you: {value >= 0 ? "+" : ""}{value}</p>}</div>;
}
/** A single source of truth for dense desktop tables and readable phone cards. */
export function DataTable<T extends { id: string | number }>({ rows, columns, caption }: { rows: readonly T[]; columns: ReadonlyArray<{ label: string; render: (row: T) => ReactNode; className?: string }>; caption?: string }) {
  return <><div className="grid gap-2.5 md:hidden">{rows.map((row) => <article key={row.id} className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] p-3">{columns.map((column) => <div key={column.label} className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-2 last:border-0"><span className="text-xs font-medium text-[var(--ink-muted)]">{column.label}</span><span className={`text-right text-sm ${column.className ?? ""}`}>{column.render(row)}</span></div>)}</article>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm">{caption && <caption className="sr-only">{caption}</caption>}<thead className="text-[var(--ink-muted)]"><tr>{columns.map((column) => <th key={column.label} className={`p-2 font-medium ${column.className ?? ""}`}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[var(--rule)]">{columns.map((column) => <td key={column.label} className={`p-2 ${column.className ?? ""}`}>{column.render(row)}</td>)}</tr>)}</tbody></table></div></>;
}
/**
 * A collapsible page section: icon, title, one-line summary when closed, content when open.
 * Keeps long dense pages scannable at every viewport width instead of one unbroken scroll.
 *
 * `open` is only ever the initial DOM state: the value never changes between
 * renders, so React leaves the attribute alone afterwards and the reader's own
 * expand/collapse choices survive every recalculation.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Section({
  title,
  summary,
  icon,
  tone = "neutral",
  open = true,
  collapseOnMobile = false,
  id,
  analyticsSection,
  children,
}: {
  title: string;
  summary: string;
  icon: string;
  tone?: "neutral" | "accent";
  open?: boolean;
  /** Starts closed on phones once, without later overriding reader choices. */
  collapseOnMobile?: boolean;
  id?: string;
  /** A stable key for content and disclosure analytics that survives copy changes. */
  analyticsSection?: string;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useIsomorphicLayoutEffect(() => {
    if (collapseOnMobile && window.matchMedia("(max-width: 639px)").matches && details.current) {
      details.current.open = false;
    }
  }, [collapseOnMobile]);
  return (
    <details ref={details} id={id} open={open} className="surface group min-w-0 rounded-2xl border border-overlay/[.07]">
      <summary data-analytics-id={analyticsSection} className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone === "accent" ? "bg-emerald-300/10 text-[var(--accent)]" : "bg-sky-300/10 text-[var(--info)]"}`}
        >
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 data-analytics-section={analyticsSection} className="text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-[var(--ink-muted)]">{summary}</p>
        </div>
        <i
          className="fa-solid fa-chevron-down shrink-0 text-xs text-[var(--ink-muted)] transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-overlay/[.06] p-4 sm:p-5">{children}</div>
    </details>
  );
}
/** One figure in a pinned stat bar. Deliberately terser than the full Metric card, which is too tall to keep on screen while scrolling. */
export function PinnedStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[.7rem] font-medium uppercase tracking-[.08em] text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-semibold leading-tight tracking-[-.025em] text-[var(--ink)] sm:text-lg">
        {value}
      </p>
      <p className="truncate text-[.7rem] font-medium text-[var(--accent)]">{sub}</p>
    </div>
  );
}
export const Metric = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) => (
  <Panel className="group">
    <p className="text-[.72rem] font-medium uppercase tracking-[.08em] text-[var(--ink-muted)]">
      {label}
    </p>
    <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-[-.035em] text-[var(--ink)]">
      {value}
    </p>
    {sub && <p className="mt-2 text-xs font-medium text-[var(--accent)]">{sub}</p>}
  </Panel>
);

export function ButtonLink({ className = "", variant = "primary", ...props }: ComponentProps<typeof Link> & { variant?: "primary" | "quiet" }) {
  return <Link {...props} className={`pressable inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2.5 font-semibold ${variant === "primary" ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)]"} ${className}`} />;
}

/* ------------------------------------------------------------------------ */
/* Shared page kit. Feature pages compose these rather than restyling their  */
/* own headers, tiles, help text, and dialogs, so every tool reads the same. */
/* ------------------------------------------------------------------------ */

/**
 * The top of a tool page: what it is, one sentence on what it is for, and its
 * main actions. Rendered as a plain block (not <header>), so print keeps it.
 */
export function PageHeader({ eyebrow, title, description, actions, children, compact = false }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`${compact ? "mb-4" : "mb-6"} flex flex-wrap items-end justify-between gap-x-6 gap-y-4`}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">{eyebrow}</p>}
        <h1 className={`mt-2 font-display font-semibold ${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>{title}</h1>
        {description && <p data-mobile-compact-description className="mt-3 text-[var(--ink-muted)]">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A card heading with optional supporting text and actions aligned to the right. */
export function PanelHeader({ title, description, actions, level = 2, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3; id?: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading id={id} className={level === 2 ? "text-lg font-semibold" : "text-base font-semibold"}>{title}</Heading>
        {description && <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: string; ariaLabel?: string; disabled?: boolean };
/**
 * One choice among a few options, all visible. Built on native radio inputs,
 * so the browser supplies the keyboard model (Tab reaches the group, arrows
 * choose), re-picking the current option changes nothing, and each choice
 * fires a real `change` event for forms and analytics.
 */
export function SegmentedControl<T extends string>({ label, value, onChange, options, name, size = "default", fullWidth = false, className = "", hideLabel = false, help, analyticsField }: { label: string; value: T | null | undefined; onChange: (value: T) => void; options: ReadonlyArray<SegmentOption<T>>; name?: string; size?: "default" | "compact"; fullWidth?: boolean; className?: string; hideLabel?: boolean; help?: ReactNode; analyticsField?: string }) {
  const generated = useId();
  const groupName = name ?? `segment-${generated}`;
  return (
    <fieldset className={`m-0 grid min-w-0 gap-2 border-0 p-0 ${className}`}>
      <div className={hideLabel ? "sr-only" : "flex items-center gap-1"}>
        <legend className="float-left p-0 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}</legend>
        {help && !hideLabel && <HelpTip label={label}>{help}</HelpTip>}
      </div>
      <div className={`${fullWidth ? "flex w-full" : "inline-flex max-w-full"} clear-both min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-1`}>
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

/** Opens an explanation next to its trigger and keeps it inside the viewport and inside any open dialog. */
function useToggletip() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const [container, setContainer] = useState<Element | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  const id = useId();
  const place = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(288, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchor.left + anchor.width / 2 - width / 2));
    const below = anchor.bottom + 8;
    setPosition({ left, top: below + 140 > window.innerHeight && anchor.top > 160 ? Math.max(12, anchor.top - 8 - (note.current?.offsetHeight ?? 120)) : below });
  }, []);
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    // Inside a modal dialog, render into it so screen readers in modal mode can reach the note.
    setContainer(trigger.current?.closest("[role='dialog']") ?? document.body);
    place();
  }, [open, place]);
  useIsomorphicLayoutEffect(() => { if (open && note.current) place(); }, [open, container, place]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.type === "pointerdown" && (trigger.current?.contains(event.target as Node) || note.current?.contains(event.target as Node))) return;
      setOpen(false);
    };
    // Window capture runs before the dialog's own Escape handler, so Escape closes only the tip.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    addEventListener("scroll", hide, true);
    addEventListener("resize", hide);
    return () => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape, true); removeEventListener("scroll", hide, true); removeEventListener("resize", hide); };
  }, [open]);
  const popover = (label: ReactNode, children: ReactNode) => open && position && container ? createPortal(
    <span ref={note} id={id} role="note" data-modal-companion="" style={{ left: position.left, top: position.top }} className="fixed z-[95] block w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal text-[var(--ink)] shadow-2xl">
      <b className="mb-1 block text-[.8rem]">{label}</b>{children}
    </span>,
    container,
  ) : null;
  return { open, setOpen, trigger, id, popover };
}

/** A small "?" that explains a term in place (a toggletip). */
export function HelpTip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const tip = useToggletip();
  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button ref={tip.trigger} type="button" aria-label={`What is ${label}?`} aria-expanded={tip.open} aria-controls={tip.open ? tip.id : undefined} onClick={() => tip.setOpen((current) => !current)} className="relative grid h-6 w-6 place-items-center rounded-full text-[.72rem] text-[var(--ink-muted)] outline-none after:absolute after:-inset-2.5 after:content-[''] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <i className="fa-regular fa-circle-question" aria-hidden="true" />
      </button>
      {tip.popover(label, children)}
    </span>
  );
}

/** Jargon in running text, dotted-underlined; tapping it opens the definition. */
export function Term({ children, definition, label }: { children: ReactNode; definition: ReactNode; label?: string }) {
  const tip = useToggletip();
  return (
    <>
      <button ref={tip.trigger} type="button" aria-expanded={tip.open} aria-controls={tip.open ? tip.id : undefined} onClick={() => tip.setOpen((current) => !current)} className="cursor-help rounded-sm border-b border-dotted border-current p-0 text-inherit outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        {children}
      </button>
      {tip.popover(label ?? children, definition)}
    </>
  );
}

const TONE_TEXT = { neutral: "text-[var(--ink)]", good: "text-[var(--accent)]", bad: "text-[var(--negative)]", warn: "text-[var(--warning)]" } as const;
export type Tone = keyof typeof TONE_TEXT;
/** One figure with its label, an optional note beneath, and an optional explanation of the term. */
export function StatTile({ label, value, sub, tone = "neutral", help, size = "md", className = "" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; help?: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] ${size === "sm" ? "p-3" : "p-4"} ${className}`}>
      <div className="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">
        <span className="truncate">{label}</span>
        {help && <HelpTip label={label}>{help}</HelpTip>}
      </div>
      <p className={`mt-1 font-data font-semibold leading-tight tracking-[-.02em] ${TONE_TEXT[tone]} ${size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{sub}</p>}
    </div>
  );
}

/**
 * A number with large minus/plus buttons: quicker than typing on a phone, and
 * never out of range. Buttons move by `step` without snapping, so fractional
 * values (half units) survive a nudge; typing accepts any value in range.
 */
export function Stepper({ label, value, onValueChange, min, max, step = 1, prefix, suffix, hideLabel = false, disabled = false, className = "", analyticsField }: { label: string; value: number; onValueChange: (value: number) => void; min?: number; max?: number; step?: number; prefix?: string; suffix?: string; hideLabel?: boolean; disabled?: boolean; className?: string; analyticsField?: string }) {
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(next.toFixed(6))));
  const control = "pressable grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] text-sm text-[var(--ink)] outline-none hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]"}>{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || (min !== undefined && value <= min)} onClick={() => onValueChange(clamp(value - step))} className={control}><i className="fa-solid fa-minus" aria-hidden="true" /></button>
        <NumberField ariaLabel={label} value={value} onValueChange={(next) => onValueChange(next)} min={min} max={max} step={step} inputStep="any" prefix={prefix} suffix={suffix} disabled={disabled} analyticsField={analyticsField} className="flex-1 text-center" />
        <button type="button" aria-label={`Increase ${label}`} disabled={disabled || (max !== undefined && value >= max)} onClick={() => onValueChange(clamp(value + step))} className={control}><i className="fa-solid fa-plus" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

const CALLOUT_STYLE = {
  info: ["border-sky-500/25 bg-sky-400/[.07]", "fa-circle-info", "text-[var(--info)]"],
  good: ["border-emerald-500/25 bg-emerald-400/[.08]", "fa-circle-check", "text-[var(--accent)]"],
  warn: ["border-amber-500/30 bg-amber-400/[.08]", "fa-triangle-exclamation", "text-[var(--warning)]"],
  bad: ["border-red-500/30 bg-red-500/[.07]", "fa-circle-exclamation", "text-[var(--negative)]"],
} as const;
/**
 * A short message set apart from the page: guidance, a result, a warning, or
 * an error. Pass `live` only when the callout is inserted in response to an
 * action and is not already inside another live region.
 */
export function Callout({ tone = "info", title, children, icon, action, onDismiss, className = "", live = false }: { tone?: keyof typeof CALLOUT_STYLE; title?: ReactNode; children?: ReactNode; icon?: string; action?: ReactNode; onDismiss?: () => void; className?: string; live?: boolean }) {
  const [box, defaultIcon, iconColor] = CALLOUT_STYLE[tone];
  return (
    <div role={live ? (tone === "bad" ? "alert" : "status") : undefined} className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${box} ${className}`}>
      <i className={`fa-solid ${icon ?? defaultIcon} mt-1 shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[var(--ink)]">{title}</p>}
        {children && <div className="text-[var(--ink-muted)]">{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>}
    </div>
  );
}

/** What to show before there is anything to show, with the one action that fills it. */
export function EmptyState({ icon, title, description, action, className = "" }: { icon: string; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-dashed border-[var(--rule)] px-6 py-10 text-center ${className}`}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-overlay/[.06] text-[var(--count-cold)]"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
      <p className="mt-4 font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** A keyboard key, for shortcut hints beside actions. */
export function KeyHint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`!ml-0 inline-grid min-w-5 place-items-center rounded border border-[var(--rule)] bg-[var(--paper)] px-1 font-data text-[.68rem] font-semibold leading-5 text-[var(--ink-muted)] ${className}`}>{children}</kbd>;
}

/**
 * Show/hide secondary content inline, without card chrome. A native
 * <details>, so it works before hydration and reports `result_expanded`.
 */
export function Disclosure({ summary, children, defaultOpen = false, analyticsSection, className = "", summaryClassName = "" }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; analyticsSection?: string; className?: string; summaryClassName?: string }) {
  return (
    <details open={defaultOpen || undefined} data-analytics-section={analyticsSection} className={`group min-w-0 ${className}`}>
      <summary className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-[var(--ink)] outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden ${summaryClassName}`}>
        <i className="fa-solid fa-chevron-right text-[.65rem] text-[var(--ink-muted)] transition-transform group-open:rotate-90" aria-hidden="true" />
        {summary}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

/** A labelled bar for progress through a set or a share of a whole. */
export function ProgressMeter({ label, value, max = 1, tone = "good", showValue = false, valueText, className = "" }: { label: string; value: number; max?: number; tone?: Tone | "info"; showValue?: boolean; valueText?: string; className?: string }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fill = tone === "bad" ? "bg-[var(--negative)]" : tone === "warn" ? "bg-[var(--warning)]" : tone === "info" ? "bg-[var(--info)]" : tone === "neutral" ? "bg-[var(--ink-muted)]" : "bg-[var(--accent)]";
  return (
    <div className={`min-w-0 ${className}`}>
      {showValue && <div className="mb-1 flex justify-between gap-3 text-xs text-[var(--ink-muted)]"><span>{label}</span><span className="font-data">{valueText ?? `${Math.round(share * 100)}%`}</span></div>}
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(max, Math.max(0, value))} aria-valuetext={valueText} className="h-2 overflow-hidden rounded-full bg-overlay/[.08]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${fill}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * A focused task over the page: a side panel on wide screens and a bottom
 * sheet on phones. Traps focus (stacking safely with confirmations opened
 * inside it), closes on Escape or the backdrop, and returns focus to whatever
 * opened it. To submit a form from the footer, give the form an id and the
 * footer button `type="submit" form={id}`.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = "md", initialFocusRef }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: "md" | "lg"; initialFocusRef?: RefObject<HTMLElement | null> }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(open, panel, onClose, initialFocusRef);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-stretch sm:justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} className={`relative flex max-h-[calc(100dvh-max(.5rem,env(safe-area-inset-top)))] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] shadow-2xl outline-none sm:max-h-none sm:rounded-none sm:rounded-l-3xl ${width === "lg" ? "sm:max-w-[64rem]" : "sm:max-w-[40rem]"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rule)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-[var(--ink-muted)]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--rule)] text-sm"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-[var(--rule)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------- Toasts and announcements ---------------------------- */

type ToastInput = { message: string; tone?: "good" | "info" | "warn" | "bad"; action?: { label: string; onClick: () => void }; duration?: number };
type ToastItem = ToastInput & { id: number };
let toasts: ToastItem[] = [];
let nextToastId = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((listener) => listener());
const subscribeToasts = (listener: () => void) => { toastListeners.add(listener); return () => { toastListeners.delete(listener); }; };
export function dismissToast(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emitToasts();
}
/**
 * Confirms a completed action wherever the reader is: above sheets and the
 * phone dock. Toasts with an action stay 8s by default, others 4s.
 */
export function toast(input: ToastInput) {
  const id = nextToastId++;
  toasts = [...toasts.slice(-2), { ...input, id }];
  emitToasts();
  setTimeout(() => dismissToast(id), input.duration ?? (input.action ? 8000 : 4000));
  return id;
}
const EMPTY_TOASTS: ToastItem[] = [];
/** Mounted once by the app shell. */
export function ToastViewport() {
  const items = useSyncExternalStore(subscribeToasts, () => toasts, () => EMPTY_TOASTS);
  return (
    <div data-modal-companion="" aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+var(--dock-clearance,0px)+env(safe-area-inset-bottom))] z-[97] flex flex-col items-center gap-2 lg:bottom-6">
      {items.map((item) => (
        <div key={item.id} role="status" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[var(--rule)] bg-[var(--ink)] px-4 py-3 text-sm text-[var(--paper)] shadow-2xl">
          <i className={`fa-solid ${item.tone === "bad" ? "fa-circle-exclamation" : item.tone === "warn" ? "fa-triangle-exclamation" : item.tone === "info" ? "fa-circle-info" : "fa-circle-check"} shrink-0`} aria-hidden="true" />
          <span className="min-w-0 flex-1">{item.message}</span>
          {item.action && <button type="button" onClick={() => { item.action!.onClick(); dismissToast(item.id); }} className="min-h-9 shrink-0 rounded-lg px-2 font-semibold underline underline-offset-2">{item.action.label}</button>}
          <button type="button" onClick={() => dismissToast(item.id)} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg opacity-80 hover:opacity-100"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
      ))}
    </div>
  );
}

let announcement = { text: "", id: 0 };
const announceListeners = new Set<() => void>();
/**
 * Speaks a short message through the page's single polite live region (for
 * drill verdicts, new hands, and results), replacing any pending message so
 * fast play never queues stale announcements.
 */
export function announce(text: string) {
  announcement = { text, id: announcement.id + 1 };
  announceListeners.forEach((listener) => listener());
}
const EMPTY_ANNOUNCEMENT = { text: "", id: 0 };
/** Mounted once by the app shell. */
export function LiveAnnouncer() {
  const current = useSyncExternalStore((listener) => { announceListeners.add(listener); return () => { announceListeners.delete(listener); }; }, () => announcement, () => EMPTY_ANNOUNCEMENT);
  // Alternating between two regions makes a repeated identical message be read again.
  return <div className="sr-only"><p aria-live="polite" aria-atomic="true">{current.id % 2 ? current.text : ""}</p><p aria-live="polite" aria-atomic="true">{current.id % 2 ? "" : current.text}</p></div>;
}
