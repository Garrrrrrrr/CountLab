"use client";
import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cx } from "@/components/ui/cx";

/**
 * An on-screen keypad for counts and deck estimates.
 *
 * Phones get this instead of the system keyboard: it never covers the cards,
 * it has a real ± key (iOS's numeric keyboard has no minus), and it keeps the
 * answer button in the same place every question. Physical keyboards work too:
 * digits, `-`, `.`, Backspace and Enter.
 */
export function NumberPad({ value, onChange, onSubmit, allowNegative = true, allowDecimal = false, maxLength = 5, submitLabel = "Enter", disabled = false, className }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  allowNegative?: boolean;
  allowDecimal?: boolean;
  maxLength?: number;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === "sign") return onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    if (key === ".") {
      if (value.includes(".")) return;
      return onChange(`${value === "" || value === "-" ? `${value}0` : value}.`);
    }
    if (value.replace(/[-.]/g, "").length >= maxLength) return;
    onChange(value === "0" ? key : value === "-0" ? `-${key}` : value + key);
  };

  useEffect(() => {
    if (disabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (/^[0-9]$/.test(event.key)) { event.preventDefault(); press(event.key); }
      else if (event.key === "-" && allowNegative) { event.preventDefault(); press("sign"); }
      else if ((event.key === "." || event.key === ",") && allowDecimal) { event.preventDefault(); press("."); }
      else if (event.key === "Backspace") { event.preventDefault(); press("back"); }
      else if (event.key === "Enter") { event.preventDefault(); onSubmit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key = "flex h-[3.25rem] items-center justify-center rounded-xl bg-surface-2 text-xl font-semibold text-ink transition active:scale-[0.97] active:bg-surface-3 disabled:opacity-40 sm:h-14";
  const digits = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  return (
    <div className={cx("grid grid-cols-4 gap-1.5", className)} role="group" aria-label="Number pad">
      <div className="col-span-3 grid grid-cols-3 gap-1.5">
        {digits.map((digit) => (
          <button key={digit} type="button" className={key} disabled={disabled} onClick={() => press(digit)}>{digit}</button>
        ))}
        <button type="button" className={cx(key, "text-lg")} disabled={disabled || !allowNegative} onClick={() => press("sign")} aria-label="Toggle minus sign">±</button>
        <button type="button" className={key} disabled={disabled} onClick={() => press("0")}>0</button>
        <button type="button" className={key} disabled={disabled || !allowDecimal} onClick={() => press(".")} aria-label="Decimal point">.</button>
      </div>
      <div className="grid grid-rows-4 gap-1.5">
        <button type="button" className={key} disabled={disabled} onClick={() => press("back")} aria-label="Delete">
          <Delete size={22} aria-hidden />
        </button>
        <button type="button" disabled={disabled || value === "" || value === "-"} onClick={onSubmit}
          className="row-span-3 flex items-center justify-center rounded-xl bg-brand px-1 text-base font-bold text-brand-ink transition active:scale-[0.98] disabled:opacity-40">
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** The answer as typed, shown large above the pad. */
export function AnswerDisplay({ value, placeholder = "?", label, tone, className }: { value: string; placeholder?: string; label: string; tone?: "pos" | "neg"; className?: string }) {
  const shown = value === "" ? placeholder : value.startsWith("-") ? `−${value.slice(1)}` : value;
  return (
    <div className={cx("flex h-16 items-center justify-center rounded-2xl border-2 bg-surface", tone === "pos" ? "border-pos" : tone === "neg" ? "border-neg" : "border-line-strong", className)}>
      <span className="sr-only">{label}: </span>
      <output aria-live="off" className={cx("tnum font-mono text-4xl font-semibold tracking-tight", value === "" ? "text-ink-3" : "text-ink")}>{shown}</output>
    </div>
  );
}
