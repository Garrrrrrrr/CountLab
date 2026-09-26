"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { useHydrated } from "@/lib/useMediaQuery";

/**
 * The top of a chart page. On phones it keeps to the title, one line of
 * guidance (or none, where the first table needs the room) and the actions,
 * so the first table starts on the first screen; the full description and the
 * eyebrow come back from the small breakpoint, and on wide screens the actions
 * sit beside the title. `printLine` appears only on paper, under the title.
 */
export function ChartHeader({ title, description, shortDescription, actions, printLine }: { title: string; description: ReactNode; shortDescription?: ReactNode; actions: ReactNode; printLine?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-4 print:mb-2 print:block">
      <div className="min-w-0">
        <p className="hidden font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)] sm:block print:hidden">Reference</p>
        <h1 className="font-display text-3xl font-semibold sm:mt-2 sm:text-4xl print:mt-0 print:text-2xl">{title}</h1>
        {printLine && <p className="mt-1 hidden text-[10px] text-[var(--ink)] print:block">{printLine}</p>}
      </div>
      <p data-mobile-compact-description className={`-mt-1.5 w-full max-w-4xl text-[var(--ink-muted)] sm:order-last sm:mt-0 print:hidden ${shortDescription ? "" : "max-sm:hidden"}`}>
        {shortDescription && <span className="sm:hidden">{shortDescription}</span>}
        <span className="hidden sm:inline">{description}</span>
      </p>
      <div className="no-print flex min-w-0 items-center gap-2 max-sm:w-full sm:flex-wrap">{actions}</div>
    </div>
  );
}

/** Prints the page as a one-page card; an icon alone on phones. */
export function PrintButton() {
  const hydrated = useHydrated();
  return (
    <Button
      variant="quiet"
      enterAction={false}
      disabled={!hydrated}
      aria-label="Print or save chart as PDF"
      title="Print or save chart as PDF"
      onClick={() => window.print()}
      className="inline-flex w-11 shrink-0 items-center justify-center gap-2 px-0 sm:w-auto sm:px-4"
    >
      <i className="fa-solid fa-print" aria-hidden="true" />
      <span className="hidden sm:inline">Print</span>
    </Button>
  );
}

/**
 * One table's card: its heading (with the analytics key the old sub-tabs
 * used), a one-line description, the grid, and its footnotes. The id is the
 * section anchor the phone rail links to.
 */
export function ChartPanel({ id, label, description, analyticsSection, footnotes, className = "", children }: { id: string; label: string; description?: string; analyticsSection: string; footnotes?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`ref-panel ref-anchor surface min-w-0 rounded-2xl px-1.5 py-2.5 max-[359px]:px-[3px] sm:px-3 md:px-4 md:py-3 print:rounded-lg print:px-1 print:py-1 print:shadow-none ${className}`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 id={`${id}-heading`} data-analytics-section={analyticsSection} className="font-display text-lg font-semibold print:text-xs">{label}</h2>
        {description && <p className="text-xs text-[var(--ink-muted)] print:hidden">{description}</p>}
      </div>
      {children}
      {footnotes && <div className="mt-2 space-y-1 px-1 text-xs leading-5 text-[var(--ink-muted)] print:mt-0.5 print:text-[8px] print:leading-3">{footnotes}</div>}
    </section>
  );
}

/** The page's address on paper, where the footer and navigation are gone. */
export function PrintFooter({ path }: { path: string }) {
  return <p className="mt-3 hidden text-[9px] text-[var(--ink-muted)] print:block">countlab.ca{path} &middot; CountLab blackjack training</p>;
}
