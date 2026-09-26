"use client";

import { memo, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { CHART_DEALERS } from "@/lib/blackjack/bjaH17Chart";

export interface CellPosition {
  r: number;
  c: number;
  /** Roving tabindex: one Tab stop per table, on the last cell focused there. */
  tabIndex: 0 | -1;
}

const LAST_COLUMN = CHART_DEALERS.length - 1;

/**
 * One strategy table as an ARIA grid: the dealer's upcards across the top,
 * the player's hands down the side, one button per cell. Arrow keys move one
 * cell and stop at the edges; Home/End go to the row's ends and Ctrl+Home/End
 * to the table's corners.
 */
export const ChartGrid = memo(function ChartGrid({
  testId,
  caption,
  rows,
  rowLabel,
  renderCell,
}: {
  testId: string;
  caption: string;
  rows: readonly string[];
  rowLabel?: (row: string) => ReactNode;
  renderCell: (row: string, dealer: string, position: CellPosition) => ReactNode;
}) {
  const [stop, setStop] = useState({ r: 0, c: 0 });
  const stopRow = Math.min(stop.r, rows.length - 1);

  const onFocus = (event: FocusEvent<HTMLTableElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-r]");
    if (!cell) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    setStop((current) => (current.r === r && current.c === c ? current : { r, c }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-r]");
    if (!cell || event.altKey || event.metaKey) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    const lastRow = rows.length - 1;
    const control = event.ctrlKey;
    const next = event.key === "ArrowRight" ? [r, Math.min(LAST_COLUMN, c + 1)]
      : event.key === "ArrowLeft" ? [r, Math.max(0, c - 1)]
      : event.key === "ArrowDown" ? [Math.min(lastRow, r + 1), c]
      : event.key === "ArrowUp" ? [Math.max(0, r - 1), c]
      : event.key === "Home" ? (control ? [0, 0] : [r, 0])
      : event.key === "End" ? (control ? [lastRow, LAST_COLUMN] : [r, LAST_COLUMN])
      : null;
    if (!next) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLElement>(`[data-r="${next[0]}"][data-c="${next[1]}"]`)?.focus();
  };

  return (
    <div className="ref-rail min-w-0 overflow-x-auto" data-testid={testId}>
      <table role="grid" aria-readonly="true" onFocus={onFocus} onKeyDown={onKeyDown} className="ref-grid w-full table-fixed border-separate border-spacing-[2px] text-center max-[359px]:border-spacing-px">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="ref-hand-col" />
          {CHART_DEALERS.map((dealer) => <col key={dealer} />)}
        </colgroup>
        <thead>
          <tr>
            <td />
            <th scope="colgroup" colSpan={CHART_DEALERS.length} className="pb-0.5 font-sans text-[.62rem] font-semibold uppercase tracking-[.14em] text-[var(--ink-muted)] print:text-[8px]">
              Dealer&apos;s upcard
            </th>
          </tr>
          <tr>
            <th scope="col" className="px-0.5 pb-1 text-left align-bottom font-sans text-[.62rem] font-semibold uppercase leading-tight tracking-[.08em] text-[var(--ink-muted)] max-[359px]:px-0 max-[359px]:text-[.5rem] max-[359px]:tracking-normal print:text-[8px]">
              <span className="sm:hidden">Hand</span><span className="hidden sm:inline">Your hand</span>
            </th>
            {CHART_DEALERS.map((dealer, column) => (
              <th key={dealer} scope="col" data-col={column} className="ref-col-head rounded-md pb-1 text-xs font-semibold text-[var(--ink-muted)] print:pb-0 print:text-[9px]">
                {dealer}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row}>
              <th scope="row" className="ref-row-head rounded-md px-0.5 text-left text-xs font-semibold text-[var(--ink)] print:text-[9px]">
                {rowLabel ? rowLabel(row) : row}
              </th>
              {CHART_DEALERS.map((dealer, c) => (
                <td key={dealer} className="p-0">
                  {renderCell(row, dealer, { r, c, tabIndex: r === stopRow && c === stop.c ? 0 : -1 })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/** Soft rows read "A,7" with the total they make underneath, for readers who think in totals. */
export function softRowLabel(row: string, total: string) {
  return (
    <span className="block leading-none">
      <span className="block">{row}</span>
      <span className="mt-0.5 block text-[.62rem] font-medium text-[var(--ink-muted)] print:hidden">
        <span className="sr-only">soft </span>{total}
      </span>
    </span>
  );
}
