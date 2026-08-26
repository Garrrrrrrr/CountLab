"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, GhostButton, NumberField, Panel, Select } from "@/components/ui";
import { ACTION_NAMES, handValue, hiLoTag, recommendAction, trueCount, type DDMAction, type DDMCard, type DDMRank } from "@/lib/ddm/engine";
import type { ExactEvInput, ExactEvResult } from "@/lib/ddm/exactEv";

type WorkerResponse = { id: number; result?: ExactEvResult; durationMs: number; error?: string };

const RANKS: DDMRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const actionOrder: DDMAction[] = ["S", "H", "D"];
const rankLabel = (rank: DDMRank) => rank === 1 ? "A" : String(rank);
const percent = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(4)}%`;
const dollars = (value: number) => `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(2)}`;

function virtualCard(rank: DDMRank, id: number): DDMCard {
  return { id, rank, suit: "s" };
}

export function DDMEvCalculator() {
  const [decks, setDecks] = useState(6);
  const [player, setPlayer] = useState<DDMRank[]>([10]);
  const [dealerUp, setDealerUp] = useState<DDMRank>(6);
  const [deadCards, setDeadCards] = useState<number[]>(Array(10).fill(0));
  const [currentWager, setCurrentWager] = useState(10);
  const [baseBet, setBaseBet] = useState(10);
  const [result, setResult] = useState<ExactEvResult>();
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    const instance = new Worker(new URL("../workers/ddmExact.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== requestId.current) return;
      setLoading(false);
      setDurationMs(event.data.durationMs);
      if (event.data.error) {
        setError(event.data.error);
        setResult(undefined);
      } else {
        setError("");
        setResult(event.data.result);
      }
    };
    return () => instance.terminate();
  }, []);

  const invalidate = () => {
    requestId.current += 1;
    setLoading(false);
    setResult(undefined);
    setError("");
  };

  const usedByRank = useMemo(() => RANKS.map((rank) =>
    deadCards[rank - 1] + player.filter((card) => card === rank).length + Number(dealerUp === rank),
  ), [deadCards, dealerUp, player]);
  const availableByRank = RANKS.map((rank) => (rank === 10 ? 16 : 4) * decks - usedByRank[rank - 1]);
  const exposedCount = deadCards.reduce((sum, count) => sum + count, 0) + player.length + 1;
  const runningCount = RANKS.reduce((sum, rank) => sum + hiLoTag(rank) * usedByRank[rank - 1], 0);
  const tc = trueCount(runningCount, decks * 52 - exposedCount);
  const strategy = player.length ? recommendAction(player.map(virtualCard), dealerUp, tc) : undefined;
  const value = player.length ? handValue(player.map(virtualCard)) : undefined;

  const calculate = () => {
    if (!worker.current) return;
    if (!player.length) return setError("Add at least one player card.");
    if (value?.bust) return setError("The selected player hand is already busted.");
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setResult(undefined);
    worker.current.postMessage({ id, input: { decks, player, dealerUp, deadCards } satisfies ExactEvInput });
  };

  const setDead = (rank: DDMRank, raw: number) => {
    invalidate();
    const max = (rank === 10 ? 16 : 4) * decks - player.filter((card) => card === rank).length - Number(dealerUp === rank);
    setDeadCards((counts) => counts.map((count, index) => index === rank - 1 ? Math.min(max, Math.max(0, Math.floor(raw))) : count));
  };
  const addPlayer = (rank: DDMRank) => {
    if (availableByRank[rank - 1] <= 0) return;
    invalidate();
    setPlayer((cards) => [...cards, rank]);
  };
  const removePlayer = (index: number) => {
    invalidate();
    setPlayer((cards) => cards.filter((_, cardIndex) => cardIndex !== index));
  };
  const changeDecks = (next: number) => {
    invalidate();
    setDecks(next);
    setDeadCards((counts) => counts.map((count, index) => {
      const rank = (index + 1) as DDMRank;
      const max = (rank === 10 ? 16 : 4) * next - player.filter((card) => card === rank).length - Number(dealerUp === rank);
      return Math.max(0, Math.min(count, max));
    }));
  };

  const calculatedActions = result
    ? actionOrder.filter((action) => result.actionEv[action] !== undefined)
    : [];

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-400">Removal-exact enumeration</p><h2 className="mt-2 text-xl font-semibold">Build the information state</h2></div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">6-deck V1 · H17 · peek · dealer 22 pushes</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Select label="Starting decks" value={decks} onChange={(event) => changeDecks(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} deck{count === 1 ? "" : "s"}</option>)}</Select>
            <Select label="Dealer upcard" value={dealerUp} onChange={(event) => { invalidate(); setDealerUp(Number(event.target.value) as DDMRank); }}>{RANKS.map((rank) => <option key={rank} value={rank}>{rankLabel(rank)}</option>)}</Select>
            <NumberField label="Current total wager" prefix="$" min={1} value={currentWager} onValueChange={(number) => setCurrentWager(Math.max(1, number))} />
            <NumberField label="Original base bet" prefix="$" min={1} value={baseBet} onValueChange={(number) => setBaseBet(Math.max(1, number))} />
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Player cards</h2><p className="mt-1 text-xs text-zinc-500">Order is irrelevant after the first draw; two-card A+T is recognized as blackjack.</p></div><GhostButton onClick={() => { invalidate(); setPlayer([]); }}>Clear hand</GhostButton></div>
          <div className="mt-4 flex min-h-14 flex-wrap gap-2 rounded-xl bg-black/20 p-3">
            {player.length ? player.map((rank, index) => <button type="button" key={`${rank}-${index}`} onClick={() => removePlayer(index)} className="pressable min-h-11 min-w-11 rounded-lg bg-white px-3 font-bold text-zinc-950" aria-label={`Remove ${rankLabel(rank)}`}>{rankLabel(rank)} ×</button>) : <span className="self-center text-sm text-zinc-600">Add a card below.</span>}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">{RANKS.map((rank) => <button type="button" key={rank} disabled={availableByRank[rank - 1] <= 0} onClick={() => addPlayer(rank)} className="pressable min-h-12 rounded-xl border border-white/10 bg-white/[.05] font-semibold hover:bg-white/[.1] disabled:opacity-20">{rankLabel(rank)}</button>)}</div>
          {value && <p className="mt-3 text-sm text-zinc-400">Current hand: <b className="text-white">{value.bust ? `${value.hardTotal} bust` : `${value.soft ? "soft " : ""}${value.total}`}</b>{player.length === 1 && player[0] === 1 ? " · strict ace rule allows one final card only" : ""}</p>}
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Previously exposed cards</h2><p className="mt-1 text-xs text-zinc-500">Enter discards from earlier rounds only. The current player cards and dealer upcard are removed automatically.</p></div><GhostButton onClick={() => { invalidate(); setDeadCards(Array(10).fill(0)); }}>Reset discards</GhostButton></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{RANKS.map((rank) => <NumberField key={rank} label={`${rankLabel(rank)} removed`} min={0} max={(rank === 10 ? 16 : 4) * decks - player.filter((card) => card === rank).length - Number(dealerUp === rank)} value={deadCards[rank - 1]} onValueChange={(count) => setDead(rank, count)} />)}</div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500"><span>RC <b className="text-white">{runningCount >= 0 ? "+" : ""}{runningCount}</b></span><span>TC <b className="text-white">{tc >= 0 ? "+" : ""}{tc}</b></span><span>{decks * 52 - exposedCount} unseen cards</span><span>Chart play <b className="text-white">{strategy ? ACTION_NAMES[strategy.action] : "—"}</b></span></div>
        </Panel>

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 rounded-2xl bg-[#111612]/95 p-2 shadow-2xl backdrop-blur lg:static lg:bg-transparent lg:p-0 lg:shadow-none"><Button className="w-full sm:w-auto" onClick={calculate} disabled={loading}>{loading ? "Enumerating every continuation…" : "Calculate exact EV"}</Button></div>
        {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-300">{error}</p>}
      </div>

      <div className="space-y-4">
        {result ? (
          <>
            <Panel className="border border-emerald-400/20">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Exact recommendation</p>
              <h2 className="mt-2 text-3xl font-semibold">{ACTION_NAMES[result.action]}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Optimal against the exact remaining rank composition, including optimal continuation after future hits and re-doubles.</p>
              {strategy && strategy.action !== result.action && <p className="mt-3 rounded-lg bg-amber-400/[.08] p-3 text-xs leading-5 text-amber-200">The practical Hi-Lo chart says {ACTION_NAMES[strategy.action]}, but full composition says {ACTION_NAMES[result.action]}. A one-parameter count cannot distinguish every composition with the same TC.</p>}
            </Panel>
            <Panel>
              <h2 className="font-semibold">Action EV</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Net EV is per current wager and conditioned on the dealer having completed an A/10 peek without blackjack.</p>
              <div className="mt-4 space-y-2">{calculatedActions.map((action) => {
                const ev = Number(result.actionEv[action]);
                return <div key={action} className={`rounded-xl border p-4 ${action === result.action ? "border-emerald-400/30 bg-emerald-400/[.07]" : "border-white/[.06] bg-black/20"}`}><div className="flex items-center justify-between gap-3"><b>{ACTION_NAMES[action]}</b><b className={ev >= 0 ? "text-emerald-300" : "text-red-300"}>{dollars(ev * currentWager)}</b></div><div className="mt-2 flex justify-between text-xs text-zinc-500"><span>{percent(ev)} of current wager</span>{action === "D" && <span>${(currentWager * 2).toFixed(2)} total at risk</span>}</div></div>;
              })}</div>
            </Panel>
            {result.prePeekActionEv && <Panel><h2 className="font-semibold">Peek and insurance</h2><p className="mt-3 text-sm text-zinc-400">Dealer blackjack probability before the peek: <b className="text-white">{percent(result.dealerBlackjackProbability)}</b>.</p><div className="mt-4 space-y-2">{calculatedActions.map((action) => { const ev = Number(result.prePeekActionEv?.[action]); return <div key={action} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3 text-sm"><span>{ACTION_NAMES[action]} main-hand EV before peek</span><b className={ev >= 0 ? "text-emerald-300" : "text-red-300"}>{dollars(ev * currentWager)}</b></div>; })}</div>{result.insuranceEvPerBaseUnit !== undefined && <div className="mt-4 rounded-xl border border-white/[.07] p-4"><div className="flex items-center justify-between gap-3"><b>Insurance</b><b className={result.insuranceEvPerBaseUnit >= 0 ? "text-emerald-300" : "text-red-300"}>{result.insuranceEvPerBaseUnit >= 0 ? "Take" : "Decline"}</b></div><p className="mt-2 text-xs text-zinc-500">EV {dollars(result.insuranceEvPerBaseUnit * baseBet)} on a ${(baseBet / 2).toFixed(2)} insurance stake · {percent(result.insuranceEvPerBaseUnit)} per base unit.</p></div>}</Panel>}
            <Panel><h2 className="font-semibold">Audit trail</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-xs text-zinc-500">Player states</span><b className="mt-1 block">{result.playerStates.toLocaleString()}</b></div><div><span className="text-xs text-zinc-500">Dealer states</span><b className="mt-1 block">{result.dealerStates.toLocaleString()}</b></div><div><span className="text-xs text-zinc-500">Runtime</span><b className="mt-1 block">{durationMs < 1000 ? `${durationMs.toFixed(0)} ms` : `${(durationMs / 1000).toFixed(2)} s`}</b></div><div><span className="text-xs text-zinc-500">Unseen cards</span><b className="mt-1 block">{result.unseenCards}</b></div></div></Panel>
          </>
        ) : (
          <Panel>
            <h2 className="font-semibold">What is calculated</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">This is combinatorial enumeration, not simulation. Every draw removes its rank, every legal dealer hole card is integrated out, H17 is recursive, dealer 22 is separated from other busts, and the peek changes both hole-card and player-draw probabilities.</p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Version 1 blackjack pays the exact rank-model expectation of 1.625×: one-quarter suited at 2:1 and three-quarters unsuited at 3:2. No confidence interval is needed because there is no sampling error.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
