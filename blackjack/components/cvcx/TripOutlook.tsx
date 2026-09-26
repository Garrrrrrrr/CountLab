"use client";

import { chance, count, DASH, money, percent, signedMoney } from "@/lib/blackjack/labFormat";
import { HelpTip, NumberField, Panel } from "@/components/ui";
import type { Lab } from "./useLab";

const RANGES = [
  { label: "2 in 3 trips", z: 1, strength: 62 },
  { label: "9 in 10 trips", z: 1.645, strength: 36 },
  { label: "19 in 20 trips", z: 1.96, strength: 18 },
] as const;

type Band = { label: string; low: number; high: number; strength: number };

/**
 * Nested ranges on one axis: the widest, palest band holds 19 in 20 trips, the
 * darkest 2 in 3. A dot marks the expected result and a dashed line marks
 * breaking even. The same ranges are listed as text beside it.
 */
function OutcomeRange({ expected, bands, ariaLabel }: { expected: number; bands: Band[]; ariaLabel: string }) {
  const low = Math.min(0, ...bands.map((band) => band.low));
  const high = Math.max(0, ...bands.map((band) => band.high));
  const pad = (high - low) * 0.04 || 1;
  const position = (value: number) => `${((value - (low - pad)) / (high - low + 2 * pad)) * 100}%`;
  return (
    <div role="img" aria-label={ariaLabel} className="mt-4">
      <div className="relative h-12">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-[var(--rule)]" />
        {[...bands].reverse().map((band) => (
          <span key={band.label} aria-hidden="true" className="absolute top-1/2 h-5 -translate-y-1/2 rounded-md" style={{ left: position(band.low), width: `calc(${position(band.high)} - ${position(band.low)})`, background: `color-mix(in srgb, var(--accent) ${band.strength}%, transparent)` }} />
        ))}
        <span aria-hidden="true" className="absolute inset-y-0 border-l border-dashed border-[var(--ink-muted)]" style={{ left: position(0) }} />
        <span aria-hidden="true" className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper-raised)] bg-[var(--ink)]" style={{ left: position(expected) }} />
      </div>
      <div aria-hidden="true" className="relative mt-1 h-4 font-data text-[.68rem] text-[var(--ink-muted)]">
        <span className="absolute left-0">{signedMoney(bands.at(-1)!.low)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: position(0) }}>$0</span>
        <span className="absolute right-0">{signedMoney(bands.at(-1)!.high)}</span>
      </div>
    </div>
  );
}

/** What one trip of a chosen length looks like, plus the figures experienced counters compare games by. */
export function TripOutlook({ lab, className = "" }: { lab: Lab; className?: string }) {
  const { config, model, edit } = lab;
  const { result } = model;
  const rounds = config.handsPerHour * config.hours;
  const bands = RANGES.map((range) => ({ label: range.label, strength: range.strength, low: result.tripEv - range.z * result.standardDeviation, high: result.tripEv + range.z * result.standardDeviation }));
  const betting = !model.noBets;
  return (
    <Panel id="trip" aria-labelledby="trip-title" className={`lab-card scroll-mt-20 ${className}`}>
      <h2 id="trip-title" className="font-display text-lg font-semibold">Trip outlook</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">What one trip of this length is likely to look like with your game, bankroll and ramp.</p>

      <div className="lab-fields mt-4">
        <NumberField label="Trip length" value={config.hours} min={0.1} inputStep="any" suffix="hours" analyticsField="hours_played" help={`${count(rounds)} rounds at ${count(config.handsPerHour)} rounds an hour.`} onValueChange={(hours) => edit({ hours })} />
        <dl className="grid content-start text-sm">
          <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule)] py-2.5">
            <dt className="text-[var(--ink-muted)]">Expected result</dt>
            <dd className={`font-data text-lg font-semibold ${betting && result.tripEv < 0 ? "text-[var(--negative)]" : ""}`}>{betting ? signedMoney(result.tripEv) : DASH}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-[var(--ink-muted)]">Chance of finishing ahead</dt>
            <dd className="font-data text-lg font-semibold">{betting ? percent(result.chanceOfProfit, 1) : DASH}</dd>
          </div>
        </dl>
      </div>

      {betting ? (
        <>
          <OutcomeRange expected={result.tripEv} bands={bands} ariaLabel={`Trip results: ${bands.map((band) => `${band.label} between ${signedMoney(band.low)} and ${signedMoney(band.high)}`).join("; ")}. Expected ${signedMoney(result.tripEv)}.`} />
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-3 sm:gap-3">
            {bands.map((band) => (
              <li key={band.label} className="flex items-baseline gap-2 sm:block">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)]"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: `color-mix(in srgb, var(--accent) ${band.strength}%, transparent)` }} />{band.label}</span>
                <span className="block font-data">{signedMoney(band.low)} to {signedMoney(band.high)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">These are ranges, not limits: about 1 trip in 20 lands outside the widest one.</p>
          <p className="mt-2 text-sm">Chance of going broke on this trip: <b className="font-data">{chance(result.tripRiskOfRuin)}</b></p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">You aren&apos;t betting at any count, so there is no trip result to show.</p>
      )}

      <h3 className="mt-5 border-t border-[var(--rule)] pt-4 text-sm font-semibold">Expert figures</h3>
      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1 text-xs font-medium text-[var(--ink-muted)]">N₀<HelpTip label="N₀">Rounds until your expected win equals one standard deviation: roughly how long before skill outweighs luck. Smaller is better.</HelpTip></dt>
          <dd className="font-data text-base font-semibold">{betting && Number.isFinite(result.nZeroRounds) ? `${count(result.nZeroRounds)} rounds` : DASH}</dd>
          <dd className="text-xs text-[var(--ink-muted)]">{betting && Number.isFinite(result.nZeroHours) ? `about ${count(result.nZeroHours)} hours` : "needs an edge"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs font-medium text-[var(--ink-muted)]">SCORE<HelpTip label="SCORE">Expected win per 100 rounds with a $10,000 bankroll at 13.5% risk of ruin. It compares games regardless of stakes; higher is better.</HelpTip></dt>
          <dd className="font-data text-base font-semibold">{betting ? money(result.cScore) : DASH}</dd>
          <dd className="text-xs text-[var(--ink-muted)]">per 100 rounds</dd>
        </div>
      </dl>
    </Panel>
  );
}
