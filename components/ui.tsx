"use client";
import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from "react";
export const Panel = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={`surface rounded-[1.35rem] p-5 md:p-6 ${className}`}>
    {children}
  </section>
);
export const Button = ({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`pressable rounded-xl bg-[#a8ee72] px-4 py-2.5 font-semibold text-[#10200f] shadow-[0_8px_24px_rgba(95,210,105,.16)] hover:bg-[#b8f584] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  />
);
export const GhostButton = ({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`pressable rounded-xl border border-white/[.09] bg-white/[.055] px-4 py-2.5 font-medium text-zinc-100 shadow-sm backdrop-blur-xl hover:bg-white/[.1] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  />
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
  <label className="grid gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
    {label}
    <select
      {...props}
      className={`field min-h-11 rounded-xl px-3 text-[.9rem] text-zinc-100 outline-none ${className}`}
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
      className={`field flex min-h-11 items-center rounded-xl ${focused ? "field-active" : ""} ${className}`}
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
    <label className="grid gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
      {label}
      {field}
    </label>
  ) : (
    field
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
