"use client";
import type { ReactNode } from "react";
import type { Action } from "@/lib/blackjack/types";
import { ACTION_FILL, ACTION_NAME } from "@/components/blackjack/actions";
import { cx } from "@/components/ui/cx";
import { DEALERS, cellDecision, cellKey, handLabel, signedCount, type CellRef, type ChartCell, type Dealer, type PlayTable, type StrategyChart, type SurrenderTable, type TableRules } from "@/lib/strategy";

export type ChartMode = "basic" | "indices" | "count";

/** "+4↑" / "−1↓": where the other play starts and which way it runs. */
const stripLabel = (at: number, dir: "up" | "down") => `${signedCount(at)}${dir === "up" ? "↑" : "↓"}`;
const dealerName = (dealer: Dealer) => (dealer === "A" ? "ace" : dealer);

interface CellView {
  action: Action | null;
  /** Small letter after the action: "Ds" is double, or stand if you can't. */
  suffix?: string;
  strip?: { action: Action; label: string };
  surrenderFlag?: boolean;
  changed?: boolean;
  label: string;
}

/**
 * Arrow keys move between cells, Home/End jump along a row. Each table is one
 * tab stop: only the cell that last had focus is in the tab order.
 */
function onGridKey(event: React.KeyboardEvent<HTMLTableElement>) {
  const target = event.target as HTMLElement;
  const row = Number(target.dataset.row), column = Number(target.dataset.col);
  if (Number.isNaN(row) || Number.isNaN(column)) return;
  const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -column], End: [0, 9 - column] };
  const move = moves[event.key];
  if (!move) return;
  const next = event.currentTarget.querySelector<HTMLButtonElement>(`[data-row="${row + move[0]}"][data-col="${column + move[1]}"]`);
  if (!next) return;
  event.preventDefault();
  target.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function Cell({ view, onSelect, selected, row, col }: { view: CellView; onSelect: () => void; selected: boolean; row: number; col: number }) {
  const fill = view.action ? ACTION_FILL[view.action] : "bg-surface-2 text-ink-3";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={view.label}
      aria-pressed={selected}
      data-row={row}
      data-col={col}
      tabIndex={row === 0 && col === 0 ? 0 : -1}
      className={cx(
        "relative flex h-11 w-full items-center justify-center overflow-hidden rounded-[0.4rem] font-semibold leading-none transition sm:h-12 lg:h-11 print:h-8",
        fill,
        view.changed && "ring-2 ring-brand ring-offset-1 ring-offset-surface",
        selected && "outline outline-2 outline-offset-1 outline-ink",
        "hover:brightness-110 active:scale-[0.97]",
      )}
    >
      <span className={cx("text-[0.8125rem] sm:text-[0.9375rem]", view.strip && "-translate-y-[0.35rem] sm:-translate-y-2")} aria-hidden>
        {view.action ?? "·"}
        {view.suffix && <span className="ml-px text-[0.625rem] font-medium opacity-80 sm:text-[0.6875rem]">{view.suffix}</span>}
      </span>
      {view.strip && (
        <span aria-hidden className={cx("absolute inset-x-0 bottom-0 flex h-[0.95rem] items-center justify-center gap-px text-[0.5625rem] font-bold tracking-tight sm:h-[1.05rem] sm:text-[0.6875rem]", ACTION_FILL[view.strip.action], "shadow-[0_-1px_0_rgb(0_0_0/0.18)]")}>
          <span className="hidden sm:inline">{view.strip.action}</span>
          {view.strip.label}
        </span>
      )}
      {view.surrenderFlag && <span aria-hidden className="absolute right-0 top-0 h-2.5 w-2.5 bg-act-r [clip-path:polygon(0_0,100%_0,100%_100%)] sm:h-3 sm:w-3" />}
    </button>
  );
}

function suffixFor(action: Action, fallback?: Action) {
  if (action === "D" && fallback === "S") return "s";
  return undefined;
}

export function playCellView(rules: TableRules, cell: ChartCell, mode: ChartMode, tc: number): CellView {
  const name = `${handLabel(cell.ref.section, cell.ref.row)} versus dealer ${dealerName(cell.ref.dealer)}`;
  const basicText = `${ACTION_NAME[cell.basic.action]}${cell.basic.fallback ? `, or ${ACTION_NAME[cell.basic.fallback].toLowerCase()} if not allowed` : ""}`;
  const surrenderNote = cell.surrenderFirst ? ". Surrender first if allowed" : "";
  if (mode === "count") {
    const decision = cellDecision(rules, cell.ref, tc, { canDouble: true, canSplit: true, canSurrender: false });
    const changed = decision.action !== cell.basic.action;
    return {
      action: decision.action,
      suffix: suffixFor(decision.action, decision.fallback),
      surrenderFlag: cell.surrenderFirst,
      changed,
      label: `${name}: at a true count of ${signedCount(tc)}, ${ACTION_NAME[decision.action].toLowerCase()}${changed ? ` (basic strategy says ${ACTION_NAME[cell.basic.action].toLowerCase()})` : ""}${surrenderNote}`,
    };
  }
  const index = mode === "indices" ? cell.index : undefined;
  return {
    action: cell.basic.action,
    suffix: suffixFor(cell.basic.action, cell.basic.fallback),
    strip: index ? { action: index.play, label: stripLabel(index.at, index.dir) } : undefined,
    surrenderFlag: cell.surrenderFirst,
    label: `${name}: ${basicText}${index ? `. ${ACTION_NAME[index.play]} at ${signedCount(index.at)} or ${index.dir === "up" ? "higher" : "lower"}` : ""}${surrenderNote}`,
  };
}

export function surrenderCellView(rules: TableRules, table: SurrenderTable, ref: CellRef, mode: ChartMode, tc: number): CellView {
  const rule = table.cells.get(cellKey(ref));
  const name = `Surrender ${handLabel(ref.section, ref.row)} versus dealer ${dealerName(ref.dealer)}`;
  if (!rule) return { action: null, label: `${name}: never` };
  const play = cellDecision(rules, ref, rule.basic ? Math.min(rule.at - 1, 10) : rule.at, { canDouble: true, canSplit: true, canSurrender: false }).action;
  if (mode === "count") {
    const surrenders = tc >= rule.at;
    return { action: surrenders ? "R" : null, changed: surrenders !== rule.basic, label: `${name}: at ${signedCount(tc)}, ${surrenders ? "surrender" : "do not surrender"}` };
  }
  const finite = Number.isFinite(rule.at) && mode === "indices";
  if (rule.basic) {
    return {
      action: "R",
      strip: finite ? { action: play, label: stripLabel(rule.at - 1, "down") } : undefined,
      label: `${name}: surrender${Number.isFinite(rule.at) ? `, unless the true count is ${signedCount(rule.at - 1)} or lower` : ", at every count"}`,
    };
  }
  return {
    action: null,
    strip: finite ? { action: "R", label: stripLabel(rule.at, "up") } : undefined,
    label: `${name}: surrender at ${signedCount(rule.at)} or higher, otherwise play the hand`,
  };
}

/** The dealer-card header row shared by every table. */
function DealerHeader() {
  return (
    <thead>
      <tr>
        <th scope="col" className="w-8 sm:w-11"><span className="sr-only">Your hand</span></th>
        {DEALERS.map((dealer) => (
          <th key={dealer} scope="col" className="pb-1 text-center text-[0.75rem] font-semibold text-ink-2 sm:text-sm">
            <span className="sr-only">Dealer </span>{dealer === "10" ? "10" : dealer}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TableFrame({ id, title, sub, children, aside }: { id: string; title: string; sub?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 break-inside-avoid lg:scroll-mt-6">
      <div className="mb-2 flex items-end justify-between gap-3 print:mb-1">
        <div>
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          {sub && <p className="text-sm text-ink-3 print:hidden">{sub}</p>}
        </div>
        {aside}
      </div>
      <div className="card p-1.5 sm:p-2.5 print:p-1">
        <p className="mb-1 text-center text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-3 print:hidden" aria-hidden>Dealer&rsquo;s upcard</p>
        {children}
      </div>
    </section>
  );
}

export function PlayTableView({ rules, table, mode, tc, selected, onSelect }: {
  rules: TableRules; table: PlayTable; mode: ChartMode; tc: number; selected?: string; onSelect: (ref: CellRef) => void;
}) {
  return (
    <table onKeyDown={onGridKey} className="w-full table-fixed border-separate border-spacing-[2px] sm:border-spacing-[3px]">
      <caption className="sr-only">{table.title} for {DEALERS.length} dealer upcards. Use the arrow keys to move between cells.</caption>
      <DealerHeader />
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={row}>
            <th scope="row" className="pr-0.5 text-right font-mono text-[0.75rem] font-semibold text-ink-2 sm:pr-1.5 sm:text-sm">{row}</th>
            {DEALERS.map((dealer, column) => {
              const ref = { section: table.id, row, dealer };
              const cell = table.cells.get(cellKey(ref))!;
              return (
                <td key={dealer} className="p-0">
                  <Cell row={rowIndex} col={column} view={playCellView(rules, cell, mode, tc)} selected={selected === cellKey(ref)} onSelect={() => onSelect(ref)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SurrenderTableView({ rules, table, mode, tc, selected, onSelect }: {
  rules: TableRules; table: SurrenderTable; mode: ChartMode; tc: number; selected?: string; onSelect: (ref: CellRef) => void;
}) {
  return (
    <table onKeyDown={onGridKey} className="w-full table-fixed border-separate border-spacing-[2px] sm:border-spacing-[3px]">
      <caption className="sr-only">Surrender decisions. Use the arrow keys to move between cells.</caption>
      <DealerHeader />
      <tbody>
        {table.rows.map(({ row, section }, rowIndex) => (
          <tr key={`${section}:${row}`}>
            <th scope="row" className="pr-0.5 text-right font-mono text-[0.75rem] font-semibold text-ink-2 sm:pr-1.5 sm:text-sm">{row}</th>
            {DEALERS.map((dealer, column) => {
              const ref = { section, row, dealer };
              return (
                <td key={dealer} className="p-0">
                  <Cell row={rowIndex} col={column} view={surrenderCellView(rules, table, ref, mode, tc)} selected={selected === `R:${cellKey(ref)}`} onSelect={() => onSelect(ref)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type { StrategyChart };
