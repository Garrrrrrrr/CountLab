"use client";
import { memo } from "react";
import { ACTION_FILL } from "@/components/blackjack";
import { cx } from "@/components/ui";
import { DEALERS, signedCount } from "@/lib/strategy";
import { baseAction, spokenEntry, type CellEntry, type CellGrade, type RecallCell, type RecallTable } from "@/lib/strategy-drills/chartRecall";

export type GridView = "chart" | "mine";

/** What a cell shows: the base play large, the index (if any) small underneath. */
function CellFace({ entry, surrender, struck }: { entry?: CellEntry; surrender: boolean; struck?: boolean }) {
  if (!entry?.base && !entry?.dev) return <span aria-hidden className="text-ink-3/70">·</span>;
  const base = entry.base === "-" ? "—" : entry.base ?? "?";
  return (
    <span aria-hidden className={cx("flex flex-col items-center leading-none", struck && "line-through decoration-2")}>
      <span>{base}</span>
      {entry.dev && <span className="mt-[1px] text-[0.5625rem] font-bold tracking-tight opacity-90">{surrender ? "" : entry.dev.play}{signedCount(entry.dev.at)}</span>}
    </span>
  );
}

const fillOf = (entry?: CellEntry) => {
  if (!entry?.base) return entry?.dev ? "bg-surface-2 text-ink border border-dashed border-line-strong" : "bg-surface-2 border border-line";
  const action = baseAction(entry.base);
  return action ? ACTION_FILL[action] : "bg-surface-3 text-ink-2";
};

/**
 * One table of the chart as a grid of buttons: 11 columns that fit a 320px
 * phone (the row label and the ten dealer cards). Tapping a cell selects it;
 * answers come from the keypad below or the keyboard. After grading, wrong
 * and blank cells carry a red ✕ badge (never colour alone) and the grid can
 * show either the chart's answers or the reader's own.
 */
export const RecallGrid = memo(function RecallGrid({ table, entries, selected, onSelect, grades, view = "chart", dockSpace = 0 }: {
  table: RecallTable;
  entries: Readonly<Record<string, CellEntry>>;
  selected?: string;
  onSelect?: (key: string) => void;
  /** Present once the table is graded. */
  grades?: ReadonlyMap<string, CellGrade>;
  view?: GridView;
  /** Height of the pinned keypad, so a selected cell scrolls clear of it. */
  dockSpace?: number;
}) {
  const surrender = table.id === "surrender";
  const label = (cell: RecallCell) => {
    const entry = entries[cell.key];
    const grade = grades?.get(cell.key);
    if (!grade) return `${cell.name}: ${spokenEntry(entry)}`;
    const chart = spokenEntry(cell.expected, cell.dir);
    if (grade.ok) return `${cell.name}: right, ${chart}`;
    return grade.blank ? `${cell.name}: blank; the chart says ${chart}` : `${cell.name}: wrong; you put ${spokenEntry(entry)}; the chart says ${chart}`;
  };
  return (
    <table className="mx-auto w-full max-w-[34rem] table-fixed border-separate border-spacing-[2px] sm:border-spacing-1" aria-label={`${table.title}${grades ? ", graded" : ""}`}>
      <thead>
        <tr>
          <th scope="col" className="w-9 sm:w-12"><span className="sr-only">Hand</span></th>
          {DEALERS.map((dealer) => (
            <th key={dealer} scope="col" className="tnum pb-0.5 text-[0.6875rem] font-semibold text-ink-3 sm:text-xs">
              <span className="sr-only">Dealer </span>{dealer}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={`${row.section}-${row.row}`}>
            <th scope="row" className="tnum whitespace-nowrap pr-0.5 text-left text-[0.6875rem] font-semibold text-ink sm:text-sm">{row.label}</th>
            {row.cells.map((cell) => {
              const entry = entries[cell.key];
              const grade = grades?.get(cell.key);
              const shown = grade && view === "chart" ? cell.expected : entry;
              const isSelected = cell.key === selected;
              const wrong = grade && !grade.ok;
              return (
                <td key={cell.key} className="p-0">
                  <button
                    type="button"
                    data-cell={cell.key}
                    aria-label={label(cell)}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelect?.(cell.key)}
                    style={{ scrollMarginTop: "4.5rem", scrollMarginBottom: dockSpace + 12 }}
                    className={cx(
                      "tnum relative flex h-7 w-full items-center justify-center rounded-[5px] text-[0.6875rem] font-bold outline-none min-[360px]:h-8 sm:h-10 sm:rounded-md sm:text-sm",
                      fillOf(shown),
                      grade && grade.ok && view === "mine" && "opacity-90",
                      isSelected ? "z-10 ring-2 ring-brand ring-offset-2 ring-offset-bg" : "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-bg",
                    )}
                  >
                    <CellFace entry={shown} surrender={surrender} struck={Boolean(wrong && view === "mine" && !grade?.blank)} />
                    {wrong && (
                      <span aria-hidden className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-neg text-[0.5rem] font-black leading-none text-white ring-2 ring-bg">✕</span>
                    )}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
});
