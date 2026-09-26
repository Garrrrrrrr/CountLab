"use client";
import { useEffect, useId, useState } from "react";
import { parseAmount, type AmountEntry } from "@/lib/blackjack/journalForm";

const textOf = (value: AmountEntry) => typeof value === "number" ? String(value) : "";

/**
 * A dollar amount that may be blank. It reads "$1,250" as 1250 and reports
 * text that isn't a number as "invalid", keeping it on screen rather than
 * falling back to the last value that parsed ("1" of "1,250"). The parent
 * shows the error message, so it can sit below a row of controls.
 */
export function AmountField({ label, value, onValueChange, onBlur, invalid = false, describedBy, analyticsField }: {
  label: string;
  value: AmountEntry;
  onValueChange: (value: AmountEntry) => void;
  onBlur?: () => void;
  invalid?: boolean;
  /** The id of the error shown for this field. */
  describedBy?: string;
  analyticsField?: string;
}) {
  const [text, setText] = useState(() => textOf(value));
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  // Show changes made elsewhere (a reset, or a minus sign turned into Lost)
  // once the field is left, but keep text that isn't a number so it can be fixed.
  useEffect(() => { if (!focused && value !== "invalid") setText(textOf(value)); }, [value, focused]);
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={inputId} className="text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]">{label}</label>
      <span className={`field flex min-h-11 w-full min-w-0 items-center rounded-xl ${focused ? "field-active" : ""} ${invalid ? "!border-[var(--negative)]" : ""}`}>
        <span aria-hidden="true" className="pl-3 text-[var(--ink-muted)]">$</span>
        <input
          id={inputId}
          inputMode="decimal"
          type="text"
          autoComplete="off"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          data-analytics-field={analyticsField}
          onFocus={() => setFocused(true)}
          onChange={(event) => { setText(event.target.value); onValueChange(parseAmount(event.target.value)); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[.9rem] text-[var(--ink)] outline-none"
        />
      </span>
    </div>
  );
}
