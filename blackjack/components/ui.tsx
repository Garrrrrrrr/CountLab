"use client";
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
export const Panel = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={`surface rounded-[1.35rem] p-4 sm:p-5 md:p-6 ${className}`}>
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
    className={`pressable min-h-11 rounded-lg border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 font-semibold text-[var(--paper)] shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 ${variant === "danger" ? "border-red-700 bg-red-700 text-white" : variant === "quiet" ? "border-[var(--rule)] bg-transparent text-[var(--ink)]" : ""} ${size === "compact" ? "min-h-9 px-3 py-1.5 text-sm" : ""} ${className}`}
  />
);
export const GhostButton = ({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`pressable min-h-11 rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-2.5 font-medium text-[var(--ink)] shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)] hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
      {prefix && <span className="pl-3 text-zinc-500">{prefix}</span>}
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
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[.9rem] text-zinc-100 outline-none disabled:opacity-50"
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
      <span className={checked ? "text-[var(--count-low)]" : "text-[var(--ink-muted)]"}>{checked ? "On" : "Off"}</span>
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
export function Tabs<T extends string>({ value, onChange, items, label = "Sections", className = "" }: { value: T; onChange: (value: T) => void; items: ReadonlyArray<{ value: T; label: string }>; label?: string; className?: string }) {
  return <div role="tablist" aria-label={label} className={`mobile-scroll-rail flex gap-2 overflow-x-auto border-b border-[var(--rule)] pb-2 sm:flex-wrap ${className}`}>{items.map((item) => <GhostButton key={item.value} role="tab" aria-selected={value === item.value} onClick={() => onChange(item.value)} className={`shrink-0 whitespace-nowrap ${value === item.value ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : ""}`}>{item.label}</GhostButton>)}</div>;
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
    <details ref={details} id={id} open={open} className="surface group rounded-2xl border border-white/[.07]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone === "accent" ? "bg-emerald-300/10 text-emerald-300" : "bg-sky-300/10 text-sky-300"}`}
        >
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-zinc-500">{summary}</p>
        </div>
        <i
          className="fa-solid fa-chevron-down shrink-0 text-xs text-zinc-500 transition-transform group-open:rotate-180"
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
      <p className="truncate text-[.7rem] font-medium uppercase tracking-[.08em] text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-semibold leading-tight tracking-[-.025em] text-white sm:text-lg">
        {value}
      </p>
      <p className="truncate text-[.7rem] font-medium text-emerald-400">{sub}</p>
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
    <p className="text-[.72rem] font-medium uppercase tracking-[.08em] text-zinc-500">
      {label}
    </p>
    <p className="mt-2 text-[1.65rem] font-semibold leading-none tracking-[-.035em] text-white">
      {value}
    </p>
    {sub && <p className="mt-2 text-xs font-medium text-emerald-400">{sub}</p>}
  </Panel>
);
