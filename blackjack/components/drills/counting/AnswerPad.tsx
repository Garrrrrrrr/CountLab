"use client";
import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { announce, Button, KeyHint } from "@/components/ui";
import { applyKey, parseAnswer, type AnswerKind } from "@/lib/blackjack/numericAnswer";
import { useKeypad } from "./hooks";

export type AnswerField = {
  id: string;
  label: string;
  /** The accessible name, when it differs from the visible label. */
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  kind: AnswerKind;
  unit?: string;
  help?: ReactNode;
};

const KEY_CLASS = "pressable grid min-h-11 place-items-center sm:min-h-12 rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] font-data text-xl font-semibold text-[var(--ink)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-35";

/**
 * The one answer entry for the counting drills: large fields, validated
 * before grading, and on touch screens an on-screen keypad in place of the
 * system keyboard. The keypad keeps the same layout for every field; keys
 * that do not apply to the active field are disabled rather than moved.
 *
 * With several fields, Enter (or the submit key) on a field whose next field
 * is still empty moves on to it; otherwise it submits. Remount the pad (key it
 * by question) so each question starts on its first field.
 *
 * On phones the pad is compact (44px keys) so the evidence, the fields and the
 * submit key fit on one screen; the submit key is the step's
 * `[data-reveal-bottom]` for useRevealStep. `aside` sits beside the fields
 * (Deck Estimation puts the tray photo there on phones).
 */
export function AnswerPad({ fields, submitLabel, onSubmit, secondary, aside }: {
  fields: readonly AnswerField[];
  submitLabel: string;
  onSubmit: (values: number[], texts: string[]) => void;
  /** Quiet actions under the pad, such as "I lost the count". */
  secondary?: ReactNode;
  aside?: ReactNode;
}) {
  const { keypad, coarse } = useKeypad();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const baseId = useId();
  const kinds = new Set(fields.map((field) => field.kind));

  const focusField = (index: number) => {
    setActive(index);
    inputs.current[index]?.focus({ preventScroll: keypad });
  };
  // A frame after mount, so this runs after DrillFrame's phase-change focus
  // (which would otherwise leave focus on the stage instead of the field).
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusField(Math.max(0, fields.findIndex((field) => field.value.trim() === ""))));
    return () => cancelAnimationFrame(frame);
    // Only when the pad appears; it is remounted for each question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showError = (index: number, message: string) => {
    setErrors((current) => ({ ...current, [fields[index].id]: message }));
    announce(`${fields[index].label}: ${message}`);
    focusField(index);
  };
  const clearError = (id: string) => setErrors((current) => {
    if (!(id in current)) return current;
    const next = { ...current };
    delete next[id];
    return next;
  });

  const movesOn = (from: number) => from < fields.length - 1 && fields[from + 1].value.trim() === "";
  const advanceOrSubmit = (from: number) => {
    if (movesOn(from)) {
      const result = parseAnswer(fields[from].value, fields[from].kind);
      if (!result.ok) return showError(from, result.error);
      clearError(fields[from].id);
      return focusField(from + 1);
    }
    const results = fields.map((field) => parseAnswer(field.value, field.kind));
    const invalid = results.findIndex((result) => !result.ok);
    if (invalid >= 0) {
      setErrors(Object.fromEntries(fields.flatMap((field, index) => {
        const result = results[index];
        return result.ok ? [] : [[field.id, result.error]];
      })));
      const first = results[invalid];
      if (!first.ok) showError(invalid, first.error);
      return;
    }
    onSubmit(results.map((result) => (result.ok ? result.value : NaN)), results.map((result) => (result.ok ? result.text : "")));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    advanceOrSubmit(active);
  };
  const press = (key: string) => {
    const field = fields[active];
    field.onChange(applyKey(field.value, key, field.kind));
    clearError(field.id);
  };
  const actionLabel = movesOn(active) ? "Next" : submitLabel;
  const activeKind = fields[active]?.kind;
  // Keypad keys keep focus in the field, so the field stays the one being typed into.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  return (
    <form onSubmit={submit} noValidate className={`mx-auto w-full max-w-md ${aside ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3" : ""}`}>
      {aside}
      <div className={`grid gap-4 ${fields.length > 1 ? "grid-cols-2" : ""}`}>
        {fields.map((field, index) => {
          const helpId = `${baseId}-${field.id}-help`;
          const errorId = `${baseId}-${field.id}-error`;
          const error = errors[field.id];
          return (
            <div key={field.id} className="min-w-0">
              <label htmlFor={`${baseId}-${field.id}`} className="block text-center text-sm font-medium text-[var(--ink-muted)]">{field.label}</label>
              <div className={`field mt-1.5 flex min-w-0 items-center rounded-2xl ${active === index ? "field-active" : ""} ${error ? "!border-[var(--negative)]" : ""}`}>
                <input
                  ref={(element) => { inputs.current[index] = element; }}
                  id={`${baseId}-${field.id}`}
                  data-answer-field=""
                  aria-label={field.ariaLabel}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={[error ? errorId : null, field.help ? helpId : null].filter(Boolean).join(" ") || undefined}
                  inputMode={coarse ? "none" : field.kind === "decimal" ? "decimal" : "numeric"}
                  enterKeyHint={movesOn(index) ? "next" : "done"}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={field.value}
                  onFocus={() => setActive(index)}
                  onChange={(event) => { field.onChange(event.target.value); clearError(field.id); }}
                  className="h-14 w-full min-w-0 bg-transparent px-3 sm:h-16 text-center font-data text-3xl font-semibold text-[var(--ink)] outline-none"
                />
                {field.unit && <span aria-hidden="true" className="shrink-0 pr-3 text-sm text-[var(--ink-muted)]">{field.unit}</span>}
              </div>
              {error && <p id={errorId} className="mt-1.5 text-center text-xs font-medium leading-5 text-[var(--negative)]"><i className="fa-solid fa-circle-exclamation mr-1" aria-hidden="true" />{error}</p>}
              {field.help && <p id={helpId} className="mt-1 text-center text-xs leading-5 text-[var(--ink-muted)]">{field.help}</p>}
            </div>
          );
        })}
      </div>
      {keypad ? (
        <div className={`mt-3 grid grid-cols-4 gap-1.5 sm:mt-4 sm:gap-2 ${aside ? "col-span-2" : ""}`} role="group" aria-label="Number pad">
          {["1", "2", "3", "back", "4", "5", "6", "sign", "7", "8", "9", "."].map((key) => {
            if (key === "back") return <button key={key} type="button" onMouseDown={keepFocus} onClick={() => press("back")} aria-label="Delete last digit" className={KEY_CLASS}><i className="fa-solid fa-delete-left text-base" aria-hidden="true" /></button>;
            if (key === "sign") return kinds.has("signed-int") ? <button key={key} type="button" onMouseDown={keepFocus} onClick={() => press("sign")} disabled={activeKind !== "signed-int"} aria-label="Plus or minus" className={KEY_CLASS}>±</button> : <span key={key} aria-hidden="true" />;
            if (key === ".") return kinds.has("decimal") ? <button key={key} type="button" onMouseDown={keepFocus} onClick={() => press(".")} disabled={activeKind !== "decimal"} aria-label="Decimal point" className={KEY_CLASS}>.</button> : <span key={key} aria-hidden="true" />;
            return <button key={key} type="button" onMouseDown={keepFocus} onClick={() => press(key)} className={KEY_CLASS}>{key}</button>;
          })}
          <button type="button" onMouseDown={keepFocus} onClick={() => press("0")} className={KEY_CLASS}>0</button>
          <Button type="submit" data-reveal-bottom="" onMouseDown={keepFocus} className="col-span-3 min-h-11 text-base sm:min-h-12">{actionLabel}</Button>
        </div>
      ) : (
        <div className={`mt-5 flex flex-wrap items-center justify-center gap-3 ${aside ? "col-span-2" : ""}`}>
          <Button type="submit" data-reveal-bottom="" className="min-w-44">{actionLabel}</Button>
          <span className="hidden items-center gap-1.5 text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:flex"><KeyHint>Enter</KeyHint> to {actionLabel === "Next" ? "move on" : "check"}</span>
        </div>
      )}
      {secondary && <div className={`mt-3 flex flex-wrap justify-center gap-2 ${aside ? "col-span-2" : ""}`}>{secondary}</div>}
    </form>
  );
}
