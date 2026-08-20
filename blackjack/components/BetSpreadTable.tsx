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

/** The per-true-count bet/hands table shared by the Bankroll Lab and the session journal, so both price a ramp identically. */
export function BetSpreadTable({
  rows,
  onBetChange,
  onHandsChange,
}: {
  rows: CountRow[];
  onBetChange: (trueCount: number, bet: number) => void;
  onHandsChange: (trueCount: number, hands: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-right text-sm">
        <thead className="text-zinc-500">
          <tr>
            <th className="pb-3 text-left">True count</th>
            <th className="pb-3">Frequency</th>
            <th className="pb-3">Advantage</th>
            <th className="pb-3 text-left">Bet / hand</th>
            <th className="pb-3 text-left">Hands</th>
            <th className="pb-3">Total action</th>
            <th className="pb-3">EV / round</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.trueCount} className="border-t border-white/[.06]">
              <td
                className={`py-2.5 text-left font-bold ${row.trueCount < 0 ? "text-red-400" : row.trueCount > 0 ? "text-emerald-300" : "text-zinc-300"}`}
              >
                {row.label}
              </td>
              <td>{percent(row.frequency, 2)}</td>
              <td className={row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}>
                {percent(row.advantage, 3, true)}
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <NumberField
                    ariaLabel={`Bet at true count ${row.label}`}
                    value={Math.round(row.bet * 100) / 100}
                    min={0}
                    prefix="$"
                    className="w-28"
                    onValueChange={(value) => onBetChange(row.trueCount, value)}
                  />
                  <button
                    type="button"
                    aria-label={`Zero bet at true count ${row.label}`}
                    disabled={row.bet === 0}
                    onClick={() => onBetChange(row.trueCount, 0)}
                    className="min-h-9 rounded-lg border border-red-400/20 bg-red-400/[.06] px-2.5 text-xs font-semibold text-red-300 hover:bg-red-400/[.12] disabled:cursor-default disabled:opacity-35"
                  >
                    Zero
                  </button>
                </div>
              </td>
              <td className="py-2 text-left">
                <div className="inline-flex gap-1">
                  {HAND_CHOICES.map((count) => (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={row.playerHands === count}
                      aria-label={`${count} hands at true count ${row.label}`}
                      onClick={() => onHandsChange(row.trueCount, count)}
                      className={`rounded-md border px-2 py-1 text-xs font-semibold ${row.playerHands === count ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-200" : "border-white/[.08] text-zinc-500 hover:bg-white/[.05]"}`}
                    >
                      {count}X
                    </button>
                  ))}
                </div>
              </td>
              <td>{money(row.totalBet, 0)}</td>
              <td className={row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}>
                {money(row.frequency * row.advantage * row.totalBet, 3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
