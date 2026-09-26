"use client";
import { Fragment, KeyboardEvent, memo, ReactNode, useCallback, useState } from "react";
import { Panel } from "@/components/ui";
import { CHART_DEALERS, cellKey, formatToken, type ChartSection as Section } from "@/lib/blackjack/bjaH17Chart";
import { displayBuffer, parseEntry, tokensEqual } from "@/lib/blackjack/chartEntry";
import { cellStatus } from "@/lib/blackjack/chartDrill";
import { railState, type RailState } from "@/lib/blackjack/railScroll";

export type CellMode = "live" | "end" | "graded";

export interface SectionProps {
  section: Section;
  /** This section's entries only, so typing in another section does not re-render this one. */
  values: Readonly<Record<string, string>>;
  /** Navigation index per cell key; cells outside the chart's scope are absent (shown filled in, read-only). */
  indexOf: ReadonlyMap<string, number>;
  selectedKey?: string;
  mode: CellMode;
  keypad: boolean;
  /** Show only these rows (the graded chart's "only rows with mistakes"). */
  rows?: readonly string[];
  filled: number;
  total: number;
  header?: ReactNode;
  /** What the selected cell means, shown in a row right under that cell's row (the graded chart). */
  reading?: ReactNode;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
  onSelect: (index: number, key: string) => void;
  register: (index: number, element: HTMLInputElement | null) => void;
}

const BASE = "h-11 w-11 min-w-11 rounded-md border text-center font-data text-sm outline-none transition-colors";
const READING_ID = "h17-cell-reading";

/**
 * One table of the H17 chart as a grid of one-key cells, laid out like the
 * printed chart: a sticky hand column and a horizontal rail on narrow
 * screens. Cell state shows as colour, a dashed edge, strike-through and the
 * chart's answer in words for screen readers, never by colour alone.
 */
export const ChartSection = memo(function ChartSection({ section, values, indexOf, selectedKey, mode, keypad, rows, filled, total, header, reading, onKeyDown, onSelect, register }: SectionProps) {
  const [rail, setRail] = useState<RailState>();
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const firstCell = node.querySelector("tbody td");
    const next = railState({ scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, columnWidth: firstCell ? firstCell.getBoundingClientRect().width : 0 });
    setRail((current) => current && current.scrollable === next.scrollable && current.atStart === next.atStart && current.atEnd === next.atEnd && current.hiddenRight === next.hiddenRight ? current : next);
  }, []);
  const shownRows = rows ?? section.rows;
  return (
    <Panel aria-labelledby={`h17-${section.id}-title`} className="scroll-mt-40">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`h17-${section.id}-title`} className="text-lg font-semibold">{section.label}</h2>
        <p className="font-data text-xs text-[var(--ink-muted)]">{filled} of {total} filled</p>
      </div>
      {header}
      <div className="relative">
        {/* A size container, so the reading row can be as wide as the visible rail rather than the whole table. */}
        <div ref={measure} onScroll={(event) => measure(event.currentTarget)} data-testid={`h17-rail-${section.id}`} className="-mx-1 snap-x snap-mandatory overflow-x-auto scroll-pl-11 px-1 [container-type:inline-size]">
          <table className="w-full min-w-[35.5rem] table-fixed border-separate border-spacing-1 text-center text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left text-xs font-semibold uppercase tracking-[.14em] text-[var(--ink-muted)] shadow-[6px_0_6px_-6px_rgb(var(--shadow-color)/.35)]">Hand</th>
                {CHART_DEALERS.map((dealer) => <th key={dealer} scope="col" className="px-1 pb-1 text-xs font-semibold text-[var(--ink-muted)]">{dealer}</th>)}
              </tr>
            </thead>
            <tbody>
              {shownRows.map((row) => (
                <Fragment key={row}>
                  <tr>
                    <th data-testid={`h17-hand-${section.id}-${row}`} scope="row" className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left font-medium text-[var(--ink)] shadow-[6px_0_6px_-6px_rgb(var(--shadow-color)/.35)]">{row}</th>
                    {CHART_DEALERS.map((dealer) => {
                      const key = cellKey(section.id, row, dealer);
                      const index = indexOf.get(key);
                      const expected = section.cells.get(key)!;
                      const printed = formatToken(expected);
                      const label = `${section.label} ${row} versus ${dealer}`;
                      if (index === undefined) {
                        return (
                          <td key={dealer} className="snap-start scroll-ml-12 align-top">
                            <input value={printed} readOnly tabIndex={-1} aria-label={`${label}, filled in: ${printed}`} className={`${BASE} border-transparent bg-overlay/[.05] text-[var(--ink-muted)]`} />
                          </td>
                        );
                      }
                      const buffer = values[key] ?? "";
                      const parsed = parseEntry(section.id, buffer);
                      const settled = mode === "graded" || (mode === "live" && parsed !== null);
                      const correct = settled && tokensEqual(parsed, expected);
                      const selected = key === selectedKey;
                      const partial = buffer !== "" && parsed === null;
                      const tone = settled
                        ? correct
                          ? "border-emerald-600/60 bg-emerald-500/[.14] text-[var(--ink)]"
                          : buffer === ""
                            ? "border-dashed border-[var(--negative)] bg-[var(--paper)] text-[var(--ink)]"
                            : "border-[var(--negative)] bg-red-500/[.1] text-[var(--ink)] line-through decoration-[var(--negative)] decoration-2"
                        : partial
                          ? "border-dashed border-[var(--ink-muted)] bg-[var(--paper)] text-[var(--ink-muted)]"
                          : "border-[var(--rule)] bg-[var(--paper)] text-[var(--ink)]";
                      const statusId = `h17-status-${key}`;
                      const described = [settled && statusId, selected && reading && READING_ID].filter(Boolean).join(" ");
                      return (
                        <td key={dealer} className="snap-start scroll-ml-12 align-top [scroll-margin-bottom:calc(var(--dock-clearance,0px)+4.75rem+env(safe-area-inset-bottom))] [scroll-margin-top:5rem] sm:[scroll-margin-top:9.5rem] lg:[scroll-margin-bottom:1rem]">
                          <input
                            ref={(element) => register(index, element)}
                            value={displayBuffer(section.id, buffer)}
                            onChange={() => undefined}
                            onKeyDown={(event) => onKeyDown(event, index)}
                            onFocus={() => onSelect(index, key)}
                            readOnly={mode === "graded"}
                            inputMode={keypad ? "none" : undefined}
                            aria-label={label}
                            aria-describedby={described || undefined}
                            data-selected={selected ? "true" : undefined}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            className={`${BASE} ${tone} ${selected ? "ring-2 ring-[var(--focus)] ring-offset-1 ring-offset-[var(--paper-raised)]" : ""}`}
                          />
                          {settled && !correct && <span aria-hidden="true" className="mx-auto mt-0.5 block w-fit rounded bg-[var(--paper)] px-1 font-data text-[11px] font-semibold leading-4 text-[var(--ink)] shadow-sm">{printed}</span>}
                          {settled && <span id={statusId} className="sr-only">{cellStatus({ answered: buffer !== "", correct, expected: printed })}</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {reading && selectedKey && CHART_DEALERS.some((dealer) => cellKey(section.id, row, dealer) === selectedKey) && (
                    <tr>
                      <td colSpan={CHART_DEALERS.length + 1} className="p-0">
                        {/* Pinned to the rail's left edge and as wide as the rail (short of its fade), so it reads in full while the table scrolls sideways. */}
                        <div id={READING_ID} data-cell-reading="" className={`sticky left-0 max-w-full text-left [font-family:var(--font-ui)] ${rail?.scrollable ? "w-[calc(100cqw-2.5rem)]" : "w-[100cqw]"}`}>{reading}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {rail?.scrollable && !rail.atEnd && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--paper-raised)] to-transparent" />
            <p aria-hidden="true" className="pointer-events-none absolute bottom-1 right-2 rounded-full bg-[var(--ink)] px-2 py-0.5 text-[.65rem] font-medium text-[var(--paper)]">{rail.hiddenRight} more →</p>
          </>
        )}
      </div>
    </Panel>
  );
});
