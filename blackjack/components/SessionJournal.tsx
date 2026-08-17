"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_ADVANTAGE_RULES, RAMPS, RampPoint, unitsAt } from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { Bankroll, BankrollTransaction, JournalSession, journalLibrary, sessionsInRange } from "@/lib/blackjack/journal";
import { track } from "@/lib/analytics/track";
import { useFormAnalytics } from "@/lib/analytics/react";
import {
  JournalAggregate,
  SessionAssessment,
  aggregateJournal,
  classifySessionAssessment,
  currentBankroll,
  journalCumulativeSeries,
  sessionZScore,
  theoreticalSessionOutcome,
} from "@/lib/blackjack/journalAnalysis";
import { simulationLibrary } from "@/lib/blackjack/simulationLibrary";
import { venuePresetLibrary, VenuePreset } from "@/lib/blackjack/venuePresets";
import { simulateShoeSession, ShoeSimulationResult } from "@/lib/blackjack/shoeSimulation";
import { Button, GhostButton, Metric, MobileActionDock, NumberField, Panel, Select } from "./ui";
import { ConfirmModal } from "./ConfirmModal";
import { ShoeExplorer } from "./ShoeExplorer";
import { HandReplayer } from "./HandReplayer";
import { ShareCard } from "./ShareCard";

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "auto" }).format(value);
const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const shortDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
const expandRamp = (ramp: RampPoint[]) => Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, units: unitsAt(index - 8, ramp) }));

const ASSESSMENT_LABEL: Record<SessionAssessment, string> = {
  "insufficient-data": "Not enough data",
  "within-expected-range": "Within expected range",
  "better-than-expected": "Better than expected",
  "worse-than-expected": "Worse than expected",
  "outlier-high": "Statistical outlier (high)",
  "outlier-low": "Statistical outlier (low)",
};
const ASSESSMENT_COLOR: Record<SessionAssessment, string> = {
  "insufficient-data": "text-zinc-500",
  "within-expected-range": "text-zinc-300",
  "better-than-expected": "text-emerald-300",
  "worse-than-expected": "text-amber-300",
  "outlier-high": "text-emerald-300",
  "outlier-low": "text-red-300",
};

const RANGE_OPTIONS: [number | "all", string][] = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  ["all", "All time"],
];

function AssessmentBadge({ assessment }: { assessment: SessionAssessment }) {
  return (
    <span className={`text-xs font-semibold ${ASSESSMENT_COLOR[assessment]}`}>
      {ASSESSMENT_LABEL[assessment]}
    </span>
  );
}

export function SessionJournal() {
  const [sessions, setSessions] = useState<JournalSession[]>([]);
  const [transactions, setTransactions] = useState<BankrollTransaction[]>([]);
  const [bankrolls, setBankrolls] = useState<Bankroll[]>([]);
  const [selectedBankrollId, setSelectedBankrollId] = useState<string | "all">("all");
  const [newBankrollName, setNewBankrollName] = useState("");
  const [venuePresets, setVenuePresets] = useState<VenuePreset[]>([]);
  const [venuePresetName, setVenuePresetName] = useState("");
  const [shoeReplay, setShoeReplay] = useState<{ sessionId: string; result: ShoeSimulationResult }>();
  const [shoeReplayLoading, setShoeReplayLoading] = useState<string>();
  const [selectedShoeIndex, setSelectedShoeIndex] = useState<number>();
  const [shareSession, setShareSession] = useState<JournalSession>();
  const [range, setRange] = useState<number | "all">(30);
  const [notice, setNotice] = useState<string>();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importCsvInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "session"; id: string; date: string } | { kind: "transaction"; id: string } | { kind: "bankroll"; id: string; name: string }>();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState(4);
  const [handsPerHour, setHandsPerHour] = useState(100);
  const [playerHands, setPlayerHands] = useState(1);
  const [bettingUnit, setBettingUnit] = useState(25);
  const [decks, setDecks] = useState<6 | 8>(6);
  const [dealt, setDealt] = useState(4.5);
  const [spread, setSpread] = useState("1-8");
  const [ramp, setRamp] = useState<RampPoint[]>(() => expandRamp(RAMPS["1-8"]));
  const [netResult, setNetResult] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [notes, setNotes] = useState("");

  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionType, setTransactionType] = useState<"deposit" | "withdrawal">("deposit");
  const [transactionAmount, setTransactionAmount] = useState(500);
  const sessionForm = useFormAnalytics("journal_session");
  const transactionForm = useFormAnalytics("journal_transaction");

  useEffect(() => {
    const refresh = () => {
      setSessions(journalLibrary.sessions());
      setTransactions(journalLibrary.transactions());
      setBankrolls(journalLibrary.bankrolls());
    };
    refresh();
    addEventListener(journalLibrary.event, refresh);
    track("journal_history_viewed", { kind: "sessions" });
    return () => removeEventListener(journalLibrary.event, refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setVenuePresets(venuePresetLibrary.presets());
    refresh();
    addEventListener(venuePresetLibrary.event, refresh);
    return () => removeEventListener(venuePresetLibrary.event, refresh);
  }, []);

  const rules = useMemo(() => ({ ...DEFAULT_ADVANTAGE_RULES, decks, penetration: dealt / decks }), [decks, dealt]);
  const draftSession = useMemo(() => ({ rules, ramp, bettingUnit, playerHands, handsPerHour, hours }), [rules, ramp, bettingUnit, playerHands, handsPerHour, hours]);
  const draftOutcome = useMemo(() => theoreticalSessionOutcome(draftSession), [draftSession]);

  const scopedSessions = useMemo(() => selectedBankrollId === "all" ? sessions : sessions.filter((session) => session.bankrollId === selectedBankrollId), [sessions, selectedBankrollId]);
  const scopedTransactions = useMemo(() => selectedBankrollId === "all" ? transactions : transactions.filter((transaction) => transaction.bankrollId === selectedBankrollId), [transactions, selectedBankrollId]);
  const inRange = useMemo(() => sessionsInRange(scopedSessions, range), [scopedSessions, range]);
  const aggregate: JournalAggregate = useMemo(() => aggregateJournal(inRange), [inRange]);
  const cumulative = useMemo(() => journalCumulativeSeries(inRange), [inRange]);
  const bankroll = useMemo(() => currentBankroll(scopedSessions, scopedTransactions), [scopedSessions, scopedTransactions]);

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
  const applyTemplate = (id: string) => {
    const template = simulationLibrary.templates().find((item) => item.id === id);
    if (!template) return;
    const nextDecks = template.config.rules.decks === 8 ? 8 : 6;
    setDecks(nextDecks);
    setDealt(Number((template.config.rules.penetration * nextDecks).toFixed(2)));
    setBettingUnit(template.config.bettingUnit);
    setPlayerHands(template.config.playerHands);
    setHandsPerHour(template.config.roundsPerHour);
    setRamp(expandRamp(template.config.ramp));
    setSpread("Custom");
    track("journal_prefilled_from_template", { name: template.name });
  };
  const loadVenuePreset = (id: string) => {
    const preset = venuePresets.find((item) => item.id === id);
    if (!preset) return;
    const nextDecks = preset.rules.decks === 8 ? 8 : 6;
    setDecks(nextDecks);
    setDealt(Number((preset.rules.penetration * nextDecks).toFixed(2)));
    setRamp(expandRamp(preset.ramp));
    setSpread("Custom");
  };
  const saveVenuePreset = () => {
    const name = venuePresetName.trim();
    if (!name) return;
    venuePresetLibrary.savePreset(name, rules, ramp);
    setVenuePresetName("");
    setNotice(`Venue preset "${name}" saved.`);
  };
  const simulateSessionShoe = async (session: JournalSession) => {
    setShoeReplayLoading(session.id);
    setSelectedShoeIndex(undefined);
    try {
      const handsToSimulate = Math.max(1, Math.min(Math.round(session.handsPerHour * session.hours), 2000));
      const result = await simulateShoeSession({
        bankroll: 1_000_000_000,
        bettingUnit: session.bettingUnit,
        playerHands: session.playerHands,
        roundsPerHour: session.handsPerHour,
        handsToSimulate,
        highSpeed: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        rules: session.rules,
        ramp: session.ramp,
        deviationGroups: ["freebj"],
      });
      setShoeReplay({ sessionId: session.id, result });
    } finally {
      setShoeReplayLoading(undefined);
    }
  };

  const logSession = () => {
    sessionForm.submitted();
    journalLibrary.addSession({
      date,
      location: location.trim() || undefined,
      hours,
      handsPerHour,
      playerHands,
      bettingUnit,
      rules,
      ramp,
      netResult,
      expenses,
      notes: notes.trim() || undefined,
      bankrollId: selectedBankrollId === "all" ? undefined : selectedBankrollId,
    });
    setNetResult(0);
    setExpenses(0);
    setNotes("");
    setNotice("Session logged.");
    sessionForm.succeeded();
  };
  const logTransaction = () => {
    transactionForm.submitted();
    journalLibrary.addTransaction({ date: transactionDate, type: transactionType, amount: Math.abs(transactionAmount), bankrollId: selectedBankrollId === "all" ? undefined : selectedBankrollId });
    setNotice(`${transactionType === "deposit" ? "Deposit" : "Withdrawal"} recorded.`);
    transactionForm.succeeded();
  };
  const addBankroll = () => {
    const name = newBankrollName.trim();
    if (!name) return;
    const created = journalLibrary.addBankroll(name);
    setNewBankrollName("");
    setSelectedBankrollId(created.id);
    setNotice(`Bankroll "${name}" created.`);
  };
  const exportJournal = () => {
    const url = URL.createObjectURL(new Blob([journalLibrary.exportData()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `countlab-journal-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Journal exported.");
  };
  const importJournal = async (file?: File) => {
    if (!file) return;
    try {
      const imported = journalLibrary.importData(await file.text());
      setNotice(`Imported ${imported.sessions} session${imported.sessions === 1 ? "" : "s"} and ${imported.transactions} transaction${imported.transactions === 1 ? "" : "s"}.`);
    } catch (importError) {
      setNotice(importError instanceof Error ? importError.message : "The journal backup could not be imported.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };
  const downloadCsv = (csv: string, name: string) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `countlab-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportSessionsCsv = () => {
    downloadCsv(journalLibrary.exportSessionsCsv(), "journal-sessions");
    setNotice("Sessions exported as CSV.");
  };
  const exportTransactionsCsv = () => {
    downloadCsv(journalLibrary.exportTransactionsCsv(), "journal-transactions");
    setNotice("Transactions exported as CSV.");
  };
  const importSessionsCsv = async (file?: File) => {
    if (!file) return;
    try {
      const imported = journalLibrary.importSessionsCsv(await file.text());
      setNotice(`Imported ${imported} session${imported === 1 ? "" : "s"} from CSV.`);
    } catch (importError) {
      setNotice(importError instanceof Error ? importError.message : "The sessions CSV could not be imported.");
    } finally {
      if (importCsvInputRef.current) importCsvInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Journal · Bankroll</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.03em] sm:text-4xl">Session Journal</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">Log real results and compare them against the theoretical EV for the exact rules and ramp you played, not a generic benchmark.</p>
        </div>
        <Metric label="Current bankroll" value={money(bankroll, 0)} sub={`${scopedSessions.length} session${scopedSessions.length === 1 ? "" : "s"} logged`} />
      </div>

      <Panel className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-zinc-500">Bankroll</p>
            <div className="mt-2 max-w-xs">
              <Select label="" aria-label="Selected bankroll" value={selectedBankrollId} onChange={(event) => setSelectedBankrollId(event.target.value)}>
                <option value="all">All bankrolls</option>
                {bankrolls.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input value={newBankrollName} onChange={(event) => setNewBankrollName(event.target.value)} placeholder="New bankroll name" className="field min-h-11 min-w-0 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
            <GhostButton onClick={addBankroll} disabled={!newBankrollName.trim()}><i className="fa-solid fa-plus mr-2" />Add</GhostButton>
            {selectedBankrollId !== "all" && (
              <>
                <GhostButton
                  onClick={() => {
                    const current = bankrolls.find((item) => item.id === selectedBankrollId);
                    const name = current ? prompt("Rename bankroll", current.name) : null;
                    if (name?.trim()) journalLibrary.renameBankroll(selectedBankrollId, name.trim());
                  }}
                >
                  Rename
                </GhostButton>
                <GhostButton
                  className="text-red-300 hover:bg-red-400/10"
                  onClick={() => {
                    const current = bankrolls.find((item) => item.id === selectedBankrollId);
                    if (current) setPendingDelete({ kind: "bankroll", id: current.id, name: current.name });
                  }}
                >
                  Delete
                </GhostButton>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.7fr)]">
        <Panel>
          <div onChange={() => sessionForm.start("inputs")}>
          <h2 className="font-semibold">Log a session</h2>
          <p className="mt-1 text-xs text-zinc-500">Record the actual outcome. CountLab computes what that session was expected to earn from your rules and ramp.</p>
          {simulationLibrary.templates().length > 0 && (
            <div className="mt-4">
              <Select label="Prefill from a saved setup" defaultValue="" onChange={(event) => event.target.value && applyTemplate(event.target.value)}>
                <option value="">Choose a saved setup…</option>
                {simulationLibrary.templates().map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
            </div>
          )}
          <div className="mt-4">
            {venuePresets.length > 0 && (
              <Select label="Load a venue's rules and ramp" defaultValue="" onChange={(event) => event.target.value && loadVenuePreset(event.target.value)}>
                <option value="">Choose a venue…</option>
                {venuePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </Select>
            )}
            <div className="mt-2 flex gap-2">
              <input value={venuePresetName} onChange={(event) => setVenuePresetName(event.target.value)} placeholder="Venue name (e.g. Downtown casino)" className="field min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
              <GhostButton onClick={saveVenuePreset} disabled={!venuePresetName.trim()}>Save venue</GhostButton>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="field min-h-11 min-w-0 rounded-xl px-3 text-zinc-100 outline-none" /></label>
            <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400">Location (optional)<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Local only" className="field min-h-11 min-w-0 rounded-xl px-3 text-zinc-100 outline-none placeholder:text-zinc-600" /></label>
            <Select label="Decks" value={decks} onChange={(event) => { const next = Number(event.target.value) as 6 | 8; setDecks(next); setDealt(GAME_OPTIONS[next][1].dealt); }}><option value={6}>6 decks</option><option value={8}>8 decks</option></Select>
            <Select label="Penetration" value={dealt} onChange={(event) => setDealt(Number(event.target.value))}>{GAME_OPTIONS[decks].map((option) => <option key={option.dealt} value={option.dealt}>{option.dealt} / {decks} dealt</option>)}</Select>
            <NumberField label="Hours played" value={hours} min={0.1} step={0.5} onValueChange={setHours} />
            <NumberField label="Hands / hour" value={handsPerHour} min={1} onValueChange={setHandsPerHour} />
            <NumberField label="Betting unit" value={bettingUnit} min={0.01} prefix="$" onValueChange={setBettingUnit} />
            <Select label="Simultaneous hands" value={playerHands} onChange={(event) => setPlayerHands(Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}</Select>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-[.8rem] font-medium text-zinc-400">Ramp played</p><div className="w-40"><Select label="" aria-label="Ramp preset" value={spread} onChange={(event) => chooseSpread(event.target.value)}>{Object.keys(RAMPS).map((name) => <option key={name}>{name}</option>)}{spread === "Custom" && <option>Custom</option>}</Select></div></div>
            <div className="grid grid-cols-4 gap-2">{ramp.filter((point) => point.trueCount >= -1 && point.trueCount <= 6).map((point) => <NumberField key={point.trueCount} label={`TC ${point.trueCount > 0 ? "+" : ""}${point.trueCount}`} value={point.units} min={0} step={1} onValueChange={(value) => updateRamp(point.trueCount, value)} />)}</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField label="Actual net result" value={netResult} prefix="$" onValueChange={setNetResult} />
            <NumberField label="Expenses (comps, travel)" value={expenses} min={0} prefix="$" onValueChange={setExpenses} />
          </div>
          <label className="mt-3 grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400">Notes (optional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="field min-w-0 rounded-xl px-3 py-2.5 text-sm text-zinc-100 outline-none" /></label>
          <div className="mt-4 rounded-xl bg-emerald-400/[.07] p-4 text-sm leading-6 text-emerald-200">This session&apos;s theoretical EV is <b>{money(draftOutcome.tripEv, 2)}</b> with a standard deviation of <b>{money(draftOutcome.standardDeviation, 0)}</b>. A result inside {money(draftOutcome.tripEv - 1.96 * draftOutcome.standardDeviation, 0)} to {money(draftOutcome.tripEv + 1.96 * draftOutcome.standardDeviation, 0)} is normal variance, not a sign anything went right or wrong.</div>
          <Button className="mt-4 hidden w-full lg:block" onClick={logSession}><i className="fa-solid fa-plus mr-2 text-xs" />Log session</Button>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">Actual vs. theoretical EV</h2><p className="mt-1 text-xs text-zinc-500">Cumulative across logged sessions in range, with a 95% band from combined session variance.</p></div>
              <div className="flex gap-1 rounded-xl border border-white/[.08] bg-white/[.03] p-1">
                {RANGE_OPTIONS.map(([value, label]) => (
                  <button key={label} type="button" onClick={() => setRange(value)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${range === value ? "bg-emerald-300/15 text-emerald-300" : "text-zinc-500 hover:text-zinc-200"}`}>{label}</button>
                ))}
              </div>
            </div>
            {inRange.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-white/[.09] p-8 text-center text-sm text-zinc-500">Log a session to start comparing actual results with theoretical EV.</div>
            ) : (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Actual result" value={money(aggregate.totalActual, 0)} sub={`${aggregate.totalHours.toFixed(1)} hours · ${aggregate.sessionCount} sessions`} />
                  <Metric label="Theoretical EV" value={money(aggregate.totalTheoretical, 0)} sub={`95% CI ${money(aggregate.ci95[0], 0)} to ${money(aggregate.ci95[1], 0)}`} />
                  <Metric label="Winning sessions" value={percent(aggregate.winRate, 0)} sub={`${aggregate.combinedZ === null ? "n/a" : `z = ${aggregate.combinedZ.toFixed(2)}`}`} />
                  <Panel className="flex flex-col justify-center"><p className="text-[.72rem] font-medium uppercase tracking-[.08em] text-zinc-500">Assessment</p><div className="mt-2"><AssessmentBadge assessment={aggregate.assessment} /></div></Panel>
                </div>
                <div className="mt-5 h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulative} margin={{ left: 8, right: 12 }}>
                      <defs><linearGradient id="journalBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8ee72" stopOpacity={0.18} /><stop offset="1" stopColor="#a8ee72" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                      <XAxis dataKey="date" stroke="#71717a" tickFormatter={shortDate} minTickGap={40} />
                      <YAxis stroke="#71717a" tickFormatter={(value) => `$${Math.round(value / 1000)}k`} width={52} />
                      <Tooltip formatter={(value, name) => [money(Number(value)), name]} labelFormatter={(value) => shortDate(String(value))} contentStyle={{ background: "#101411", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
                      <Area type="monotone" dataKey="upper" name="95% upper" stroke="none" fill="url(#journalBand)" />
                      <Area type="monotone" dataKey="lower" name="95% lower" stroke="none" fill="#0c100d" fillOpacity={1} />
                      <Line type="monotone" dataKey="theoretical" name="Theoretical EV" stroke="rgba(168,238,114,.55)" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="actual" name="Actual" stroke="#86efac" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Panel>

          <Panel className="overflow-x-auto">
            <h2 className="font-semibold">Session log</h2>
            {inRange.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No sessions in this range.</p> : (
              <table className="mt-4 w-full min-w-[46rem] text-left text-sm">
                <thead className="text-[.7rem] uppercase tracking-wide text-zinc-600"><tr><th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Hours</th><th className="pb-2 pr-3 text-right">Actual</th><th className="pb-2 pr-3 text-right">Theoretical EV</th><th className="pb-2 pr-3">Assessment</th><th className="pb-2 text-right">Actions</th></tr></thead>
                <tbody>
                  {[...inRange].sort((a, b) => b.date.localeCompare(a.date)).map((session) => {
                    const outcome = theoreticalSessionOutcome(session);
                    const z = sessionZScore(session, outcome);
                    return (
                      <tr key={session.id} className="border-t border-white/[.06]">
                        <td className="whitespace-nowrap py-2.5 pr-3">{shortDate(session.date)}{session.location && <span className="block text-xs text-zinc-600">{session.location}</span>}</td>
                        <td className="py-2.5 pr-3">{session.hours}h</td>
                        <td className={`py-2.5 pr-3 text-right font-medium ${session.netResult >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money(session.netResult, 0)}</td>
                        <td className="py-2.5 pr-3 text-right text-zinc-400">{money(outcome.tripEv, 0)}</td>
                        <td className="py-2.5 pr-3"><AssessmentBadge assessment={classifySessionAssessment(z)} /></td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button type="button" onClick={() => setShareSession(session)} className="px-2 py-1 text-xs text-zinc-500 hover:text-emerald-300">Share</button>
                          <button type="button" onClick={() => void simulateSessionShoe(session)} disabled={shoeReplayLoading !== undefined} className="px-2 py-1 text-xs text-zinc-500 hover:text-emerald-300 disabled:opacity-40">
                            {shoeReplayLoading === session.id ? "Simulating…" : "Simulate a shoe"}
                          </button>
                          <button type="button" aria-label={`Delete session on ${session.date}`} onClick={() => setPendingDelete({ kind: "session", id: session.id, date: session.date })} className="px-2 py-1 text-xs text-zinc-600 hover:text-red-300">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          {shoeReplay && (
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Simulated shoes for this session</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    A representative simulation using this session&apos;s rules, ramp, and betting unit — not your actual historical hands. CountLab never recorded the real cards from this session, so this shows what a session like it typically looks like.
                  </p>
                </div>
                <GhostButton onClick={() => { setShoeReplay(undefined); setSelectedShoeIndex(undefined); }}>Close</GhostButton>
              </div>
              <div className="mt-4">
                {selectedShoeIndex === undefined ? (
                  <ShoeExplorer shoes={shoeReplay.result.shoes} onSelectShoe={setSelectedShoeIndex} />
                ) : (
                  <HandReplayer shoe={shoeReplay.result.shoes[selectedShoeIndex]} onBack={() => setSelectedShoeIndex(undefined)} />
                )}
              </div>
            </Panel>
          )}

          <Panel>
            <div onChange={() => transactionForm.start("inputs")}>
            <h2 className="font-semibold">Bankroll transactions</h2>
            <p className="mt-1 text-xs text-zinc-500">Deposits and withdrawals independent of game results, e.g. funding or removing your action bankroll.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="grid min-w-0 gap-2 text-[.8rem] font-medium text-zinc-400">Date<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="field min-h-11 min-w-0 rounded-xl px-3 text-zinc-100 outline-none" /></label>
              <Select label="Type" value={transactionType} onChange={(event) => setTransactionType(event.target.value as "deposit" | "withdrawal")}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></Select>
              <NumberField label="Amount" value={transactionAmount} min={0} prefix="$" onValueChange={setTransactionAmount} />
              <div className="flex items-end"><GhostButton className="w-full" onClick={logTransaction}>Record</GhostButton></div>
            </div>
            {scopedTransactions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[...scopedTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map((transaction) => (
                  <span key={transaction.id} className="flex items-center gap-2 rounded-full bg-black/25 px-3 py-1.5 text-xs text-zinc-300">
                    <span className={transaction.type === "deposit" ? "text-emerald-300" : "text-amber-300"}>{transaction.type === "deposit" ? "+" : "−"}{money(transaction.amount, 0)}</span>
                    {shortDate(transaction.date)}
                    <button type="button" aria-label="Delete transaction" onClick={() => setPendingDelete({ kind: "transaction", id: transaction.id })} className="text-zinc-600 hover:text-red-300"><i className="fa-solid fa-xmark" /></button>
                  </span>
                ))}
              </div>
            )}
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-zinc-500">Stored only in this browser. JSON is the full-fidelity backup format; CSV is spreadsheet-friendly and also round-trips sessions, but re-importing a CSV always creates new rows rather than updating existing ones.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={exportJournal} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-download mr-2" />Export JSON</button>
                <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-upload mr-2" />Import JSON</button>
                <input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void importJournal(event.target.files?.[0])} className="hidden" />
                <button type="button" onClick={exportSessionsCsv} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-file-csv mr-2" />Export sessions CSV</button>
                <button type="button" onClick={exportTransactionsCsv} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-file-csv mr-2" />Export transactions CSV</button>
                <button type="button" onClick={() => importCsvInputRef.current?.click()} className="rounded-lg border border-white/[.08] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[.05]"><i className="fa-solid fa-upload mr-2" />Import sessions CSV</button>
                <input ref={importCsvInputRef} type="file" accept="text/csv,.csv" onChange={(event) => void importSessionsCsv(event.target.files?.[0])} className="hidden" />
                {notice && <span role="status" className="text-xs text-emerald-300">{notice}</span>}
              </div>
            </div>
          </Panel>
        </div>
      </div>
      <p className="mt-6 text-xs leading-5 text-zinc-600">Theoretical EV and standard deviation are computed from the audited basic-strategy true-count profile for the entered rules and ramp, using the same engine as the Game &amp; Bankroll Lab. They are not fit to your results or used to price FreeBJ deviations.</p>
      <MobileActionDock label="Session journal actions">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0 px-2 text-xs"><p className="text-zinc-500">Expected for this session</p><b className="block truncate text-emerald-300">{money(draftOutcome.tripEv, 2)} EV</b></div>
          <Button onClick={logSession}><i className="fa-solid fa-plus mr-2 text-xs" />Log session</Button>
        </div>
      </MobileActionDock>
      <ConfirmModal
        open={pendingDelete !== undefined}
        title={pendingDelete?.kind === "session" ? "Delete session?" : pendingDelete?.kind === "bankroll" ? "Delete bankroll?" : "Delete transaction?"}
        description={
          pendingDelete?.kind === "session"
            ? `This permanently deletes the session logged on ${pendingDelete.date}.`
            : pendingDelete?.kind === "bankroll"
              ? `This deletes "${pendingDelete.name}". Its sessions and transactions move to your other bankroll instead of being deleted.`
              : "This permanently deletes the transaction."
        }
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => {
          if (pendingDelete?.kind === "session") journalLibrary.deleteSession(pendingDelete.id);
          else if (pendingDelete?.kind === "transaction") journalLibrary.deleteTransaction(pendingDelete.id);
          else if (pendingDelete?.kind === "bankroll") {
            journalLibrary.deleteBankroll(pendingDelete.id);
            setSelectedBankrollId("all");
          }
          setPendingDelete(undefined);
        }}
      />
      {shareSession && (
        <ShareCard
          session={shareSession}
          outcome={theoreticalSessionOutcome(shareSession)}
          bankrollName={bankrolls.find((item) => item.id === shareSession.bankrollId)?.name}
          onClose={() => setShareSession(undefined)}
        />
      )}
    </>
  );
}
