"use client";
import { ReactNode, useId } from "react";
import { HelpTip } from "@/components/ui";

/**
 * Every option beyond the session cards, behind one toggle. A real button
 * with aria-expanded controls a labelled region; the content is not rendered
 * while closed, so the setup reads as "pick a session, press Start".
 */
export function Customize({ open, onOpenChange, custom, children, footnote }: { open: boolean; onOpenChange: (open: boolean) => void; custom: boolean; children: ReactNode; footnote?: ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <button
        id={`${id}-toggle`}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-region`}
        onClick={() => onOpenChange(!open)}
        className="pressable flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 text-sm font-semibold text-[var(--ink)] outline-none hover:border-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:w-auto"
      >
        <i className="fa-solid fa-sliders text-xs text-[var(--ink-muted)]" aria-hidden="true" />
        Customize
        {custom && <span className="rounded-full border border-[var(--info)] px-2 py-px text-[.65rem] font-semibold uppercase tracking-[.08em] text-[var(--info)]">Custom</span>}
        <i className={`fa-solid fa-chevron-down ml-auto text-[.65rem] text-[var(--ink-muted)] transition-transform sm:ml-2 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={`${id}-region`} role="region" aria-labelledby={`${id}-toggle`} hidden={!open} className="mt-4">
        {open && (
          <>
            <div className="grid min-w-0 gap-x-5 gap-y-5 sm:grid-cols-2">{children}</div>
            {footnote && <p className="mt-5 border-t border-[var(--rule)] pt-4 text-xs leading-5 text-[var(--ink-muted)]">{footnote}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** A labelled group of related options inside Customize. */
export function OptionGroup({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <fieldset className={`m-0 grid min-w-0 content-start gap-4 border-0 p-0 ${wide ? "sm:col-span-2" : ""}`}>
      <legend className="mb-3 p-0 font-data text-[.68rem] font-semibold uppercase tracking-[.14em] text-[var(--ink-muted)]">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * A native control with a help tip beside its label. The tip sits outside the
 * <label>, so tapping it never also activates the control.
 */
export function WithHelp({ label, help, children }: { label: string; help: ReactNode; children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      {children}
      <span className="absolute -top-1 right-0"><HelpTip label={label}>{help}</HelpTip></span>
    </div>
  );
}
