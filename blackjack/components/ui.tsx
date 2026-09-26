"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, useCallback, useId, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/useModalFocus";
export const Panel = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={`surface min-w-0 rounded-[1.35rem] p-4 sm:p-5 md:p-6 ${className}`}>
    {children}
  </section>
);
export const Button = ({
  className = "",
  variant = "primary",
  size = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "quiet"; size?: "default" | "compact" }) => (
  <button
    data-enter-action="true"
    {...props}
    className={`pressable min-h-11 rounded-lg border px-4 py-2.5 font-semibold shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 ${variant === "danger" ? "border-red-700 bg-red-700 text-white" : variant === "quiet" ? "border-[var(--rule)] bg-transparent text-[var(--ink)]" : "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"} ${size === "compact" ? "min-h-9 px-3 py-1.5 text-sm" : ""} ${className}`}
  />
);
export const GhostButton = ({
  className = "",
  selected = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) => (
  <button
    {...props}
    className={`pressable min-h-11 rounded-lg border px-4 py-2.5 font-medium shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:opacity-90" : "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] hover:bg-[var(--paper)]"} ${className}`}
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
  ariaLabel,
  className = "",
  disabled = false,
}: {
  label?: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
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
        step={step}
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
    </div>
  );
  return label ? (
    <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">
      {label}
      {field}
    </label>
  ) : (
    field
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
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone === "accent" ? "bg-emerald-300/10 text-[var(--accent)]" : "bg-sky-300/10 text-[var(--info)]"}`}
        >
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
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

/** The top of a tool page: what it is, one sentence on what it is for, and its main actions. */
export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 text-[var(--ink-muted)]">{description}</p>}
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
 * A single choice among a few options, shown all at once (the WAI-ARIA radio
 * group pattern): arrow keys move and select, Tab leaves the group.
 */
export function SegmentedControl<T extends string>({ label, value, onChange, options, size = "default", fullWidth = false, className = "", hideLabel = false }: { label: string; value: T; onChange: (value: T) => void; options: ReadonlyArray<SegmentOption<T>>; size?: "default" | "compact"; fullWidth?: boolean; className?: string; hideLabel?: boolean }) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const move = (event: ReactKeyboardEvent, index: number) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let target: number | undefined;
    if (event.key in keys) {
      const position = enabled.indexOf(index);
      target = enabled[(position + keys[event.key] + enabled.length) % enabled.length];
    } else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled.at(-1);
    if (target === undefined) return;
    event.preventDefault();
    onChange(options[target].value);
    refs.current[target]?.focus();
  };
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <span id={labelId} className={hideLabel ? "sr-only" : "text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]"}>{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className={`${fullWidth ? "flex w-full" : "inline-flex max-w-full"} min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-1`}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => { refs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.ariaLabel}
              disabled={option.disabled}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => move(event, index)}
              className={`pressable inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 ${fullWidth ? "flex-1" : ""} ${size === "compact" ? "min-h-9 text-xs" : "min-h-10 text-sm"} ${selected ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)]"}`}
            >
              {option.icon && <i className={`fa-solid ${option.icon} text-xs`} aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A small "?" that explains a term in place (a toggletip). The note is placed
 * in the viewport with fixed coordinates so it is never clipped by a card.
 */
export function HelpTip({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const button = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  const id = useId();
  const place = useCallback(() => {
    const anchor = button.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(288, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchor.left + anchor.width / 2 - width / 2));
    setPosition({ left, top: anchor.bottom + 8 });
  }, []);
  useIsomorphicLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (button.current?.contains(event.target as Node) || note.current?.contains(event.target as Node))) return;
      setOpen(false);
      if (event instanceof KeyboardEvent) button.current?.focus();
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    addEventListener("scroll", hide, true);
    addEventListener("resize", hide);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); removeEventListener("scroll", hide, true); removeEventListener("resize", hide); };
  }, [open]);
  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button ref={button} type="button" aria-label={`What is ${label}?`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((current) => !current)} className="grid h-6 w-6 place-items-center rounded-full text-[.72rem] text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <i className="fa-regular fa-circle-question" aria-hidden="true" />
      </button>
      {open && position && typeof document !== "undefined" && createPortal(
        <span ref={note} id={id} role="note" style={{ left: position.left, top: position.top }} className="fixed z-[95] block w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-3 text-left text-xs font-normal normal-case leading-5 tracking-normal text-[var(--ink)] shadow-2xl">
          <b className="mb-1 block text-[.8rem]">{label}</b>{children}
        </span>,
        document.body,
      )}
    </span>
  );
}

const TONE_TEXT = { neutral: "text-[var(--ink)]", good: "text-[var(--accent)]", bad: "text-[var(--negative)]", warn: "text-[var(--warning)]" } as const;
export type Tone = keyof typeof TONE_TEXT;
/** One figure with its label, an optional note beneath, and an optional explanation of the term. */
export function StatTile({ label, value, sub, tone = "neutral", help, size = "md", className = "" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; help?: ReactNode; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] ${size === "sm" ? "p-3" : "p-4"} ${className}`}>
      <p className="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">
        <span className="truncate">{label}</span>
        {help && <HelpTip label={label}>{help}</HelpTip>}
      </p>
      <p className={`mt-1 font-data font-semibold leading-tight tracking-[-.02em] ${TONE_TEXT[tone]} ${size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{sub}</p>}
    </div>
  );
}

/** A number with large minus/plus buttons: quicker than typing on a phone, and never out of range. */
export function Stepper({ label, value, onValueChange, min, max, step = 1, prefix, suffix, hideLabel = false, disabled = false, className = "" }: { label: string; value: number; onValueChange: (value: number) => void; min?: number; max?: number; step?: number; prefix?: string; suffix?: string; hideLabel?: boolean; disabled?: boolean; className?: string }) {
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(next / step) * step));
  const nudge = (direction: 1 | -1) => onValueChange(clamp(Number((value + direction * step).toFixed(6))));
  const control = "pressable grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] text-sm text-[var(--ink)] outline-none hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <span className={hideLabel ? "sr-only" : "text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]"}>{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || (min !== undefined && value <= min)} onClick={() => nudge(-1)} className={control}><i className="fa-solid fa-minus" aria-hidden="true" /></button>
        <NumberField ariaLabel={label} value={value} onValueChange={(next) => onValueChange(next)} min={min} max={max} step={step} prefix={prefix} disabled={disabled} className="flex-1 text-center" />
        {suffix && <span className="shrink-0 text-sm text-[var(--ink-muted)]">{suffix}</span>}
        <button type="button" aria-label={`Increase ${label}`} disabled={disabled || (max !== undefined && value >= max)} onClick={() => nudge(1)} className={control}><i className="fa-solid fa-plus" aria-hidden="true" /></button>
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
/** A short message set apart from the page: guidance, a result, a warning, or an error. */
export function Callout({ tone = "info", title, children, icon, className = "", live = false }: { tone?: keyof typeof CALLOUT_STYLE; title?: ReactNode; children?: ReactNode; icon?: string; className?: string; live?: boolean }) {
  const [box, defaultIcon, iconColor] = CALLOUT_STYLE[tone];
  return (
    <div role={live ? (tone === "bad" ? "alert" : "status") : undefined} className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${box} ${className}`}>
      <i className={`fa-solid ${icon ?? defaultIcon} mt-1 shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-[var(--ink)]">{title}</p>}
        {children && <div className="text-[var(--ink-muted)]">{children}</div>}
      </div>
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
 * A focused task over the page: a side panel on wide screens and a bottom
 * sheet on phones. Traps focus, closes on Escape or the backdrop, and
 * returns focus to whatever opened it.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; width?: "md" | "lg" }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(open, panel, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-stretch sm:justify-end" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] shadow-2xl outline-none sm:max-h-none sm:rounded-none sm:rounded-l-3xl ${width === "lg" ? "sm:max-w-2xl" : "sm:max-w-xl"}`}>
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
