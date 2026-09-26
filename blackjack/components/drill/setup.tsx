"use client";
import { KeyboardEvent, ReactNode, useId } from "react";
import { Button, KeyHint, MobileActionDock, PanelHeader } from "../ui";

/**
 * The drill's setup: a few choices and one Start. Start is the page's only
 * Enter action; it sits in the card on wide screens and in the thumb dock on
 * phones, so it is always on screen. Pressing Enter on a chosen option also
 * starts, since Enter on a focused radio would otherwise do nothing.
 */
export function SetupCard({ title = "Set up your session", description, notice, children, startLabel, onStart, startDisabled = false, secondaryAction, footnote }: { title?: string; description?: ReactNode; notice?: ReactNode; children: ReactNode; startLabel: string; onStart: () => void; startDisabled?: boolean; secondaryAction?: ReactNode; footnote?: ReactNode }) {
  const startFromOption = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || startDisabled) return;
    if (!(event.target as Element).matches("input[type='radio'], [role='radio']")) return;
    event.preventDefault();
    onStart();
  };
  return (
    <section onKeyDown={startFromOption} aria-label={title} className="surface min-w-0 rounded-[1.35rem] p-4 sm:p-6">
      <PanelHeader title={title} description={description} />
      {notice && <div className="mb-5">{notice}</div>}
      <div className="grid min-w-0 gap-5">{children}</div>
      <div className="mt-6 hidden flex-wrap items-center gap-3 lg:flex">
        <Button onClick={onStart} disabled={startDisabled} className="min-w-40">{startLabel}</Button>
        <span className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]"><KeyHint>Enter</KeyHint> to start</span>
        {secondaryAction && <div className="ml-auto flex flex-wrap gap-2">{secondaryAction}</div>}
      </div>
      {secondaryAction && <div className="mt-5 flex flex-wrap gap-2 lg:hidden">{secondaryAction}</div>}
      {footnote && <p className="mt-5 text-xs leading-5 text-[var(--ink-muted)]">{footnote}</p>}
      <MobileActionDock label="Start">
        <Button onClick={onStart} disabled={startDisabled} className="w-full">{startLabel}</Button>
      </MobileActionDock>
    </section>
  );
}

export type ChoiceOption<T extends string> = { value: T; title: string; description?: ReactNode; meta?: ReactNode; badge?: string; icon?: string; disabled?: boolean };
/**
 * A choice among a few options that each need a line of explanation (presets,
 * scopes, modes). Native radios in a fieldset: Tab reaches the group, arrows
 * choose, and `value` may be null when none applies (e.g. custom settings).
 */
export function ChoiceCards<T extends string>({ legend, value, onChange, options, columns = 2, hideLegend = false, name }: { legend: string; value: T | null; onChange: (value: T) => void; options: ReadonlyArray<ChoiceOption<T>>; columns?: 1 | 2 | 3; hideLegend?: boolean; name?: string }) {
  const generated = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={hideLegend ? "sr-only" : "mb-2 p-0 text-[.8rem] font-medium tracking-[.01em] text-[var(--ink-muted)]"}>{legend}</legend>
      <div className={`grid min-w-0 gap-2 ${columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label key={option.value} className={`pressable relative flex min-h-11 min-w-0 cursor-pointer gap-3 rounded-xl border p-3 text-left has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 ${selected ? "border-[var(--ink)] bg-overlay/[.05] shadow-[inset_0_0_0_1px_var(--ink)]" : "border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--ink-muted)]"}`}>
              <input type="radio" name={name ?? `choice-${generated}`} value={option.value} checked={selected} disabled={option.disabled} onChange={() => { if (!selected) onChange(option.value); }} className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-xl opacity-0 disabled:cursor-not-allowed" />
              {option.icon && <span aria-hidden="true" className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-overlay/[.06] text-[var(--count-cold)]"}`}><i className={`fa-solid ${option.icon} text-xs`} /></span>}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--ink)]">{option.title}</span>
                  {option.badge && <span className="rounded-full bg-emerald-400/15 px-2 py-px text-[.65rem] font-semibold uppercase tracking-[.08em] text-[var(--accent)]">{option.badge}</span>}
                </span>
                {option.description && <span className="mt-0.5 block text-xs leading-5 text-[var(--ink-muted)]">{option.description}</span>}
                {option.meta && <span className="mt-1 block font-data text-[.7rem] text-[var(--ink-muted)]">{option.meta}</span>}
              </span>
              {selected && <i className="fa-solid fa-circle-check mt-1 shrink-0 text-[var(--ink)]" aria-hidden="true" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The keyboard shortcuts for a drill, listed the same way everywhere. */
export function KeyLegend({ items, label = "Keyboard shortcuts" }: { items: ReadonlyArray<{ keys: readonly string[]; label: ReactNode }>; label?: string }) {
  return (
    <div className="hidden text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:block">
      <p className="mb-1.5 font-semibold text-[var(--ink)]">{label}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item, index) => <li key={index} className="flex items-center gap-1.5">{item.keys.map((key) => <KeyHint key={key}>{key}</KeyHint>)}<span>{item.label}</span></li>)}
      </ul>
    </div>
  );
}
