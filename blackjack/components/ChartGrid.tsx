"use client";

import type { ReactNode } from "react";
import { CHART_DEALERS } from "@/lib/blackjack/bjaH17Chart";

export interface ChartGridProps {
  /** Names the rail for tests and scrolling; not every grid is a strategy section. */
  section: string;
  /** Hand labels top to bottom. The surrender grid derives its own, so this is passed rather than looked up. */
  rows: readonly string[];
  label: string;
  renderCell: (row: string, dealer: string) => ReactNode;
}

export default function ChartGrid({ section, rows, label, renderCell }: ChartGridProps) {
  return (
    <div className="relative">
      <div
        className="-mx-1 snap-x snap-mandatory overflow-x-auto scroll-pl-10 px-1"
        data-testid={"chart-rail-" + section}
      >
        <table className="w-full min-w-[31rem] table-fixed border-separate border-spacing-px text-center text-xs xl:min-w-0">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-10 bg-[var(--paper-raised)] px-1 text-left text-[0.65rem] font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)]">
                Hand
              </th>
              {CHART_DEALERS.map((dealer) => (
                <th key={dealer} className="px-0.5 pb-0.5 text-xs font-semibold text-[var(--ink-muted)]">
                  {dealer}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-20 w-10 bg-[var(--paper-raised)] px-1 text-left text-xs font-medium text-[var(--ink)]"
                >
                  {row}
                </th>
                {CHART_DEALERS.map((dealer) => (
                  <td key={dealer} className="snap-start scroll-ml-10">
                    {renderCell(row, dealer)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
