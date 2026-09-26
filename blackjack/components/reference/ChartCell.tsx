"use client";

import { memo } from "react";
import type { ChartView, H17Cell as H17CellModel, RulesCell } from "@/lib/blackjack/referenceChartModel";
import type { CellPosition } from "./ChartGrid";
import { H17_TONE_STYLE, TONE_STYLE } from "./cellStyles";

const BASE = "ref-cell relative flex w-full flex-col items-center justify-center rounded-[5px] border font-data font-bold leading-none";

const samePosition = (a: CellPosition, b: CellPosition) => a.r === b.r && a.c === b.c && a.tabIndex === b.tabIndex;

/**
 * One cell of the rules chart. Hover, focus and taps are handled once for the
 * whole page (see CellExplainer), so a cell is just a labelled button.
 */
export const ChartCell = memo(function ChartCell({ cell, view, position, changed }: { cell: RulesCell; view: ChartView; position: CellPosition; changed: boolean }) {
  const play = view === "index" ? cell.play : undefined;
  return (
    <button
      type="button"
      tabIndex={position.tabIndex}
      data-cell={cell.key}
      data-r={position.r}
      data-c={position.c}
      data-index-play={play ? "" : undefined}
      data-changed={changed ? "" : undefined}
      aria-label={cell.ariaLabel}
      className={`${BASE} ${view === "index" ? "ref-cell-index" : "ref-cell-basic"} ${TONE_STYLE[cell.tone]}`}
    >
      <span aria-hidden="true" className="ref-letter">
        {cell.text === "Ds" ? <>D<span className="text-[.72em]">s</span></> : cell.text}
      </span>
      {play && <span aria-hidden="true" className={`ref-chip ${play.available ? "" : "ref-chip-off"}`}>{play.chip}</span>}
      {cell.surrenderFirst && <span aria-hidden="true" className="ref-flag" />}
    </button>
  );
}, (a, b) => a.cell === b.cell && a.view === b.view && a.changed === b.changed && samePosition(a.position, b.position));

/** One cell of the printed H17 chart: the token exactly as printed, nothing else. */
export const H17Cell = memo(function H17Cell({ cell, position }: { cell: H17CellModel; position: CellPosition }) {
  return (
    <button
      type="button"
      tabIndex={position.tabIndex}
      data-cell={cell.key}
      data-r={position.r}
      data-c={position.c}
      aria-label={cell.ariaLabel}
      className={`${BASE} ref-cell-basic ref-h17-cell ${H17_TONE_STYLE[cell.tone]}`}
    >
      {cell.text}
    </button>
  );
}, (a, b) => a.cell === b.cell && samePosition(a.position, b.position));
