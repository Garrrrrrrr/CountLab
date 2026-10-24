"use client";
import type { CountRow } from "@/lib/blackjack/advantage";
import { money, percent } from "@/lib/blackjack/labFormat";
import { tcLabel, unitLabel } from "@/lib/blackjack/rampSteps";
import { cx } from "@/components/ui";
import { useNumberDraft } from "./parts";

/** The busiest count is well under 30% of rounds; scale bars to it so they stay readable. */
const barWidth = (frequency: number, rows: CountRow[]) => `${Math.max(3, (frequency / Math.max(...rows.map((row) => row.frequency), 1e-9)) * 100)}%`;
const rowLabel = (row: CountRow) => (row.trueCount <= -8 ? "≤ −8" : row.trueCount >= 8 ? "≥ +8" : tcLabel(row.trueCount));

/**
 * The ramp one true count at a time: how often each count comes up, your edge
 * there, the bet per hand in dollars and the hands played. Counts below the
 * sit-out point are locked. Fits a 320px screen; the EV column appears when
 * there is room.
 */
export function CountTable({ rows, unit, sittingOutBelow, onBetChange, onHandsChange }: {
  rows: CountRow[]; unit: number; sittingOutBelow: number | null; onBetChange: (trueCount: number, bet: number) => void; onHandsChange: (trueCount: number, hands: number) => void;
}) {
  return (
    <div className="-mx-4 min-w-0 overflow-x-auto border-y border-line sm:mx-0 sm:rounded-xl sm:border">
      <table className="w-full min-w-[17rem] text-sm">
        <caption className="sr-only">Bet and hands at every true count</caption>
        <thead className="bg-surface-2/60 text-left text-xs text-ink-3">
          <tr>
            <th scope="col" className="py-2 pl-3 pr-2 font-medium">True count</th>
            <th scope="col" className="px-1.5 py-2 font-medium">Bet per hand</th>
            <th scope="col" className="px-1.5 py-2 pr-3 font-medium sm:pr-1.5">Hands</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">EV per round</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const locked = sittingOutBelow !== null && row.trueCount < sittingOutBelow;
            const label = rowLabel(row);
            const contribution = locked ? 0 : row.frequency * row.advantage * row.totalBet;
            return (
              <tr key={row.trueCount} className={cx(locked && "bg-surface-2/40")}>
                <th scope="row" className="py-2 pl-3 pr-2 text-left align-middle font-normal">
                  <span className={cx("tnum block text-base font-semibold", row.trueCount > 0 ? "text-brand-text" : "text-ink")}>{label}</span>
                  <span className="tnum block text-[0.6875rem] leading-4 text-ink-3">
                    {percent(row.frequency, 1)} · <span className={row.advantage >= 0 ? "text-pos" : "text-neg"}>{percent(row.advantage, 2, true)}</span>
                  </span>
                  <span aria-hidden className="mt-1 block h-1 w-14 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-ink-3/60" style={{ width: barWidth(row.frequency, rows) }} /></span>
                  {locked && <span className="sr-only">. Sitting out: When you play starts at {tcLabel(sittingOutBelow!)}.</span>}
                </th>
                <td className="px-1.5 py-2 align-middle">
                  {locked ? (
                    <span className="block text-xs leading-5 text-ink-3" title={`When you play starts at ${tcLabel(sittingOutBelow!)}`}>Sitting out</span>
                  ) : (
                    <BetInput label={`Bet at true count ${label}`} value={Math.round(row.bet * 100) / 100} units={unit > 0 ? `${unitLabel(row.bet / unit)}u` : ""} onChange={(bet) => onBetChange(row.trueCount, bet)} />
                  )}
                </td>
                <td className="py-2 pl-1.5 pr-3 align-middle sm:pr-1.5">
                  <select aria-label={`Hands at true count ${label}`} value={row.playerHands} disabled={locked} data-analytics-field="hands_per_count"
                    onChange={(event) => onHandsChange(row.trueCount, Number(event.target.value))}
                    className="tnum h-11 rounded-lg border border-line bg-surface-2 px-2 text-base text-ink disabled:opacity-40">
                    {[1, 2, 3].map((hands) => <option key={hands} value={hands}>{hands}</option>)}
                  </select>
                </td>
                <td className={cx("tnum hidden px-3 py-2 text-right align-middle sm:table-cell", contribution >= 0 ? "text-ink-2" : "text-neg")}>{money(contribution, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A compact dollar field for one count, with its size in units beside the number. */
function BetInput({ label, value, units, onChange }: { label: string; value: number; units: string; onChange: (value: number) => void }) {
  const draft = useNumberDraft(value, onChange, 0, 1_000_000);
  return (
    <div className="relative w-[6.25rem]">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ink-3">$</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        aria-label={label}
        data-analytics-field="bet_per_count"
        value={draft.value}
        onFocus={draft.onFocus}
        onChange={(event) => draft.onChange(event.target.value)}
        onBlur={draft.onBlur}
        className="tnum h-11 w-full rounded-lg border border-line bg-surface-2 pl-6 pr-9 text-base text-ink hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
      <span aria-hidden className="tnum pointer-events-none absolute inset-y-0 right-2 flex items-center text-[0.6875rem] text-ink-3">{units}</span>
    </div>
  );
}
