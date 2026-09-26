import { ACTION_STYLE, ACTION_LABEL } from "@/lib/blackjack/actionStyles";
import type { MiniChartRow as Row } from "@/lib/blackjack/strategyDrill";
import type { Action } from "@/lib/blackjack/types";

/**
 * One row of the basic-strategy chart, in the reference chart's colours, with
 * the column being asked ringed. A one-row table with a caption, so a screen
 * reader hears each column and which one is this hand.
 */
export function MiniChartRow({ row }: { row: Row }) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-[3px] text-center">
      <caption className="mb-1 text-left text-xs font-medium text-[var(--ink-muted)] [font-family:var(--font-ui)] max-sm:sr-only">{row.caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-9 text-left text-[.65rem] font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]"><span className="sr-only">Hand</span></th>
          {row.cells.map((cell) => (
            <th key={cell.dealer} scope="col" className={`font-data text-[.7rem] font-semibold ${cell.dealer === row.current ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
              {cell.dealer}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="text-left font-data text-xs font-semibold text-[var(--ink)]">{row.rowLabel}</th>
          {row.cells.map((cell) => {
            const current = cell.dealer === row.current;
            const action = cell.action && cell.action !== "N" ? (cell.action as Action) : undefined;
            return (
              <td key={cell.dealer} className="p-0">
                <span className={`grid h-7 place-items-center rounded border font-data text-[.7rem] font-bold ${action ? ACTION_STYLE[action] : "border-[var(--rule)] text-[var(--ink-muted)]"} ${current ? "outline outline-2 outline-offset-1 outline-[var(--ink)]" : ""}`}>
                  <span aria-hidden="true">{action ?? "·"}</span>
                  <span className="sr-only">{action ? ACTION_LABEL[action] : "No surrender"}{current ? " (this hand)" : ""}</span>
                </span>
                {current && <span aria-hidden="true" className="block text-[.6rem] leading-3 text-[var(--ink)]">▲</span>}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

/** Stands in for the row when the chart does not print one. */
export function ChartNote({ children }: { children: string }) {
  return <p className="rounded-lg border border-dashed border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink)]"><i className="fa-solid fa-table-cells mr-2 text-xs text-[var(--ink-muted)]" aria-hidden="true" />{children}</p>;
}
