"use client";
import { ACTION_FILL } from "@/components/blackjack";
import { cx } from "@/components/ui";
import { DEALERS, handLabel, type CellRef, type TableRules } from "@/lib/strategy";
import { chartRow } from "@/lib/strategy-drills/chartRow";

/**
 * The hand's row of the strategy chart, with this hand's column ringed. It is
 * a real one-row table, so a screen reader hears each column and which one is
 * this hand. Codes follow printed charts: "Ds" doubles or else stands, "Rh"
 * surrenders or else hits.
 */
export function ChartRow({ rules, cell, caption, className }: { rules: TableRules; cell: CellRef; caption?: string; className?: string }) {
  const row = chartRow(rules, cell.section, cell.row);
  return (
    <table className={cx("w-full table-fixed border-separate border-spacing-[2px] text-center", className)}>
      <caption className="mb-1 text-left text-xs font-medium text-ink-3">{caption ?? `${handLabel(cell.section, cell.row)} on your chart`}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-9"><span className="sr-only">Hand</span></th>
          {DEALERS.map((dealer) => (
            <th key={dealer} scope="col" className={cx("tnum pb-0.5 text-[0.6875rem] font-semibold", dealer === cell.dealer ? "text-ink" : "text-ink-3")}>
              <span className="sr-only">Dealer </span>{dealer}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="tnum whitespace-nowrap pr-1 text-left text-[0.6875rem] font-semibold text-ink">{row.label}</th>
          {row.cells.map((entry) => {
            const current = entry.dealer === cell.dealer;
            return (
              <td key={entry.dealer} className="p-0">
                <span className={cx("grid h-7 place-items-center rounded-md text-[0.6875rem] font-bold", ACTION_FILL[entry.action], current && "ring-2 ring-ink ring-offset-1 ring-offset-surface")}>
                  <span aria-hidden>{entry.code}</span>
                  <span className="sr-only">{entry.spoken}{current ? " (this hand)" : ""}</span>
                </span>
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
