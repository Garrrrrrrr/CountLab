"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useId, useEffect, useLayoutEffect, useRef, useState } from "react";
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
export const MobileActionDock = ({
  children,
  className = "",
  label = "Available actions",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className={`mobile-action-dock lg:hidden ${className}`}
  >
    {children}
  </div>
);
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
    <details ref={details} id={id} open={open} className="surface group min-w-0 rounded-2xl border border-white/[.07]">
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
      <div className="border-t border-white/[.06] p-4 sm:p-5">{children}</div>
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
