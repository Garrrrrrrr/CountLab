"use client";
import { useMemo, useState } from "react";
import {
  calculateAdvantage,
  COUNT_PROFILE,
  DEFAULT_ADVANTAGE_RULES,
  RAMPS,
  RampPoint,
  recommendUnit,
  unitsAt,
} from "@/lib/blackjack/advantage";
import {
  COEFFICIENT_METADATA,
  GAME_OPTIONS,
} from "@/lib/blackjack/coefficients";
import { GhostButton, Metric, NumberField, Panel, Select } from "./ui";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
const pct = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(3)}%`;
const expand = (ramp: RampPoint[]) =>
  COUNT_PROFILE.map(({ tc }) => ({ trueCount: tc, units: unitsAt(tc, ramp) }));
export function AdvantageCalculator() {
  const [bankroll, setBankroll] = useState(10000),
    [unit, setUnit] = useState(10),
    [rph, setRph] = useState(100),
    [hours, setHours] = useState(4),
    [targetRisk, setTargetRisk] = useState(0.05),
    [spread, setSpread] = useState("1-8"),
    [ramp, setRamp] = useState<RampPoint[]>(() => expand(RAMPS["1-8"])),
    [decks, setDecks] = useState<6 | 8>(6),
    [dealt, setDealt] = useState(4.5);
  const rules = useMemo(
    () => ({ ...DEFAULT_ADVANTAGE_RULES, decks, penetration: dealt / decks }),
    [decks, dealt],
  );
  const result = useMemo(
      () =>
        calculateAdvantage({
          bankroll,
          bettingUnit: unit,
          handsPerHour: rph,
          hours,
          rules,
          ramp,
        }),
      [bankroll, unit, rph, hours, rules, ramp],
    ),
    recommended = recommendUnit(bankroll, targetRisk, rules, ramp);
  const selectSpread = (name: string) => {
    setSpread(name);
    setRamp(expand(RAMPS[name]));
  };
  const updateBet = (tc: number, dollars: number) => {
    setSpread("Custom");
    setRamp((current) =>
      current.map((point) =>
        point.trueCount === tc
          ? { ...point, units: unit ? dollars / unit : 0 }
          : point,
      ),
    );
  };
  return (
    <>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
          Precomputed coefficient calculator
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          EV, Variance & Risk of Ruin
        </h1>
        <p className="mt-2 max-w-4xl text-zinc-400">
          Reproducible per-count simulation coefficients from 100 million shoes
          per penetration profile. Changing a dollar bet re-aggregates the same
          frequency, advantage, and standard-deviation observations without
          rerunning the simulation in your browser.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <h2 className="mb-5 font-semibold">Exact ruleset</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white/[.04] p-4">
              <p className="text-xs text-zinc-500">Shoe</p>
              <b>
                {decks} decks · {dealt} dealt
              </b>
            </div>
            <div className="rounded-xl bg-white/[.04] p-4">
              <p className="text-xs text-zinc-500">Rules</p>
              <b>H17 · DAS · RSA · LS</b>
            </div>
            <div className="rounded-xl bg-white/[.04] p-4">
              <p className="text-xs text-zinc-500">Play</p>
              <b>Hi-Lo · documented H17 index policy</b>
            </div>
            <div className="rounded-xl bg-white/[.04] p-4">
              <p className="text-xs text-zinc-500">Table</p>
              <b>Peek · 3:2 · 4 hands</b>
            </div>
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 font-semibold">Bankroll & pace</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Number of decks"
              value={decks}
              onChange={(event) => {
                const nextDecks = Number(event.target.value) as 6 | 8;
                setDecks(nextDecks);
                setDealt(nextDecks === 6 ? 4.5 : 6);
              }}
            >
              <option value={6}>6 decks</option>
              <option value={8}>8 decks</option>
            </Select>
            <Select
              label="Penetration"
              value={dealt}
              onChange={(event) => setDealt(Number(event.target.value))}
            >
              {GAME_OPTIONS[decks].map((option) => (
                <option key={option.dealt} value={option.dealt}>
                  {option.label} ({Math.round((option.dealt / decks) * 100)}%)
                </option>
              ))}
            </Select>
            <NumberField
              label="Betting unit"
              value={unit}
              min={0}
              prefix="$"
              onValueChange={setUnit}
            />
            <NumberField
              label="Bankroll"
              value={bankroll}
              min={1}
              prefix="$"
              onValueChange={setBankroll}
            />
            <NumberField
              label="Rounds per hour"
              value={rph}
              min={1}
              onValueChange={setRph}
            />
            <NumberField
              label="Session hours"
              value={hours}
              min={0.5}
              step={0.5}
              onValueChange={setHours}
            />
            <Select
              label="Ramp preset"
              value={spread}
              onChange={(event) => selectSpread(event.target.value)}
            >
              {Object.keys(RAMPS).map((name) => (
                <option key={name}>{name}</option>
              ))}
              {spread === "Custom" && <option>Custom</option>}
            </Select>
            <Select
              label="Recommender target RoR"
              value={targetRisk}
              onChange={(event) => setTargetRisk(+event.target.value)}
            >
              <option value={0.01}>1%</option>
              <option value={0.025}>2.5%</option>
              <option value={0.05}>5%</option>
              <option value={0.1}>10%</option>
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100% (no ceiling)</option>
            </Select>
          </div>
        </Panel>
      </div>
      <Panel className="mt-5 md:overflow-x-auto">
        <div className="mb-5">
          <div>
            <h2 className="font-semibold">True-count bet ramp</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Edit any dollar bet. The fixed coefficients include their sample
              counts and 95% Monte Carlo uncertainty.
            </p>
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          {result.rows.map((row) => (
            <article key={row.trueCount} className="rounded-2xl bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">True count</p>
                  <b className="mt-1 block text-xl">{row.label}</b>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Advantage</p>
                  <b className={row.advantage >= 0 ? "text-emerald-400" : "text-red-300"}>{pct(row.advantage)}</b>
                  <p className="mt-1 text-xs text-zinc-500">{(row.frequency * 100).toFixed(3)}% frequency</p>
                </div>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <p className="mb-2 text-xs font-medium text-zinc-400">Dollar bet</p>
                  <NumberField ariaLabel={`Bet at true count ${row.label}`} value={Math.round(row.bet * 100) / 100} min={0} prefix="$" onValueChange={(value) => updateBet(row.trueCount, value)} />
                </div>
                {row.trueCount < 0 && <GhostButton aria-label={`Set bet at true count ${row.label} to zero`} className="shrink-0 px-3 text-xs" disabled={row.bet === 0} onClick={() => updateBet(row.trueCount, 0)}>{row.bet === 0 ? "$0 set" : "Set $0"}</GhostButton>}
              </div>
              <details className="mt-3 border-t border-white/[.06] pt-3 text-xs text-zinc-500">
                <summary className="min-h-11 cursor-pointer py-3 font-medium text-zinc-400">Simulation details</summary>
                <dl className="grid grid-cols-2 gap-2 pb-1">
                  <dt>95% error</dt><dd className="text-right">±{(1.95996398454 * row.standardError * 100).toFixed(3)}%</dd>
                  <dt>SD units</dt><dd className="text-right">{row.sdUnits.toFixed(3)}</dd>
                  <dt>Samples</dt><dd className="text-right">{(row.samples / 1_000_000).toFixed(1)}M</dd>
                </dl>
              </details>
            </article>
          ))}
        </div>
        <table className="hidden w-full min-w-[940px] text-right text-sm md:table">
          <thead className="text-zinc-500">
            <tr>
              <th className="pb-3 text-left">True count</th>
              <th className="pb-3">Frequency</th>
              <th className="pb-3">Advantage</th>
              <th className="pb-3">95% error</th>
              <th className="pb-3">SD units</th>
              <th className="pb-3">Samples</th>
              <th className="pb-3">Bet</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.trueCount} className="border-t border-white/[.06]">
                <td className="py-2.5 text-left font-medium">{row.label}</td>
                <td>{(row.frequency * 100).toFixed(3)}%</td>
                <td
                  className={
                    row.advantage >= 0 ? "text-emerald-400" : "text-red-300"
                  }
                >
                  {pct(row.advantage)}
                </td>
                <td>±{(1.95996398454 * row.standardError * 100).toFixed(3)}%</td>
                <td>{row.sdUnits.toFixed(3)}</td>
                <td>{(row.samples / 1_000_000).toFixed(1)}M</td>
                <td className="py-2.5">
                  <div className="ml-auto flex w-fit items-center justify-end gap-2">
                    <NumberField
                      ariaLabel={`Bet at true count ${row.label}`}
                      value={Math.round(row.bet * 100) / 100}
                      min={0}
                      prefix="$"
                      className="w-32"
                      onValueChange={(value) => updateBet(row.trueCount, value)}
                    />
                    {row.trueCount < 0 && (
                      <GhostButton
                        aria-label={`Set bet at true count ${row.label} to zero`}
                        className="min-h-11 whitespace-nowrap px-3 text-xs"
                        disabled={row.bet === 0}
                        onClick={() => updateBet(row.trueCount, 0)}
                      >
                        {row.bet === 0 ? "$0 set" : "Set $0"}
                      </GhostButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Average bet" value={money(result.averageBet)} />
        <Metric label="Player edge" value={pct(result.playerEdge)} />
        <Metric label="EV / round" value={money(result.evPerRound)} />
        <Metric label="EV / hour" value={money(result.hourlyEv)} />
        <Metric label="SD / round" value={money(result.sdPerRound)} />
        <Metric label="SD / hour" value={money(result.sdPerHour)} />
        <Metric
          label="Risk of ruin"
          value={`${(result.riskOfRuin * 100).toFixed(2)}%`}
        />
        <Metric
          label="N₀"
          value={
            Number.isFinite(result.nZeroHours)
              ? `${Math.round(result.nZeroHours).toLocaleString()} hr`
              : "Not available"
          }
        />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="font-semibold">Session projection</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-zinc-500">Expected value</p>
              <p className="text-2xl font-semibold">{money(result.tripEv)}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">One standard deviation</p>
              <p className="text-2xl font-semibold">
                ± {money(result.standardDeviation)}
              </p>
            </div>
          </div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Bankroll recommender</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            At a {Math.round(targetRisk * 100)}% target lifetime RoR, the
            maximum base unit for this ramp is{" "}
            <b className="text-emerald-300">
              {recommended === Infinity
                ? "No limit"
                : recommended > 0
                  ? money(recommended)
                  : "Not available"}
            </b>
            .
          </p>
        </Panel>
      </div>
      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Method: EV is the frequency-weighted conditional return. Variance uses
        both within-count variance and between-count mean differences. Lifetime
        RoR uses the standard diffusion approximation exp(−2 × bankroll × EV /
        variance), not an exact finite-bankroll simulation. Generated from{" "}
        {COEFFICIENT_METADATA.totalRounds.toLocaleString()} resolved rounds for
        the displayed rules. {" "}
        <a
          className="text-emerald-400 hover:underline"
          href={COEFFICIENT_METADATA.dataUrl}
          target="_blank"
          rel="noreferrer"
        >
          Download audit data ↗
        </a>
      </p>
    </>
  );
}
