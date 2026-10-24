"use client";
import { useState } from "react";
import { chance, count, money, percent, signedMoney } from "@/lib/blackjack/labFormat";
import type { TripOutlook } from "@/lib/blackjack/labModel";
import { cx } from "@/components/ui";
import { Figure, Note, NumberField, Panel } from "./parts";
import type { Calc } from "./useCalculator";

/** Band fills from the widest (palest) to the narrowest (strongest). */
const BAND_FILL = ["bg-brand/20", "bg-brand/40", "bg-brand/75"] as const;
const HOUR_PRESETS = [4, 8, 20, 40, 100] as const;

/**
 * Nested ranges on one axis: the widest, palest band holds 19 in 20 trips, the
 * strongest 2 in 3. A dot marks the expected result and a dashed line breaking
 * even. The same ranges are listed as text beside it.
 */
function OutcomeRange({ trip }: { trip: TripOutlook }) {
  const bands = trip.ranges;
  const low = Math.min(0, ...bands.map((band) => band.low));
  const high = Math.max(0, ...bands.map((band) => band.high));
  const pad = (high - low) * 0.04 || 1;
  const position = (value: number) => `${((value - (low - pad)) / (high - low + 2 * pad)) * 100}%`;
  const label = `Trip results: ${bands.map((band) => `${band.label} between ${signedMoney(band.low)} and ${signedMoney(band.high)}`).join("; ")}. Expected ${signedMoney(trip.expected)}.`;
  return (
    <div role="img" aria-label={label} className="mt-4">
      <div className="relative h-12">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-ink/10" />
        {[...bands].reverse().map((band, index) => (
          <span key={band.label} aria-hidden className={cx("absolute top-1/2 h-5 -translate-y-1/2 rounded-md", BAND_FILL[index])}
            style={{ left: position(band.low), width: `calc(${position(band.high)} - ${position(band.low)})` }} />
        ))}
        <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-ink-3" style={{ left: position(0) }} />
        <span aria-hidden className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: position(trip.expected) }} />
      </div>
      <div aria-hidden className="tnum relative mt-1 h-4 text-[0.6875rem] text-ink-3">
        <span className="absolute left-0">{signedMoney(bands.at(-1)!.low)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: position(0) }}>$0</span>
        <span className="absolute right-0">{signedMoney(bands.at(-1)!.high)}</span>
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-3 sm:gap-3">
        {bands.map((band, index) => (
          <li key={band.label} className="flex items-baseline justify-between gap-2 sm:block">
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><span aria-hidden className={cx("h-2.5 w-2.5 rounded-sm", BAND_FILL[bands.length - 1 - index])} />{band.label}</span>
            <span className="tnum block font-medium">{signedMoney(band.low)} to {signedMoney(band.high)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What one trip of a chosen length is likely to look like: ranges, percentiles, losses, goals and ruin. */
export function TripCard({ calc, trip, className }: { calc: Calc; trip: TripOutlook; className?: string }) {
  const { config, edit, pricing } = calc;
  const [loss, setLoss] = useState(1000);
  const [goal, setGoal] = useState(1000);
  const betting = !pricing.noBets;
  return (
    <Panel id="trip" eyebrow="Trip outlook" title="What happens on your trip" sub="One trip of this length with this game, bankroll and ramp. Ranges, not limits: luck dominates short trips." className={className}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,16.5rem)_minmax(0,1fr)] sm:items-start">
        <div>
          <NumberField label="Trip length" value={config.hours} min={0.25} max={100000} suffix="hours" field="hours_played" hint={`${count(trip.rounds)} rounds at ${count(config.handsPerHour)} an hour.`} onChange={(hours) => edit({ hours })} />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Common trip lengths">
            {HOUR_PRESETS.map((hours) => (
              <button key={hours} type="button" aria-pressed={config.hours === hours} onClick={() => edit({ hours })}
                className={cx("tnum h-11 min-w-11 rounded-lg border px-2 text-sm font-semibold sm:h-9", config.hours === hours ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface-2 text-ink-2 hover:text-ink")}>
                {hours}h
              </button>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure label="Expected result" tone={betting && trip.expected < 0 ? "neg" : undefined} value={betting ? signedMoney(trip.expected) : "—"} sub={`±${money(trip.standardDeviation)} one standard deviation`} />
          <Figure label="Ending bankroll" value={betting ? money(trip.endingBankroll) : "—"} sub={`from ${money(config.bankroll)}, on average`} />
          <Figure label="Chance of finishing ahead" value={betting ? percent(trip.chanceAhead, 1) : "—"} />
          <Figure label="Chance of a loss" value={betting ? percent(trip.chanceOfLoss, 1) : "—"} />
        </dl>
      </div>

      {betting ? (
        <>
          <OutcomeRange trip={trip} />
          <h3 className="mt-5 text-sm font-semibold">How trips like this end</h3>
          <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
            {trip.percentiles.map((point) => (
              <li key={point.percentile} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium">{point.label}</span> <span className="text-ink-3">· {point.detail}</span></span>
                <span className={cx("tnum shrink-0 font-semibold", point.value < 0 ? "text-neg" : "text-ink")}>{signedMoney(point.value)}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <NumberField label="Chance of losing at least" value={loss} min={0} prefix="$" field="loss_threshold" onChange={setLoss} />
              <p className="tnum mt-2 text-2xl font-semibold">{percent(trip.lossAtLeast(loss), 1)}</p>
              <Note>The trip ends down {money(loss)} or more.</Note>
            </div>
            <div className="rounded-xl border border-line p-3">
              <NumberField label="Chance of being up" value={goal} min={0} prefix="$" field="win_goal" onChange={setGoal} />
              <p className="tnum mt-2 text-2xl font-semibold">{percent(trip.reachesGoal(goal), 1)}</p>
              <Note>At some point during the trip, not only at the end.</Note>
            </div>
          </div>
          <p className="mt-4 text-sm">Chance of going broke on this trip: <b className="tnum">{chance(trip.riskOfRuin)}</b> <span className="text-ink-3">(lifetime: {percent(pricing.result.riskOfRuin)})</span></p>
          <Note className="mt-1">A normal approximation, not a card-by-card simulation. It can understate the chance of busting when the bankroll is only a few top bets deep.</Note>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-2">You are not betting at any count, so there is no trip result to show.</p>
      )}
    </Panel>
  );
}
