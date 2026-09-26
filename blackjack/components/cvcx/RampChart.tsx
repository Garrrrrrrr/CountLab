"use client";

import { useState } from "react";
import type { CountRow } from "@/lib/blackjack/advantage";
import { money, percent } from "@/lib/blackjack/labFormat";
import { MIN_TC, MAX_TC, tcLabel, unitLabel } from "@/lib/blackjack/rampSteps";

const axisLabel = (trueCount: number) => (trueCount === MIN_TC ? `≤${tcLabel(trueCount)}` : trueCount === MAX_TC ? `≥${tcLabel(trueCount)}` : tcLabel(trueCount));

/**
 * The bet at every true count as bars: filled where the player has the edge,
 * neutral where the house does, dashed where the player sits out. Unit labels
 * appear where the bet changes, the way a ramp is read. The step editor and
 * the Every count table are the accessible editors; clicking a bar is a
 * shortcut to the matching field.
 */
export function RampChart({ rows, unit, sittingOutBelow, summary, onSelect }: { rows: CountRow[]; unit: number; sittingOutBelow: number | null; summary: string; onSelect: (trueCount: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = Math.max(0, ...rows.map((row) => row.units));
  const hover = hovered === null ? undefined : rows.find((row) => row.trueCount === hovered);
  return (
    <figure className="m-0 min-w-0">
      <div className="relative" onPointerLeave={() => setHovered(null)}>
        <div role="img" aria-label={`Bet ramp chart: ${summary}`} className="flex h-[120px] items-end gap-[2px] border-b border-[var(--rule)] pt-4 sm:h-[140px] sm:gap-1">
          {rows.map((row, index) => {
            const satOut = row.units <= 0 || (sittingOutBelow !== null && row.trueCount < sittingOutBelow);
            const changes = index === 0 || rows[index - 1].units !== row.units;
            const height = top > 0 && !satOut ? Math.max(4, (row.units / top) * 100) : 18;
            return (
              <div
                key={row.trueCount}
                onPointerEnter={() => setHovered(row.trueCount)}
                onClick={() => onSelect(row.trueCount)}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-end"
              >
                <span
                  aria-hidden="true"
                  className={`relative block w-full rounded-t-[3px] ${satOut ? "border border-b-0 border-dashed border-[var(--ink-muted)]" : ""} ${hovered === row.trueCount ? "opacity-80" : ""}`}
                  style={{ height: `${height}%`, background: satOut ? "transparent" : row.advantage >= 0 ? "var(--accent)" : "var(--ink-muted)" }}
                >
                  {changes && !satOut && <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap font-data text-[.6rem] leading-none text-[var(--ink)] sm:text-[.68rem]">{unitLabel(row.units)}</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" className="mt-1 flex gap-[2px] sm:gap-1">
          {rows.map((row, index) => (
            <span key={row.trueCount} className={`min-w-0 flex-1 text-center font-data text-[.58rem] leading-tight text-[var(--ink-muted)] sm:text-[.65rem] ${index % 2 ? "invisible sm:visible" : ""}`}>{axisLabel(row.trueCount)}</span>
          ))}
        </div>
        {hover && (
          <div aria-hidden="true" className="pointer-events-none absolute -top-2 z-10 w-max max-w-[16rem] -translate-y-full rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-2.5 py-1.5 text-xs leading-5 shadow-lg" style={{ left: `clamp(0px, calc(${((hover.trueCount - MIN_TC + 0.5) / (MAX_TC - MIN_TC + 1)) * 100}% - 6rem), calc(100% - 12rem))` }}>
            <b className="font-data">TC {axisLabel(hover.trueCount)}</b>
            <span className="block text-[var(--ink-muted)]">
              {hover.units > 0 ? `${unitLabel(hover.units)} unit${hover.units === 1 ? "" : "s"} (${money(hover.units * unit, hover.units * unit % 1 ? 2 : 0)}) · ${hover.playerHands} hand${hover.playerHands === 1 ? "" : "s"}` : "Sitting out"}
            </span>
            <span className="block text-[var(--ink-muted)]">Happens {percent(hover.frequency, 1)} of rounds · edge {percent(hover.advantage, 2, true)}</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-muted)]">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />You have the edge</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-[var(--ink-muted)]" />House has the edge</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--ink-muted)]" />Sitting out</span>
      </figcaption>
    </figure>
  );
}
