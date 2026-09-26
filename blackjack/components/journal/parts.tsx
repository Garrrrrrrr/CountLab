"use client";
/**
 * Small presentational pieces the journal's cards, tables and sheets share.
 * Kept here rather than in the shared kit because only this feature grades
 * results against EV this way.
 */
import { ReactNode, useId } from "react";
import type { SessionAssessment } from "@/lib/blackjack/journalAnalysis";
import { HelpTip } from "../ui";

export const ASSESSMENT_LABEL: Record<SessionAssessment, string> = {
  "insufficient-data": "Not enough data",
  "within-expected-range": "Within expected range",
  "better-than-expected": "Better than expected",
  "worse-than-expected": "Worse than expected",
  "outlier-high": "Statistical outlier (high)",
  "outlier-low": "Statistical outlier (low)",
};
const ASSESSMENT_STYLE: Record<SessionAssessment, [icon: string, color: string]> = {
  "insufficient-data": ["fa-circle-question", "text-[var(--ink-muted)]"],
  "within-expected-range": ["fa-circle-check", "text-[var(--ink)]"],
  "better-than-expected": ["fa-arrow-trend-up", "text-[var(--accent)]"],
  "worse-than-expected": ["fa-arrow-trend-down", "text-[var(--warning)]"],
  "outlier-high": ["fa-angles-up", "text-[var(--accent)]"],
  "outlier-low": ["fa-angles-down", "text-[var(--negative)]"],
};

/**
 * How a result compares with expectation, as an icon and words, never colour
 * alone. Set in the UI face even inside tables, which default to monospace.
 */
export function VerdictBadge({ assessment, size = "md" }: { assessment: SessionAssessment; size?: "sm" | "md" }) {
  const [icon, color] = ASSESSMENT_STYLE[assessment];
  return (
    <span className={`inline-flex items-center gap-1.5 font-[family-name:var(--font-ui)] font-semibold ${size === "sm" ? "text-xs" : "text-sm"} ${color}`}>
      <i className={`fa-solid ${icon} text-[.8em]`} aria-hidden="true" />
      {ASSESSMENT_LABEL[assessment]}
    </span>
  );
}

export const toneText = (value: number) => value > 0 ? "text-[var(--accent)]" : value < 0 ? "text-[var(--negative)]" : "text-[var(--ink)]";
export const toneOf = (value: number) => value > 0 ? "good" as const : value < 0 ? "bad" as const : "neutral" as const;

export type KeyValue = { label: string; value: ReactNode; sub?: ReactNode; help?: ReactNode };

/** Dense label-and-value pairs in a definition list; one column on phones. */
export function KeyValueList({ items, title, columns = 2, className = "" }: { items: readonly KeyValue[]; title?: string; columns?: 1 | 2 | 3; className?: string }) {
  const titleId = useId();
  const grid = columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <div className={`min-w-0 ${className}`}>
      {title && <h3 id={titleId} className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-[var(--ink-muted)]">{title}</h3>}
      <dl aria-labelledby={title ? titleId : undefined} className={`grid gap-x-6 gap-y-3 ${grid}`}>
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-b border-[var(--rule)] pb-2">
            <dt className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">{item.label}{item.help && <HelpTip label={item.label.toLowerCase()}>{item.help}</HelpTip>}</dt>
            <dd className="mt-0.5 font-data text-sm font-semibold text-[var(--ink)]">{item.value}</dd>
            {item.sub && <dd className="text-xs text-[var(--ink-muted)]">{item.sub}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Where one outcome fell inside its 95% range: the band, a tick at the
 * expectation, and a marker for the result, pinned to an end with an arrow
 * when it fell outside.
 */
export function RangeBar({ low, high, expected, value, format, label, className = "" }: { low: number; high: number; expected: number; value?: number; format: (value: number) => string; label: string; className?: string }) {
  const span = high - low;
  const position = (point: number) => span > 0 ? Math.max(0, Math.min(100, ((point - low) / span) * 100)) : 50;
  const outside = value === undefined ? null : value < low ? "low" : value > high ? "high" : null;
  return (
    <figure className={`m-0 min-w-0 ${className}`}>
      <div role="img" aria-label={label} className="relative mx-2 h-8">
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full border border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]" />
        <div className="absolute top-1 h-6 w-0.5 -translate-x-1/2 bg-[var(--ink-muted)]" style={{ left: `${position(expected)}%` }} />
        {value !== undefined && (
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${position(value)}%` }}>
            {outside
              ? <i className={`fa-solid ${outside === "low" ? "fa-caret-left" : "fa-caret-right"} text-2xl leading-none text-[var(--ink)]`} />
              : <span className="block h-4 w-4 rounded-full border-2 border-[var(--paper-raised)] bg-[var(--ink)] shadow" />}
          </div>
        )}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between gap-2 font-data text-[.7rem] text-[var(--ink-muted)]">
        <span>{format(low)}</span>
        <span>Expected {format(expected)}</span>
        <span>{format(high)}</span>
      </div>
    </figure>
  );
}

/** A search input with a leading icon and a clear button. */
export function SearchField({ label, value, onChange, placeholder, id, analyticsField }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; id?: string; analyticsField?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="relative min-w-0">
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-muted)]" aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        data-analytics-field={analyticsField}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && value) { event.preventDefault(); onChange(""); } }}
        className="field min-h-11 w-full min-w-0 rounded-lg pl-9 pr-11 text-[.9rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => { onChange(""); document.getElementById(inputId)?.focus(); }} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** A heading for a group of fields inside a sheet. */
export function FieldGroupTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-xs font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)] ${className}`}>{children}</h3>;
}

/** An inline field error, announced when it appears. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} role="alert" className="mt-1.5 text-xs font-medium text-[var(--negative)]"><i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true" />{children}</p>;
}
