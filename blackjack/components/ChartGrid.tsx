"use client";

import type { ReactNode } from "react";
import { CHART_DEALERS } from "@/lib/blackjack/bjaH17Chart";
import type { StrategySectionId } from "@/lib/blackjack/strategyChart";
import { STRATEGY_ROWS } from "@/lib/blackjack/strategyTables";

export interface ChartGridProps {
  section: StrategySectionId;
  label: string;
  renderCell: (row: string, dealer: string) => ReactNode;
}

export default function ChartGrid({ section, label, renderCell }: ChartGridProps) {
  return (
    <div className="relative">
      <div
        className="-mx-1 snap-x snap-mandatory overflow-x-auto scroll-pl-11 px-1"
        data-testid={"chart-rail-" + section}
      >
        <table className="w-full min-w-[35.5rem] table-fixed border-separate border-spacing-1 text-center text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left text-xs font-semibold uppercase tracking-[.14em] text-[var(--ink-muted)]">
                Hand
              </th>
              {CHART_DEALERS.map((dealer) => (
                <th key={dealer} className="px-1 pb-1 text-xs font-semibold text-[var(--ink-muted)]">
                  {dealer}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STRATEGY_ROWS[section].map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-20 w-12 bg-[var(--paper-raised)] px-1.5 text-left font-medium text-[var(--ink)]"
                >
                  {row}
                </th>
                {CHART_DEALERS.map((dealer) => (
                  <td key={dealer} className="snap-start scroll-ml-12">
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
