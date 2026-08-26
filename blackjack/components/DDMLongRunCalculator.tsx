"use client";

import { useMemo, useState } from "react";
import { Metric, NumberField, Panel, Select } from "@/components/ui";
import { calculateDDMLongRun, DDM_PROFILES, reweightMainRamp, type CustomRamp } from "@/lib/ddm/longRun";

const money = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits })
  : "No finite amount";
const signedMoney = (value: number, digits = 2) => Number.isFinite(value) ? `${value >= 0 ? "+" : "−"}${money(Math.abs(value), digits)}` : "—";
const integer = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString() : "∞";
const percentage = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const riskLabel = (value: number) => value > 0 && value < 0.0001 ? "<0.01%" : percentage(value, 2);

export function DDMLongRunCalculator() {
  const [profileId, setProfileId] = useState("main");
  const [unit, setUnit] = useState(10);
  const [bankroll, setBankroll] = useState(10_000);
  const [roundsPerHour, setRoundsPerHour] = useState(100);
  const [hours, setHours] = useState(4);
  const [targetRisk, setTargetRisk] = useState(0.05);
  const [customRamp, setCustomRamp] = useState<CustomRamp>([1, 3, 7, 11, 15, 16]);
  const profile = useMemo(() => profileId === "custom" ? reweightMainRamp(customRamp) : DDM_PROFILES.find((item) => item.id === profileId) ?? DDM_PROFILES[0], [customRamp, profileId]);
  const result = useMemo(() => calculateDDMLongRun(profile, { unit, bankroll, roundsPerHour, hours, targetRisk }), [bankroll, hours, profile, roundsPerHour, targetRisk, unit]);
  const maxUnits = Math.max(...profile.ramp.map((row) => row[1]));
  const positive = profile.evPerRound > 0;

  return (
    <div className="mt-5 space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-400">Audited long-run calculator</p><h2 className="mt-2 text-xl font-semibold">Game, stakes, and time</h2></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">One occupied spot · six decks · V1 H17</span></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_repeat(3,1fr)]">
          <Select label="Simulation profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="custom">Custom ramp · main indexed game</option>{DDM_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
          <NumberField label="Base betting unit" prefix="$" min={0.01} step={1} value={unit} onValueChange={(value) => setUnit(Math.max(0.01, value))} />
          <NumberField label="Bankroll" prefix="$" min={1} step={100} value={bankroll} onValueChange={(value) => setBankroll(Math.max(1, value))} />
          <NumberField label="Rounds per hour" min={1} max={500} value={roundsPerHour} onValueChange={(value) => setRoundsPerHour(Math.max(1, value))} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Session / trip hours" min={0.25} step={0.25} value={hours} onValueChange={(value) => setHours(Math.max(0.25, value))} />
          <Select label="Target lifetime risk" value={targetRisk} onChange={(event) => setTargetRisk(Number(event.target.value))}><option value={0.01}>1%</option><option value={0.025}>2.5%</option><option value={0.05}>5%</option><option value={0.1}>10%</option><option value={0.135}>13.5% · SCORE convention</option><option value={0.2}>20%</option></Select>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Minimum → maximum</p><p className="mt-2 font-semibold">{money(unit, 2)} → {money(unit * maxUnits, 2)}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Average initial bet</p><p className="mt-2 font-semibold">{money(result.averageBet, 2)}</p></div>
        </div>
        {profileId === "custom" && <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.025] p-4"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Custom ramp units</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{["TC ≤ 0", "TC +1", "TC +2", "TC +3", "TC +4", "TC +5+"].map((label, index) => <NumberField key={label} label={label} min={0} max={100} step={1} value={customRamp[index]} onValueChange={(value) => setCustomRamp((ramp) => { const next: number[] = [...ramp]; next[index] = Math.max(0, value); return next as unknown as CustomRamp; })} />)}</div><p className="mt-3 text-xs leading-5 text-zinc-500">Zero units models sitting out that bucket. Bets do not have to be monotone, though a practical casino ramp usually is.</p></div>}
        <p className="mt-4 text-sm leading-6 text-zinc-400">{profile.description}</p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hourly EV" value={`${signedMoney(result.evPerHour)}/hr`} sub={`simulation 95% CI ±${money(result.simulationCiPerHour)}/hr`} />
        <Metric label="Hourly standard deviation" value={`${money(result.sdPerHour)}/hr`} sub={`${money(result.sdPerRound)} per round`} />
        <Metric label="N₀" value={integer(result.n0)} sub={positive ? `${integer(result.n0Hours)} hours at this speed` : "Undefined for non-positive EV"} />
        <Metric label="SCORE" value={result.score.toFixed(2)} sub="Standard scale-independent SCORE" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-semibold">{hours.toLocaleString()}-hour result distribution</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-zinc-500">Expected result</p><p className={`mt-2 text-lg font-semibold ${result.tripEv >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedMoney(result.tripEv)}</p></div>
            <div><p className="text-xs text-zinc-500">Standard deviation</p><p className="mt-2 text-lg font-semibold">{money(result.tripSd)}</p></div>
            <div><p className="text-xs text-zinc-500">Chance of profit</p><p className="mt-2 text-lg font-semibold">{percentage(result.chanceOfProfit, 1)}</p></div>
            <div><p className="text-xs text-zinc-500">Trip ruin risk</p><p className="mt-2 text-lg font-semibold">{riskLabel(result.tripRisk)}</p></div>
          </div>
          <div className="mt-5 rounded-xl bg-black/20 p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-zinc-500">Approximate 95% ending-result interval</span><b>{signedMoney(result.lower95, 0)} to {signedMoney(result.upper95, 0)}</b></div></div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">The result interval and chance of profit use the same normal approximation as CountLab&apos;s blackjack calculator. Trip risk estimates touching zero before the session ends, not merely finishing below zero.</p>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">Bankroll and lifetime risk</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Current lifetime RoR</p><p className={`mt-2 text-xl font-semibold ${result.lifetimeRisk <= targetRisk ? "text-emerald-300" : "text-amber-300"}`}>{riskLabel(result.lifetimeRisk)}</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Target bankroll</p><p className="mt-2 text-xl font-semibold">{money(result.requiredBankroll, 0)}</p><p className="mt-1 text-xs text-zinc-600">for {percentage(targetRisk, 1)} lifetime RoR</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Risk-sized unit</p><p className="mt-2 text-xl font-semibold">{positive ? money(result.riskSizedUnit) : "$0.00"}</p><p className="mt-1 text-xs text-zinc-600">with current bankroll</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Edge / initial bet</p><p className={`mt-2 text-xl font-semibold ${result.edgePerUnitBet >= 0 ? "text-emerald-300" : "text-red-300"}`}>{percentage(result.edgePerUnitBet, 3)}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Lifetime risk is the standard positive-drift diffusion approximation. A negative-EV profile has no finite bankroll that creates a positive-EV lifetime game.</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel>
          <h2 className="font-semibold">Betting ramp</h2>
          <div className="mt-4 space-y-2">{profile.ramp.length === 1 ? <div className="flex justify-between rounded-xl bg-black/20 px-4 py-3 text-sm"><span className="text-zinc-500">Every round</span><b>1 unit</b></div> : profile.ramp.map(([threshold, units], index) => <div key={threshold} className="flex justify-between rounded-xl bg-black/20 px-4 py-3 text-sm"><span className="text-zinc-500">{index === 0 ? "TC ≤ 0" : `TC +${threshold}${index === profile.ramp.length - 1 ? " or higher" : ""}`}</span><b>{units} unit{units === 1 ? "" : "s"}</b></div>)}</div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Profile audit</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-zinc-500">Rounds sampled</dt><dd className="mt-1 font-semibold">{profile.rounds.toLocaleString()}</dd></div>
            <div><dt className="text-xs text-zinc-500">Penetration</dt><dd className="mt-1 font-semibold">{profile.cutDecks === null ? "CSM" : `${6 - profile.cutDecks} decks dealt`}</dd></div>
            <div><dt className="text-xs text-zinc-500">Count</dt><dd className="mt-1 font-semibold">{profile.count}</dd></div>
            <div><dt className="text-xs text-zinc-500">Policy</dt><dd className="mt-1 font-semibold">{profile.policy}</dd></div>
            <div><dt className="text-xs text-zinc-500">EV / base unit / round</dt><dd className="mt-1 font-semibold">{profile.evPerRound >= 0 ? "+" : ""}{profile.evPerRound.toFixed(6)}</dd></div>
            <div><dt className="text-xs text-zinc-500">SD / base unit / round</dt><dd className="mt-1 font-semibold">{Math.sqrt(profile.variancePerRound).toFixed(4)}</dd></div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-zinc-500">The selected profile&apos;s mean and variance come directly from the recorded seeded simulation, then scale exactly with unit and square-root time. No interpolation is performed between penetration, count-resolution, ramp, or policy profiles.</p>
        </Panel>
      </div>
    </div>
  );
}
