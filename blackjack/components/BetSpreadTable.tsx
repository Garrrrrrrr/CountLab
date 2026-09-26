"use client";

import type { CountRow } from "@/lib/blackjack/advantage";
import { NumberField } from "./ui";

const HAND_CHOICES = [1, 2, 3];

const money = (value: number, digits = 0) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)
    : "Not available";
const percent = (value: number, digits = 2, signed = false) =>
  `${signed && value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
const units = (bet: number, unit: number) => `${Number((bet / unit).toFixed(2))}u`;
const countTone = (trueCount: number) => trueCount < 0 ? "text-[var(--negative)]" : trueCount > 0 ? "text-[var(--accent)]" : "text-[var(--ink)]";
const edgeTone = (advantage: number) => advantage >= 0 ? "text-[var(--accent)]" : "text-[var(--negative)]";
/** The largest frequency in a ramp is well under 30%; scale bars to the busiest count so they stay readable. */
const barWidth = (frequency: number, rows: CountRow[]) => `${Math.max(2, (frequency / Math.max(...rows.map((row) => row.frequency), 1e-9)) * 100)}%`;

/**
 * The per-true-count bet/hands table shared by the Bankroll Lab and the
 * session journal, so both price a ramp identically.
 *
 * Narrow spaces get one card per count; wide ones get a table. `layout`
 * decides what "wide" means: the viewport (md and up), or the table's own
 * container, for callers that place it in a column or side panel. `density`
 * "compact" folds frequency and edge into the count cell so the table fits a
 * 40rem sheet.
 */
export function BetSpreadTable({
  rows,
  onBetChange,
  onZeroBet,
  onHandsChange,
  layout = "viewport",
  density = "full",
  unit,
  showFrequencyBars = false,
  lockedReason,
}: {
  rows: CountRow[];
  onBetChange: (trueCount: number, bet: number) => void;
  /**
   * Handles Sit out separately from a typed bet. Callers that spread an entered
   * bet across neighbouring counts need Sit out to stay a single-cell action:
   * it is how you wong out of one count without flattening the rest.
   * Defaults to a zero-dollar `onBetChange`.
   */
  onZeroBet?: (trueCount: number) => void;
  onHandsChange: (trueCount: number, hands: number) => void;
  layout?: "viewport" | "container";
  density?: "full" | "compact";
  /** When given, bets are also shown in units of this size. */
  unit?: number;
  showFrequencyBars?: boolean;
  /** A reason a count cannot be bet (e.g. below the wong-in point); its bet controls are disabled. */
  lockedReason?: (trueCount: number) => string | undefined;
}) {
  const zeroBet = onZeroBet ?? ((trueCount: number) => onBetChange(trueCount, 0));
  const showUnits = unit !== undefined && unit > 0;
  const compact = density === "compact";
  const hands = (row: CountRow, locked: boolean, size: "card" | "cell") => (
    <div role="group" aria-label={`Hands at true count ${row.label}`} className="inline-flex gap-1">
      {HAND_CHOICES.map((count) => (
        <button
          key={count}
          type="button"
          aria-pressed={row.playerHands === count}
          aria-label={`${count} hands at true count ${row.label}`}
          disabled={locked}
          onClick={() => onHandsChange(row.trueCount, count)}
          className={`min-w-11 rounded-lg border font-data text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${size === "card" ? "min-h-11" : "min-h-9 [@media(pointer:coarse)]:min-h-11"} ${row.playerHands === count ? "border-emerald-500/40 bg-emerald-400/15 text-[var(--accent)]" : "border-[var(--rule)] text-[var(--ink-muted)] hover:bg-overlay/[.05]"}`}
        >
          {count}
        </button>
      ))}
    </div>
  );
  const sitOut = (row: CountRow, locked: boolean, size: "card" | "cell") => (
    <button
      type="button"
      aria-label={`Sit out at true count ${row.label}`}
      disabled={locked || row.bet === 0}
      onClick={() => zeroBet(row.trueCount)}
      className={`shrink-0 rounded-lg border border-[var(--rule)] px-3 text-xs font-semibold text-[var(--ink-muted)] hover:border-[var(--ink-muted)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-35 ${size === "card" ? "min-h-11" : "min-h-9 [@media(pointer:coarse)]:min-h-11"}`}
    >
      Sit out
    </button>
  );
  const frequencyBar = (row: CountRow) => showFrequencyBars && (
    <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-overlay/[.08]"><span className="block h-full rounded-full bg-[var(--count-low)]" style={{ width: barWidth(row.frequency, rows) }} /></span>
  );

  const cards = (
    <div className={`bet-cards grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 ${layout === "viewport" ? "md:hidden" : ""}`}>
      {rows.map((row) => {
        const reason = lockedReason?.(row.trueCount);
        return (
          <div key={row.trueCount} className={`min-w-0 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3 ${reason ? "opacity-75" : ""}`}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className={`font-data text-base font-bold ${countTone(row.trueCount)}`}>{row.label}</span>
              <span className="min-w-0 text-right text-xs text-[var(--ink-muted)]">
                {percent(row.frequency, 2)} of rounds · <span className={edgeTone(row.advantage)}>{percent(row.advantage, 3, true)} edge</span>
                {frequencyBar(row)}
              </span>
            </div>
            <div className="mt-2.5 flex min-w-0 items-center gap-2">
              <NumberField
                ariaLabel={`Bet at true count ${row.label}`}
                value={Math.round(row.bet * 100) / 100}
                min={0}
                prefix="$"
                suffix={showUnits ? units(row.bet, unit!) : undefined}
                disabled={Boolean(reason)}
                className="min-w-0 flex-1"
                onValueChange={(value) => onBetChange(row.trueCount, value)}
              />
              {sitOut(row, Boolean(reason), "card")}
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3">
              {hands(row, Boolean(reason), "card")}
              <span className="text-right text-xs text-[var(--ink-muted)]">
                {money(row.totalBet, 0)} bet ·{" "}
                <span className={edgeTone(row.advantage)}>{money(row.frequency * row.advantage * row.totalBet, 3)} EV</span>
              </span>
            </div>
            {reason && <p className="mt-2 text-xs text-[var(--ink-muted)]">{reason}</p>}
          </div>
        );
      })}
    </div>
  );

  const table = (
    <div className={`bet-table overflow-x-auto ${layout === "viewport" ? "hidden md:block" : ""}`}>
      <table className={`w-full text-right text-sm ${compact ? "min-w-[34rem]" : "min-w-[44rem]"}`}>
        <thead className="text-xs text-[var(--ink-muted)]">
          <tr>
            <th scope="col" className="pb-3 text-left font-medium">True count</th>
            {!compact && <th scope="col" className="pb-3 font-medium">How often</th>}
            {!compact && <th scope="col" className="pb-3 font-medium">Your edge</th>}
            <th scope="col" className="pb-3 pl-4 text-left font-medium">Bet per hand</th>
            <th scope="col" className="pb-3 pl-3 text-left font-medium">Hands</th>
            <th scope="col" className="pb-3 font-medium">Total bet</th>
            <th scope="col" className="pb-3 font-medium">EV per round</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const reason = lockedReason?.(row.trueCount);
            return (
              <tr key={row.trueCount} title={reason} className={`border-t border-[var(--rule)] ${reason ? "opacity-70" : ""}`}>
                <th scope="row" className={`py-2 text-left font-data font-bold ${countTone(row.trueCount)}`}>
                  {row.label}
                  {compact && <span className="block text-[.7rem] font-normal text-[var(--ink-muted)]">{percent(row.frequency, 1)} · <span className={edgeTone(row.advantage)}>{percent(row.advantage, 2, true)}</span></span>}
                  {reason && <span className="sr-only">. {reason}</span>}
                </th>
                {!compact && <td className="font-data">{percent(row.frequency, 2)}{frequencyBar(row)}</td>}
                {!compact && <td className={`font-data ${edgeTone(row.advantage)}`}>{percent(row.advantage, 3, true)}</td>}
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    <NumberField
                      ariaLabel={`Bet at true count ${row.label}`}
                      value={Math.round(row.bet * 100) / 100}
                      min={0}
                      prefix="$"
                      suffix={showUnits ? units(row.bet, unit!) : undefined}
                      disabled={Boolean(reason)}
                      className={showUnits ? "w-36" : "w-28"}
                      onValueChange={(value) => onBetChange(row.trueCount, value)}
                    />
                    {sitOut(row, Boolean(reason), "cell")}
                  </div>
                </td>
                <td className="py-2 pl-3 text-left">{hands(row, Boolean(reason), "cell")}</td>
                <td className="font-data">{money(row.totalBet, 0)}</td>
                <td className={`font-data ${edgeTone(row.advantage)}`}>{money(row.frequency * row.advantage * row.totalBet, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return layout === "container"
    ? <div className="bet-table-host min-w-0" data-density={density}>{cards}{table}</div>
    : <>{cards}{table}</>;
}
