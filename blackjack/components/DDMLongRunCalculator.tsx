"use client";

import { useMemo, useState } from "react";
import { GhostButton, Metric, NumberField, Panel, Select } from "@/components/ui";
import {
  calculateDDMLongRun,
  DDM_RAMP_PRESETS,
  DDM_SOURCE_PROFILES,
  DDM_TRUE_COUNTS,
  ddmRampWithWonging,
  getDDMSourceProfile,
  reweightDDMProfile,
  type DDMPolicy,
  type DDMRamp,
  type DDMTcMode,
} from "@/lib/ddm/longRun";

const money = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits })
  : "No finite amount";
const signedMoney = (value: number, digits = 2) => Number.isFinite(value) ? `${value >= 0 ? "+" : "−"}${money(Math.abs(value), digits)}` : "—";
const integer = (value: number) => Number.isFinite(value) ? Math.round(value).toLocaleString() : "∞";
const percentage = (value: number, digits = 2, signed = false) => `${signed && value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
const riskLabel = (value: number) => value > 0 && value < 0.0001 ? "<0.01%" : percentage(value, 2);
const unitLabel = (value: number) => value % 1 === 0 ? String(value) : value.toFixed(2);
const dealtLabel = (cutDecks: number) => Number((6 - cutDecks).toFixed(2));

const penetrationOptions = DDM_SOURCE_PROFILES
  .filter((profile) => profile.tcMode === "exact" && profile.policy === "indices" && profile.cutDecks !== null)
  .map((profile) => profile.cutDecks as number)
  .filter((cutDecks, index, values) => values.indexOf(cutDecks) === index)
  .sort((left, right) => left - right);

const sourceFile = (path: string) => path.split("/").at(-1) ?? path;

export function DDMLongRunCalculator() {
  const [cutDecks, setCutDecks] = useState<number | null>(1);
  const [tcMode, setTcMode] = useState<DDMTcMode>("exact");
  const [policy, setPolicy] = useState<DDMPolicy>("indices");
  const [unit, setUnit] = useState(10);
  const [bankroll, setBankroll] = useState(10_000);
  const [roundsPerHour, setRoundsPerHour] = useState(100);
  const [hours, setHours] = useState(4);
  const [targetRisk, setTargetRisk] = useState(0.05);
  const [rampName, setRampName] = useState<keyof typeof DDM_RAMP_PRESETS | "Custom">("Recommended");
  const [wongInAt, setWongInAt] = useState<number | null>(null);
  const [ramp, setRamp] = useState<DDMRamp>(() => [...DDM_RAMP_PRESETS.Recommended]);

  const source = useMemo(() => {
    const selected = getDDMSourceProfile({ cutDecks, tcMode, policy });
    if (!selected) throw new Error(`Missing audited DDM profile for cut=${cutDecks}, TC=${tcMode}, policy=${policy}`);
    return selected;
  }, [cutDecks, policy, tcMode]);
  const effectiveRamp = source.tcMode === "none" ? DDM_RAMP_PRESETS.Flat : ramp;
  const profile = useMemo(() => reweightDDMProfile(source, effectiveRamp), [effectiveRamp, source]);
  const result = useMemo(() => calculateDDMLongRun(profile, { unit, bankroll, roundsPerHour, hours, targetRisk }), [bankroll, hours, profile, roundsPerHour, targetRisk, unit]);
  const playedUnits = profile.ramp.map((row) => row[1]).filter((value) => value > 0);
  const minUnits = playedUnits.length ? Math.min(...playedUnits) : 0;
  const maxUnits = playedUnits.length ? Math.max(...playedUnits) : 0;
  const positive = profile.evPerRound > 0;
  const maxFrequency = Math.max(...profile.buckets.map((bucket) => bucket.frequency));

  const applyPreset = (name: keyof typeof DDM_RAMP_PRESETS) => {
    setRampName(name);
    setRamp(ddmRampWithWonging(DDM_RAMP_PRESETS[name], wongInAt));
  };
  const changeWonging = (enterAt: number | null) => {
    setWongInAt(enterAt);
    setRamp((current) => DDM_TRUE_COUNTS.map((tc, index) => {
      if (enterAt !== null && tc < enterAt) return 0;
      return current[index] > 0 ? current[index] : DDM_RAMP_PRESETS.Recommended[index];
    }));
    setRampName("Custom");
  };
  const changeBet = (tc: number, value: number) => {
    setRamp((current) => current.map((units, index) => DDM_TRUE_COUNTS[index] === tc ? Math.max(0, value) : units));
    setRampName("Custom");
    setWongInAt(null);
  };
  const scaleRamp = (factor: number) => {
    setRamp((current) => current.map((value) => Math.round(value * factor * 100) / 100));
    setRampName("Custom");
  };

  return (
    <div className="mt-5 space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-400">Simulation-backed scenario builder</p><h2 className="mt-2 text-xl font-semibold">Game, bankroll, and pace</h2></div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">One occupied spot · six decks · V1 H17</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Shoe penetration" value={cutDecks === null ? "csm" : cutDecks} onChange={(event) => {
            if (event.target.value === "csm") {
              setCutDecks(null); setTcMode("none"); setPolicy("basic"); setWongInAt(null);
            } else {
              const next = Number(event.target.value);
              setCutDecks(next); setTcMode("exact"); setPolicy("indices");
            }
          }}>
            {penetrationOptions.map((cut) => <option key={cut} value={cut}>{dealtLabel(cut)} decks dealt · {percentage((6 - cut) / 6, 1)}</option>)}
            <option value="csm">Continuous shuffler</option>
          </Select>
          <Select label="Deck estimation" value={tcMode} disabled={cutDecks !== 1} onChange={(event) => {
            const next = event.target.value as DDMTcMode;
            setTcMode(next); if (next !== "exact") setPolicy("indices");
          }}>
            <option value="exact">Exact decks remaining</option>
            <option value="half">Nearest half deck</option>
            <option value="full">Nearest full deck</option>
            {cutDecks === null && <option value="none">No count · CSM</option>}
          </Select>
          <Select label="Playing strategy" value={policy} disabled={cutDecks !== 1 || tcMode !== "exact"} onChange={(event) => setPolicy(event.target.value as DDMPolicy)}>
            <option value="indices">Insurance + 18 deviations</option>
            <option value="insurance">Insurance +4 only</option>
            <option value="basic">Basic strategy only</option>
          </Select>
          <NumberField label="Base betting unit" prefix="$" min={0.01} step={1} value={unit} onValueChange={(value) => setUnit(Math.max(0.01, value))} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Bankroll" prefix="$" min={1} step={100} value={bankroll} onValueChange={(value) => setBankroll(Math.max(1, value))} />
          <NumberField label="Observed rounds / hour" min={1} max={500} value={roundsPerHour} onValueChange={(value) => setRoundsPerHour(Math.max(1, value))} />
          <NumberField label="Session / trip hours" min={0.25} step={0.25} value={hours} onValueChange={(value) => setHours(Math.max(0.25, value))} />
          <Select label="Target lifetime risk" value={targetRisk} onChange={(event) => setTargetRisk(Number(event.target.value))}>
            <option value={0.01}>1%</option><option value={0.025}>2.5%</option><option value={0.05}>5%</option><option value={0.1}>10%</option><option value={0.135}>13.5% · SCORE convention</option><option value={0.2}>20%</option>
          </Select>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-400">Only independently simulated combinations are selectable. Changing penetration resets deck estimation and strategy to the audited exact-TC, full-index package.</p>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[.14em] text-sky-400">Bet spread</p><h2 className="mt-2 text-lg font-semibold">Wager at every true count</h2><p className="mt-2 max-w-2xl text-sm text-zinc-500">Enter unit multiples. A zero wager watches that count without playing it; hourly results still use observed table rounds.</p></div>
          {source.tcMode !== "none" && <div className="flex flex-wrap gap-2"><GhostButton onClick={() => scaleRamp(0.5)}>½X</GhostButton><GhostButton onClick={() => scaleRamp(2)}>2X</GhostButton><GhostButton onClick={() => applyPreset("Recommended")}>Reset</GhostButton></div>}
        </div>
        {source.tcMode === "none" ? (
          <div className="mt-5 rounded-xl border border-white/[.07] bg-black/20 p-4 text-sm text-zinc-400">A CSM has no persistent true count, so the calculator uses a flat one-unit wager. Change the dollar amount with Base betting unit above.</div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select label="Spread preset" value={rampName} onChange={(event) => event.target.value !== "Custom" && applyPreset(event.target.value as keyof typeof DDM_RAMP_PRESETS)}>
                {Object.keys(DDM_RAMP_PRESETS).map((name) => <option key={name} value={name}>{name}</option>)}
                {rampName === "Custom" && <option value="Custom">Custom</option>}
              </Select>
              <Select label="Enter the game at" value={wongInAt ?? "play-all"} onChange={(event) => changeWonging(event.target.value === "play-all" ? null : Number(event.target.value))}>
                <option value="play-all">Play every count</option><option value={0}>TC 0+</option><option value={1}>TC +1+</option><option value={2}>TC +2+</option><option value={3}>TC +3+</option>
              </Select>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Played spread</p><p className="mt-2 font-semibold">{playedUnits.length ? `${unitLabel(minUnits)}–${unitLabel(maxUnits)} units` : "No wagers"}</p><p className="mt-1 text-xs text-zinc-600">{money(minUnits * unit)} → {money(maxUnits * unit)}</p></div>
              <div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Rounds played</p><p className="mt-2 font-semibold">{percentage(profile.playedFrequency, 1)}</p><p className="mt-1 text-xs text-zinc-600">≈ {integer(profile.playedFrequency * roundsPerHour)} per hour</p></div>
            </div>
            <div className="mt-5 grid gap-2.5 md:hidden">
              {profile.buckets.map((bucket) => (
                <div key={bucket.tc} className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-base font-bold ${bucket.tc < 0 ? "text-red-400" : bucket.tc > 0 ? "text-emerald-300" : "text-zinc-300"}`}>{bucket.label}</span>
                    <span className="text-right text-xs text-zinc-500">{percentage(bucket.frequency, 2)} freq · <span className={bucket.unitEv >= 0 ? "text-emerald-300" : "text-red-300"}>{percentage(bucket.unitEv, 3, true)}</span></span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <NumberField ariaLabel={`Bet units at true count ${bucket.label}`} value={Math.round(bucket.units * 100) / 100} min={0} max={100} step={0.25} className="flex-1" onValueChange={(value) => changeBet(bucket.tc, value)} />
                    <button type="button" aria-label={`Zero bet at true count ${bucket.label}`} disabled={bucket.units === 0} onClick={() => changeBet(bucket.tc, 0)} className="min-h-11 shrink-0 rounded-lg border border-red-400/20 bg-red-400/[.06] px-3 text-xs font-semibold text-red-300 hover:bg-red-400/[.12] disabled:opacity-30">Zero</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{money(bucket.units * unit)} wager</span><span className={bucket.evContribution >= 0 ? "text-emerald-300" : "text-red-300"}>{signedMoney(bucket.evContribution * unit, 3)} / observed round</span></div>
                </div>
              ))}
            </div>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-right text-sm">
                <thead className="text-zinc-500"><tr><th className="pb-3 text-left">True count</th><th className="pb-3">Frequency</th><th className="pb-3">Edge / unit</th><th className="pb-3 text-left">Bet units</th><th className="pb-3">Wager</th><th className="pb-3">EV / observed round</th></tr></thead>
                <tbody>{profile.buckets.map((bucket) => (
                  <tr key={bucket.tc} className="border-t border-white/[.06]">
                    <td className={`py-2.5 text-left font-bold ${bucket.tc < 0 ? "text-red-400" : bucket.tc > 0 ? "text-emerald-300" : "text-zinc-300"}`}>{bucket.label}</td>
                    <td><span className="inline-flex min-w-24 items-center justify-end gap-2"><span className="h-1.5 rounded-full bg-sky-400/60" style={{ width: `${Math.max(2, (bucket.frequency / maxFrequency) * 42)}px` }} />{percentage(bucket.frequency, 2)}</span></td>
                    <td className={bucket.unitEv >= 0 ? "text-emerald-300" : "text-red-300"}>{percentage(bucket.unitEv, 3, true)}</td>
                    <td className="py-2 text-left"><div className="flex items-center gap-2"><NumberField ariaLabel={`Bet units at true count ${bucket.label}`} value={Math.round(bucket.units * 100) / 100} min={0} max={100} step={0.25} className="w-24" onValueChange={(value) => changeBet(bucket.tc, value)} /><button type="button" aria-label={`Zero bet at true count ${bucket.label}`} disabled={bucket.units === 0} onClick={() => changeBet(bucket.tc, 0)} className="min-h-9 rounded-lg border border-red-400/20 bg-red-400/[.06] px-2.5 text-xs font-semibold text-red-300 hover:bg-red-400/[.12] disabled:opacity-30">Zero</button></div></td>
                    <td>{money(bucket.units * unit)}</td>
                    <td className={bucket.evContribution >= 0 ? "text-emerald-300" : "text-red-300"}>{signedMoney(bucket.evContribution * unit, 3)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hourly EV" value={`${signedMoney(result.evPerHour)}/hr`} sub={`simulation 95% CI ±${money(result.simulationCiPerHour)}/hr`} />
        <Metric label="Hourly standard deviation" value={`${money(result.sdPerHour)}/hr`} sub={`${money(result.sdPerRound)} per observed round`} />
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
          <p className="mt-4 text-xs leading-5 text-zinc-500">The interval and chance of profit use the same normal approximation as CountLab&apos;s blackjack calculator. Trip risk estimates touching zero before the session ends.</p>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">Bankroll and lifetime risk</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Current lifetime RoR</p><p className={`mt-2 text-xl font-semibold ${result.lifetimeRisk <= targetRisk ? "text-emerald-300" : "text-amber-300"}`}>{riskLabel(result.lifetimeRisk)}</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Target bankroll</p><p className="mt-2 text-xl font-semibold">{money(result.requiredBankroll, 0)}</p><p className="mt-1 text-xs text-zinc-600">for {percentage(targetRisk, 1)} lifetime RoR</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Risk-sized unit</p><p className="mt-2 text-xl font-semibold">{positive ? money(result.riskSizedUnit) : "$0.00"}</p><p className="mt-1 text-xs text-zinc-600">with current bankroll</p></div>
            <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Average initial bet</p><p className="mt-2 text-xl font-semibold">{money(result.averageBet)}</p><p className="mt-1 text-xs text-zinc-600">{percentage(result.edgePerUnitBet, 3, true)} edge / action</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Lifetime risk is the standard positive-drift diffusion approximation. A non-positive game has no finite bankroll solution.</p>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Scenario audit</h2><p className="mt-2 text-sm text-zinc-500">{profile.description}</p></div><span className={`rounded-full px-3 py-1 text-xs ${Math.abs(profile.evPerRound) > profile.ci95 ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{Math.abs(profile.evPerRound) > profile.ci95 ? "EV exceeds simulation CI" : "EV overlaps simulation noise"}</span></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 xl:grid-cols-6">
          <div><dt className="text-xs text-zinc-500">Rounds sampled</dt><dd className="mt-1 font-semibold">{profile.rounds.toLocaleString()}</dd></div>
          <div><dt className="text-xs text-zinc-500">Penetration</dt><dd className="mt-1 font-semibold">{profile.cutDecks === null ? "CSM" : `${6 - profile.cutDecks} decks dealt`}</dd></div>
          <div><dt className="text-xs text-zinc-500">Count</dt><dd className="mt-1 font-semibold">{profile.count}</dd></div>
          <div><dt className="text-xs text-zinc-500">Policy</dt><dd className="mt-1 font-semibold">{profile.policy}</dd></div>
          <div><dt className="text-xs text-zinc-500">EV / unit / round</dt><dd className="mt-1 font-semibold">{profile.evPerRound >= 0 ? "+" : ""}{profile.evPerRound.toFixed(6)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Source</dt><dd className="mt-1 truncate font-semibold" title={profile.source}>{sourceFile(profile.source)}</dd></div>
        </dl>
        <p className="mt-5 text-xs leading-5 text-zinc-500">Mean and second moment are recomputed from the selected simulation&apos;s composition-conditioned TC buckets. Wagers scale outcome means linearly and second moments quadratically, including insurance and every redouble. No blackjack coefficients or penetration interpolation are used.</p>
      </Panel>
    </div>
  );
}
