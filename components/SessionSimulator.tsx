"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_ADVANTAGE_RULES, RAMPS, RampPoint, unitsAt } from "@/lib/blackjack/advantage";
import { COEFFICIENT_METADATA, GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { SavedSimulationRun, simulationLibrary, SimulationTemplate } from "@/lib/blackjack/simulationLibrary";
import type { SessionSimulationConfig, SessionSimulationResult } from "@/lib/blackjack/sessionSimulation";
import { Button, GhostButton, Metric, NumberField, Panel, Select } from "./ui";

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const compact = (value: number) => Math.round(value).toLocaleString();
const expandRamp = (ramp: RampPoint[]) => Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, units: unitsAt(index - 8, ramp) }));
const rampsMatch = (first: RampPoint[], second: RampPoint[]) => {
  const expandedFirst = expandRamp(first);
  const expandedSecond = expandRamp(second);
  return expandedFirst.every((point, index) => point.units === expandedSecond[index].units);
};
const savedDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

type WorkerMessage =
  | { kind: "progress"; id: number; completed: number; total: number }
  | { kind: "result"; id: number; result: SessionSimulationResult }
  | { kind: "cancelled"; id: number }
  | { kind: "error"; id: number; error: string };

export function SessionSimulator() {
  const [bankroll, setBankroll] = useState(10_000);
  const [unit, setUnit] = useState(25);
  const [roundsPerHour, setRoundsPerHour] = useState(100);
  const [playerHands, setPlayerHands] = useState(1);
  const [rounds, setRounds] = useState(100_000);
  const [paths, setPaths] = useState(50);
  const [seed, setSeed] = useState("countlab-2026");
  const [decks, setDecks] = useState<6 | 8>(6);
  const [dealt, setDealt] = useState(4.5);
  const [spread, setSpread] = useState("1-8");
  const [ramp, setRamp] = useState<RampPoint[]>(() => expandRamp(RAMPS["1-8"]));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SessionSimulationResult>();
  const [error, setError] = useState<string>();
  const [analysisName, setAnalysisName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [savedRuns, setSavedRuns] = useState<SavedSimulationRun[]>([]);
  const [templates, setTemplates] = useState<SimulationTemplate[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string>();
  const [libraryNotice, setLibraryNotice] = useState<string>();
  const workerRef = useRef<Worker | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const pendingRun = useRef<{ config: SessionSimulationConfig; name: string } | undefined>(undefined);
  const rules = useMemo(() => ({ ...DEFAULT_ADVANTAGE_RULES, decks, penetration: dealt / decks }), [decks, dealt]);
  const config = useMemo<SessionSimulationConfig>(() => ({ bankroll, bettingUnit: unit, playerHands, rounds, paths, roundsPerHour, seed: seed.trim() || "countlab", rules, ramp }), [bankroll, unit, playerHands, rounds, paths, roundsPerHour, seed, rules, ramp]);
  const comparedRuns = useMemo(() => selectedRunIds.map((id) => savedRuns.find((run) => run.id === id)).filter((run): run is SavedSimulationRun => Boolean(run)), [savedRuns, selectedRunIds]);

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    const refresh = () => {
      setSavedRuns(simulationLibrary.runs());
      setTemplates(simulationLibrary.templates());
    };
    refresh();
    addEventListener(simulationLibrary.event, refresh);
    return () => removeEventListener(simulationLibrary.event, refresh);
  }, []);

  const getWorker = () => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/sessionSimulation.worker.ts", import.meta.url));
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.id !== requestId.current) return;
        if (message.kind === "progress") setProgress(message.completed / message.total);
        if (message.kind === "result") {
          setResult(message.result); setProgress(1); setRunning(false);
          const pending = pendingRun.current;
          if (pending) {
            const saved = simulationLibrary.addRun(pending.config, message.result, pending.name);
            setCurrentRunId(saved.id);
            setAnalysisName(saved.name);
            pendingRun.current = undefined;
          }
        }
        if (message.kind === "cancelled") { setRunning(false); setProgress(0); }
        if (message.kind === "error") { setError(message.error); setRunning(false); }
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  };

  const run = () => {
    const id = ++requestId.current;
    pendingRun.current = { config, name: analysisName };
    setError(undefined); setResult(undefined); setProgress(0); setRunning(true);
    getWorker().postMessage({ kind: "start", id, config });
  };
  const cancel = () => workerRef.current?.postMessage({ kind: "cancel", id: requestId.current });
  const chooseSpread = (name: string) => {
    setSpread(name);
    if (RAMPS[name]) setRamp(expandRamp(RAMPS[name]));
  };
  const updateRamp = (trueCount: number, units: number) => {
    setSpread("Custom");
    setRamp((current) => current.map((point) => {
      const matches = point.trueCount === trueCount
        || (trueCount === -1 && point.trueCount < -1)
        || (trueCount === 6 && point.trueCount > 6);
      return matches ? { ...point, units: Math.max(0, units) } : point;
    }));
  };
  const applyConfig = (next: SessionSimulationConfig) => {
    const nextDecks = next.rules.decks === 8 ? 8 : 6;
    setBankroll(next.bankroll);
    setUnit(next.bettingUnit);
    setPlayerHands(next.playerHands);
    setRounds(next.rounds);
    setPaths(next.paths);
    setRoundsPerHour(next.roundsPerHour);
    setSeed(next.seed);
    setDecks(nextDecks);
    setDealt(Number((next.rules.penetration * nextDecks).toFixed(2)));
    setRamp(expandRamp(next.ramp));
    setSpread(Object.entries(RAMPS).find(([, candidate]) => rampsMatch(next.ramp, candidate))?.[0] ?? "Custom");
    setError(undefined);
  };
  const saveTemplate = () => {
    const saved = simulationLibrary.saveTemplate(config, templateName);
    setTemplateName(saved.name);
  };
  const loadRun = (saved: SavedSimulationRun) => {
    applyConfig(saved.config);
    setResult(saved.result);
    setAnalysisName(saved.name);
    setCurrentRunId(saved.id);
    setProgress(1);
  };
  const toggleComparison = (id: string) => setSelectedRunIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id]);
  const exportLibrary = () => {
    const url = URL.createObjectURL(new Blob([simulationLibrary.exportData()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `countlab-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setLibraryNotice("Analysis library exported.");
  };
  const importLibrary = async (file?: File) => {
    if (!file) return;
    try {
      const imported = simulationLibrary.importData(await file.text());
      setLibraryNotice(`Imported ${imported.runs} run${imported.runs === 1 ? "" : "s"} and ${imported.templates} setup${imported.templates === 1 ? "" : "s"}.`);
    } catch (importError) {
      setLibraryNotice(importError instanceof Error ? importError.message : "The analysis library could not be imported.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };
  const modeledOutcomes = rounds * paths;
  const maxAction = unit * playerHands * Math.max(...ramp.map((point) => point.units));

  return (
    <>
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Analysis · Monte Carlo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.03em] sm:text-4xl">Session Simulator</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">Model bankroll variance across reproducible paths and see exactly which counts create—or consume—your EV.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          <span className="rounded-full border border-white/[.08] bg-white/[.04] px-3 py-1.5">H17 · DAS · RSA · LS</span>
          <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-3 py-1.5 text-emerald-300">Audited Hi-Lo profiles</span>
        </div>
      </div>

      <details className="surface group mb-5 rounded-2xl border border-amber-300/10 px-4 py-3 open:bg-amber-300/[.025]">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-3 text-sm font-medium text-zinc-200 marker:hidden">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><i className="fa-solid fa-circle-info" /></span>
          <span className="flex-1">Profile-based model and assumptions</span>
          <span className="hidden text-xs font-normal text-zinc-500 sm:inline">What this simulation does</span>
          <i className="fa-solid fa-chevron-down text-xs text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-3 border-t border-white/[.06] pt-3 text-sm leading-6 text-zinc-400">Each round samples audited 6D/8D H17 Hi-Lo true-count frequencies and conditional payoff moments, then applies your ramp. This fast model does not yet reproduce card-by-card shoe order or shoe replays. Multi-hand variance uses the documented conditional-independence approximation.</p>
      </details>

      <Panel className="overflow-hidden p-0">
        <div className="p-4 sm:p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-300/10 text-sm font-bold text-emerald-300">1</span>
            <div><h2 className="font-semibold">Game and session</h2><p className="text-xs text-zinc-500">Choose an audited profile and the experiment size.</p></div>
          </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Select label="Decks" value={decks} disabled={running} onChange={(event) => { const next = Number(event.target.value) as 6 | 8; setDecks(next); setDealt(GAME_OPTIONS[next][1].dealt); }}><option value={6}>6 decks</option><option value={8}>8 decks</option></Select>
              <Select label="Penetration" value={dealt} disabled={running} onChange={(event) => setDealt(Number(event.target.value))}>{GAME_OPTIONS[decks].map((option) => <option key={option.dealt} value={option.dealt}>{option.dealt} / {decks} dealt</option>)}</Select>
              <NumberField label="Starting bankroll" value={bankroll} min={1} prefix="$" disabled={running} onValueChange={setBankroll} />
              <NumberField label="Betting unit" value={unit} min={0.01} prefix="$" disabled={running} onValueChange={setUnit} />
              <Select label="Rounds per path" value={rounds} disabled={running} onChange={(event) => setRounds(Number(event.target.value))}>{[10_000, 100_000, 1_000_000].map((value) => <option key={value} value={value}>{value === 1_000_000 ? "1M" : `${value / 1000}K`} rounds</option>)}</Select>
              <Select label="Independent paths" value={paths} disabled={running} onChange={(event) => setPaths(Number(event.target.value))}>{[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value} paths</option>)}</Select>
              <NumberField label="Rounds per hour" value={roundsPerHour} min={1} disabled={running} onValueChange={setRoundsPerHour} />
              <Select label="Simultaneous hands" value={playerHands} disabled={running} onChange={(event) => setPlayerHands(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}</Select>
              <label className="col-span-2 grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400 lg:col-span-2">Analysis name<input value={analysisName} disabled={running} onChange={(event) => setAnalysisName(event.target.value)} placeholder="Generated automatically if blank" className="field min-h-11 min-w-0 rounded-xl px-3 text-zinc-100 outline-none placeholder:text-zinc-600" /></label>
              <label className="col-span-2 grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400 lg:col-span-2">Deterministic seed<input value={seed} disabled={running} onChange={(event) => setSeed(event.target.value)} className="field min-h-11 min-w-0 rounded-xl px-3 text-zinc-100 outline-none" /></label>
            </div>
        </div>

        <div className="border-t border-white/[.06] p-4 sm:p-5 md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-300/10 text-sm font-bold text-emerald-300">2</span><div><h2 className="font-semibold">Bet ramp</h2><p className="text-xs text-zinc-500">Units wagered per hand at each floored true count.</p></div></div>
            <div className="w-full sm:w-48"><Select label="Preset" value={spread} disabled={running} onChange={(event) => chooseSpread(event.target.value)}>{Object.keys(RAMPS).map((name) => <option key={name}>{name}</option>)}{spread === "Custom" && <option>Custom</option>}</Select></div>
          </div>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">{ramp.filter((point) => point.trueCount >= -1 && point.trueCount <= 6).map((point) => <NumberField key={point.trueCount} label={`TC ${point.trueCount > 0 ? "+" : ""}${point.trueCount}`} value={point.units} min={0} step={1} disabled={running} onValueChange={(value) => updateRamp(point.trueCount, value)} />)}</div>
          <p className="mt-3 text-xs text-zinc-500">−1 covers all lower counts; +6 covers all higher counts. Set a bucket to 0 to Wong out.</p>
        </div>

        <div className="border-t border-white/[.06] bg-black/15 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="grid flex-1 grid-cols-3 gap-2 text-xs"><div><p className="text-zinc-600">Workload</p><b className="mt-1 block text-zinc-300">{compact(modeledOutcomes)} rounds</b></div><div><p className="text-zinc-600">Hours / path</p><b className="mt-1 block text-zinc-300">{compact(rounds / roundsPerHour)}</b></div><div><p className="text-zinc-600">Max action</p><b className="mt-1 block text-zinc-300">{money(maxAction)}</b></div></div>
            <div className="flex gap-2 lg:w-[24rem]"><Button onClick={run} disabled={running} className="flex-1"><i className="fa-solid fa-play mr-2 text-xs" />Run simulation</Button>{running && <GhostButton onClick={cancel}>Cancel</GhostButton>}</div>
          </div>
          {(running || progress > 0) && <div className="mt-4"><div className="mb-2 flex justify-between text-xs text-zinc-500"><span>{running ? "Simulating in worker…" : "Complete"}</span><span>{percent(progress, 0)}</span></div><div className="h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${progress * 100}%` }} /></div></div>}
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        </div>
      </Panel>

      <details className="surface group mt-5 rounded-2xl border border-white/[.07]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 marker:hidden sm:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-300/10 text-sky-300"><i className="fa-solid fa-floppy-disk" /></span>
          <div className="min-w-0 flex-1"><h2 className="font-semibold">Saved analysis</h2><p className="truncate text-xs text-zinc-500">{templates.length} setup{templates.length === 1 ? "" : "s"} · {savedRuns.length} completed run{savedRuns.length === 1 ? "" : "s"}</p></div>
          <i className="fa-solid fa-chevron-down text-xs text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-white/[.06] p-4 sm:p-5">
          <div className="mb-5 flex flex-col justify-between gap-3 border-b border-white/[.06] pb-4 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-zinc-500">Stored only in this browser. Export a portable backup before clearing site data.</p>
            <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={exportLibrary} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-download mr-2" />Export</button><button type="button" onClick={() => importInputRef.current?.click()} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-upload mr-2" />Import</button><input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void importLibrary(event.target.files?.[0])} className="hidden" />{libraryNotice && <span role="status" className="text-xs text-emerald-300">{libraryNotice}</span>}</div>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(16rem,.75fr)_minmax(0,2fr)]">
            <section>
              <h3 className="text-sm font-semibold">Reusable setups</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Save the current rules, ramp, bankroll, and simulation size.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Setup name" className="field min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
                <GhostButton onClick={saveTemplate} disabled={running}><i className="fa-solid fa-plus mr-2" />Save setup</GhostButton>
              </div>
              <div className="mt-3 space-y-2">
                {templates.length === 0 && <p className="rounded-xl border border-dashed border-white/[.08] p-3 text-xs text-zinc-600">No saved setups yet.</p>}
                {templates.map((template) => <div key={template.id} className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-black/10 p-2.5"><button type="button" onClick={() => { applyConfig(template.config); setTemplateName(template.name); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-zinc-200">{template.name}</span><span className="text-xs text-zinc-600">{template.config.rules.decks}D · {Math.round(template.config.rules.penetration * 100)}% · {template.config.playerHands} spot{template.config.playerHands === 1 ? "" : "s"}</span></button><button type="button" aria-label={`Delete ${template.name}`} onClick={() => { if (confirm(`Delete setup “${template.name}”?`)) simulationLibrary.deleteTemplate(template.id); }} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/10 hover:text-red-300"><i className="fa-solid fa-trash-can" /></button></div>)}
              </div>
            </section>

            <section className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Completed runs</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Runs save automatically. Select any two to compare.</p></div>{selectedRunIds.length > 0 && <button type="button" onClick={() => setSelectedRunIds([])} className="text-xs font-medium text-zinc-500 hover:text-zinc-200">Clear comparison</button>}</div>
              {savedRuns.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-white/[.08] p-4 text-sm text-zinc-600">Your first completed simulation will appear here automatically.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="text-[.7rem] uppercase tracking-wide text-zinc-600"><tr><th className="pb-2 pr-3">Compare</th><th className="pb-2">Name</th><th className="pb-2">Created</th><th className="pb-2 text-right">EV / hour</th><th className="pb-2 text-right">Avg action</th><th className="pb-2 text-right">Actions</th></tr></thead><tbody>{savedRuns.map((saved) => <tr key={saved.id} className={`border-t border-white/[.06] ${saved.id === currentRunId ? "bg-emerald-300/[.025]" : ""}`}><td className="py-2.5 pr-3"><input type="checkbox" checked={selectedRunIds.includes(saved.id)} onChange={() => toggleComparison(saved.id)} aria-label={`Compare ${saved.name}`} className="h-4 w-4 accent-emerald-400" /></td><td className="py-2.5 pr-3"><input value={saved.name} onChange={(event) => setSavedRuns((current) => current.map((item) => item.id === saved.id ? { ...item, name: event.target.value } : item))} onBlur={(event) => simulationLibrary.renameRun(saved.id, event.target.value)} className="w-full min-w-40 bg-transparent font-medium text-zinc-200 outline-none focus:text-emerald-300" /></td><td className="whitespace-nowrap py-2.5 pr-3 text-xs text-zinc-500">{savedDate(saved.createdAt)}</td><td className="whitespace-nowrap py-2.5 text-right font-medium text-emerald-300">{money(saved.result.expectedHourlyEv, 2)}</td><td className="whitespace-nowrap py-2.5 text-right">{money(saved.result.averageBet, 2)}</td><td className="whitespace-nowrap py-2.5 text-right"><button type="button" onClick={() => loadRun(saved)} className="px-2 py-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Load</button><button type="button" onClick={() => simulationLibrary.duplicateRun(saved.id)} className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200">Duplicate</button><button type="button" aria-label={`Delete ${saved.name}`} onClick={() => { if (confirm(`Delete analysis “${saved.name}”?`)) { simulationLibrary.deleteRun(saved.id); setSelectedRunIds((current) => current.filter((id) => id !== saved.id)); if (currentRunId === saved.id) setCurrentRunId(undefined); } }} className="px-2 py-1 text-xs text-zinc-600 hover:text-red-300">Delete</button></td></tr>)}</tbody></table></div>}
            </section>
          </div>

          {comparedRuns.length === 2 && <div className="mt-6 border-t border-white/[.06] pt-5"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-300/10 text-violet-300"><i className="fa-solid fa-code-compare" /></span><div><h3 className="text-sm font-semibold">Run comparison</h3><p className="text-xs text-zinc-500">The difference column is the second run minus the first.</p></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[38rem] text-sm"><thead><tr className="text-left text-xs text-zinc-500"><th className="pb-2">Metric</th><th className="pb-2">{comparedRuns[0].name}</th><th className="pb-2">{comparedRuns[1].name}</th><th className="pb-2">Difference</th></tr></thead><tbody>{[
            ["Expected EV / hour", comparedRuns[0].result.expectedHourlyEv, comparedRuns[1].result.expectedHourlyEv, money, 1],
            ["Simulated EV / round", comparedRuns[0].result.simulatedEvPerRound, comparedRuns[1].result.simulatedEvPerRound, (value: number) => money(value, 3), 1],
            ["Average action", comparedRuns[0].result.averageBet, comparedRuns[1].result.averageBet, (value: number) => money(value, 2), 0],
            ["Chance of profit", comparedRuns[0].result.chanceOfProfit, comparedRuns[1].result.chanceOfProfit, (value: number) => percent(value, 1), 1],
            ["Crossed zero", comparedRuns[0].result.ruinCrossingRate, comparedRuns[1].result.ruinCrossingRate, (value: number) => percent(value, 2), -1],
            ["Average max drawdown", comparedRuns[0].result.averageMaxDrawdown, comparedRuns[1].result.averageMaxDrawdown, money, -1],
          ].map(([label, first, second, format, direction]) => { const formatter = format as (value: number) => string; const delta = Number(second) - Number(first); const score = delta * Number(direction); return <tr key={String(label)} className="border-t border-white/[.06]"><th className="py-3 text-left font-medium text-zinc-400">{String(label)}</th><td>{formatter(Number(first))}</td><td>{formatter(Number(second))}</td><td className={score > 0 ? "text-emerald-300" : score < 0 ? "text-red-300" : "text-zinc-500"}>{delta > 0 ? "+" : ""}{formatter(delta)}</td></tr>; })}</tbody></table></div></div>}
        </div>
      </details>

      <div className="mt-5 space-y-5">
          {!result && <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-white/[.09] bg-white/[.02] p-4 sm:flex-row sm:items-center sm:p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-300"><i className="fa-solid fa-chart-line" /></span><div><h2 className="font-semibold">Results appear here</h2><p className="mt-1 text-sm text-zinc-500">Expectation, uncertainty, bankroll percentiles, drawdown, and TC contribution.</p></div></div><span className="rounded-full bg-white/[.04] px-3 py-1.5 text-xs text-zinc-500">No simulated data yet</span></div>}
          {result && <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric label="Expected hourly EV" value={money(result.expectedHourlyEv, 2)} sub={`${money(result.expectedEvPerRound, 3)} / round`} />
              <Metric label="Simulated EV / round" value={money(result.simulatedEvPerRound, 3)} sub={`95% CI ${money(result.simulatedCi95[0], 3)} to ${money(result.simulatedCi95[1], 3)}`} />
              <Metric label="Average action" value={money(result.averageBet, 2)} sub={`${playerHands} simultaneous hand${playerHands === 1 ? "" : "s"}`} />
              <Metric label="Median ending bankroll" value={money(result.medianEndingBankroll)} sub={`P10 ${money(result.endingBankrollP10)} · P90 ${money(result.endingBankrollP90)}`} />
              <Metric label="Chance of profit" value={percent(result.chanceOfProfit, 1)} sub={`${result.paths} independent paths`} />
              <Metric label="Crossed zero" value={percent(result.ruinCrossingRate, 2)} sub={`Avg max drawdown ${money(result.averageMaxDrawdown)}`} />
            </div>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">One reproducible sample path</h2><p className="mt-1 text-xs text-zinc-500">Seed {result.seed} · context only; percentiles above summarize all paths.</p></div><span className="rounded-full bg-white/[.05] px-3 py-1 text-xs text-zinc-400">{compact(result.observations)} observations</span></div>
              <div className="mt-5 h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={result.samplePath} margin={{ left: 8, right: 8 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="round" stroke="#71717a" tickFormatter={compact} minTickGap={35} /><YAxis stroke="#71717a" tickFormatter={(value) => `$${Math.round(value / 1000)}k`} width={52} /><Tooltip formatter={(value) => money(Number(value))} labelFormatter={(value) => `Round ${compact(Number(value))}`} contentStyle={{ background: "#101411", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} /><Line type="monotone" dataKey="bankroll" stroke="#86efac" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
            </Panel>
            <Panel>
              <h2 className="text-lg font-semibold">True-count frequency and EV contribution</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Expected frequency and edge come from the audited profile. Simulated frequency is a seeded sampling check. Contribution is expected dollars per observed round.</p>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-zinc-500"><tr><th className="pb-3">TC</th><th>Expected freq.</th><th>Simulated freq.</th><th>Player edge</th><th>Total wager</th><th>EV contribution</th></tr></thead><tbody>{result.countBreakdown.map((row) => <tr key={row.trueCount} className="border-t border-white/[.06]"><td className="py-3 font-medium">{row.label}</td><td>{percent(row.frequency, 2)}</td><td>{percent(row.simulatedFrequency, 2)}</td><td className={row.playerEdge >= 0 ? "text-emerald-300" : "text-red-300"}>{row.playerEdge >= 0 ? "+" : ""}{percent(row.playerEdge, 3)}</td><td>{money(row.wager, 2)}</td><td className={row.evContribution >= 0 ? "text-emerald-300" : "text-red-300"}>{money(row.evContribution, 4)}</td></tr>)}</tbody></table></div>
            </Panel>
          </>}
      </div>
      <p className="mt-6 text-xs leading-5 text-zinc-600">Audit basis: {COEFFICIENT_METADATA.totalRounds.toLocaleString()} resolved rounds · source seed {COEFFICIENT_METADATA.seed} · coefficient uncertainty remains separate from this session sampler&apos;s Monte Carlo standard error. A single path may go below zero because the expected-value process is shown without forced bankroll resizing; “crossed zero” records that event.</p>
    </>
  );
}
