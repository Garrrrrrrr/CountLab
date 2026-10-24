"use client";
import { useState } from "react";
import type { CountRow } from "@/lib/blackjack/advantage";
import { money, percent } from "@/lib/blackjack/labFormat";
import { MAX_TC, MIN_TC, tcLabel, unitLabel } from "@/lib/blackjack/rampSteps";
import { cx } from "@/components/ui";

const axisLabel = (trueCount: number) => (trueCount === MIN_TC ? `≤${tcLabel(trueCount)}` : trueCount === MAX_TC ? `≥${tcLabel(trueCount)}` : tcLabel(trueCount));

/**
 * The bet at every true count as bars: gold where you have the edge, grey
 * where the house does, dashed where you sit out. Unit labels sit where the
 * bet changes, the way a ramp is read. The step editor and the Every count
 * table are the accessible editors; a bar is a shortcut to its field.
 */
export function RampChart({ rows, unit, sittingOutBelow, summary, onSelect }: { rows: CountRow[]; unit: number; sittingOutBelow: number | null; summary: string; onSelect: (trueCount: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = Math.max(0, ...rows.map((row) => row.units));
  const hover = hovered === null ? undefined : rows.find((row) => row.trueCount === hovered);
  return (
    <figure className="m-0 min-w-0">
      <div className="relative" onPointerLeave={() => setHovered(null)}>
        <div role="img" aria-label={`Bet ramp chart: ${summary}`} className="flex h-32 items-end gap-[2px] border-b border-line pt-5 sm:h-36 sm:gap-1">
          {rows.map((row, index) => {
            const satOut = row.units <= 0 || (sittingOutBelow !== null && row.trueCount < sittingOutBelow);
            const changes = index === 0 || rows[index - 1].units !== row.units || (sittingOutBelow !== null && rows[index - 1].trueCount < sittingOutBelow);
            const height = top > 0 && !satOut ? Math.max(5, (row.units / top) * 100) : 16;
            return (
              <div key={row.trueCount} onPointerEnter={() => setHovered(row.trueCount)} onClick={() => onSelect(row.trueCount)} className="flex h-full min-w-0 flex-1 cursor-pointer items-end">
                <span
                  aria-hidden
                  className={cx(
                    "relative block w-full rounded-t-[3px] transition-[height] duration-200",
                    satOut ? "border border-b-0 border-dashed border-ink-3/60" : row.advantage >= 0 ? "bg-brand" : "bg-ink-3/45",
                    hovered === row.trueCount && "opacity-80",
                  )}
                  style={{ height: `${height}%` }}
                >
                  {changes && !satOut && <span className="tnum absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[0.625rem] font-semibold leading-none text-ink sm:text-[0.6875rem]">{unitLabel(row.units)}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div aria-hidden className="mt-1 flex gap-[2px] sm:gap-1">
          {rows.map((row, index) => (
            <span key={row.trueCount} className={cx("tnum min-w-0 flex-1 text-center text-[0.5625rem] leading-tight text-ink-3 sm:text-[0.6875rem]", index % 2 === 1 && "invisible sm:visible")}>{axisLabel(row.trueCount)}</span>
          ))}
        </div>
        {hover && (
          <div aria-hidden className="pointer-events-none absolute -top-2 z-10 w-max max-w-[16rem] -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs leading-5 shadow-2"
            style={{ left: `clamp(0px, calc(${((hover.trueCount - MIN_TC + 0.5) / (MAX_TC - MIN_TC + 1)) * 100}% - 6rem), calc(100% - 12rem))` }}>
            <b className="tnum">True count {axisLabel(hover.trueCount)}</b>
            <span className="tnum block text-ink-2">
              {hover.units > 0 && !(sittingOutBelow !== null && hover.trueCount < sittingOutBelow)
                ? `${unitLabel(hover.units)} unit${hover.units === 1 ? "" : "s"} (${money(hover.units * unit, (hover.units * unit) % 1 ? 2 : 0)}) · ${hover.playerHands} hand${hover.playerHands === 1 ? "" : "s"}`
                : "Sitting out"}
            </span>
            <span className="tnum block text-ink-2">Comes up {percent(hover.frequency, 1)} of rounds · edge {percent(hover.advantage, 2, true)}</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-brand" />You have the edge</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-ink-3/45" />House has the edge</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-dashed border-ink-3/60" />Sitting out</span>
      </figcaption>
    </figure>
  );
}
