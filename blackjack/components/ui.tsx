"use client";
import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from "react";
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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    data-enter-action="true"
    {...props}
    className={`pressable min-h-11 rounded-xl bg-[#a8ee72] px-4 py-2.5 font-semibold text-[#10200f] shadow-[0_8px_24px_rgba(95,210,105,.16)] hover:bg-[#b8f584] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  />
);
export const GhostButton = ({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`pressable min-h-11 rounded-xl border border-white/[.09] bg-white/[.055] px-4 py-2.5 font-medium text-zinc-100 shadow-sm backdrop-blur-xl hover:bg-white/[.1] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
  <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
    {label}
    <select
      {...props}
      className={`field min-h-11 w-full min-w-0 rounded-xl px-3 text-[.9rem] text-zinc-100 outline-none ${className}`}
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
    <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
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
  <div className={`grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400 ${className}`}>
    <span className="truncate">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`pressable flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#a8ee72]/40 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "border-[#a8ee72]/25 bg-[#a8ee72]/[.07]" : "border-white/[.09] bg-black/30 hover:border-white/[.14] hover:bg-black/40"}`}
    >
      <span className={checked ? "text-[#a8ee72]" : "text-zinc-500"}>{checked ? "On" : "Off"}</span>
      <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? "border-[#a8ee72]/60 bg-[#a8ee72]" : "border-white/[.09] bg-white/[.1]"}`}>
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_7px_rgba(0,0,0,.35)] transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
    </button>
  </div>
);
/**
 * A collapsible page section: icon, title, one-line summary when closed, content when open.
 * Keeps long dense pages scannable at every viewport width instead of one unbroken scroll.
 *
 * `open` is only ever the initial DOM state: the value never changes between
 * renders, so React leaves the attribute alone afterwards and the reader's own
 * expand/collapse choices survive every recalculation.
 */
export function Section({
  title,
  summary,
  icon,
  tone = "neutral",
  open = true,
  children,
}: {
  title: string;
  summary: string;
  icon: string;
  tone?: "neutral" | "accent";
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="surface group rounded-2xl border border-white/[.07]">
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
      <p className="truncate text-[.6rem] font-medium uppercase tracking-[.08em] text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-semibold leading-tight tracking-[-.025em] text-white sm:text-lg">
        {value}
      </p>
      <p className="truncate text-[.65rem] font-medium text-emerald-400">{sub}</p>
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
