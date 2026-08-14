"use client";
import { useEffect, useRef, useState } from "react";
import { Button, GhostButton, NumberField, Panel } from "@/components/ui";
import { cardName, evaluate, referenceOpening, settle, type UTHDecision, type UTHState } from "@/lib/uth/engine";
import { pokerHandName, shuffledDeck, uthTripsNet } from "@/lib/casinoGames";
import {
  BetSpot,
  CardRow,
  CasinoTable,
  ChipRack,
  CoachPanel,
  EvMetrics,
  GameHistory,
  GameHistoryRow,
  gameCard,
  type CoachNote,
} from "@/components/CasinoGameUI";

type Phase = "betting" | "preflop" | "flop" | "river" | "result";
type WorkerResponse = { id: number; normal: UTHDecision; exposed: UTHDecision; error?: string };

const normalizeAction = (action: string): "RAISE" | "CHECK" | "FOLD" => (action === "CHECK" ? "CHECK" : action === "FOLD" ? "FOLD" : "RAISE");
const evText = (evs: Record<string, number>) => Object.entries(evs).map(([action, ev]) => `${action} ${ev >= 0 ? "+" : ""}${ev.toFixed(3)}`).join(" · ");

export function UTHTableGame() {
  const [bankroll, setBankroll] = useState(1000),
    [selectedChip, setSelectedChip] = useState(25),
    [ante, setAnte] = useState(25),
    [trips, setTrips] = useState(0),
    [phase, setPhase] = useState<Phase>("betting"),
    [player, setPlayer] = useState<number[]>([]),
    [dealer, setDealer] = useState<number[]>([]),
    [board, setBoard] = useState<number[]>([]),
    [playMultiplier, setPlayMultiplier] = useState(0),
    [message, setMessage] = useState("Place chips, then deal."),
    [history, setHistory] = useState<GameHistoryRow[]>([]),
    [stats, setStats] = useState({ rounds: 0, wins: 0, net: 0 }),
    [note, setNote] = useState<CoachNote>(),
    [coachStats, setCoachStats] = useState({ correct: 0, total: 0 }),
    [decision, setDecision] = useState<UTHDecision>(),
    [decisionLoading, setDecisionLoading] = useState(false);
  const locked = phase !== "betting";
  const cards = (values: number[]) => values.map((card) => gameCard(card, cardName));
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    const instance = new Worker(new URL("../workers/uth.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== requestId.current) return;
      setDecisionLoading(false);
      if (!event.data.error) setDecision(event.data.normal);
    };
    return () => instance.terminate();
  }, []);

  const requestDecision = (state: UTHState, samples = 256, mode?: "solve") => {
    if (!worker.current) return;
    setDecisionLoading(true);
    setDecision(undefined);
    worker.current.postMessage({ id: ++requestId.current, state, samples, mode });
  };

  const deal = () => {
    if (ante <= 0) return setMessage("Place an Ante first.");
    if (ante * 6 + trips > bankroll) return setMessage(`Keep at least $${ante * 6 + trips} available for Ante, Blind, and a possible 4x Play bet.`);
    const deck = shuffledDeck();
    const nextPlayer = deck.slice(0, 2);
    setPlayer(nextPlayer);
    setDealer(deck.slice(2, 4));
    setBoard(deck.slice(4, 9));
    setPlayMultiplier(0);
    setPhase("preflop");
    setMessage("Raise 3x or 4x, or check to see the flop.");
    setNote(undefined);
    setDecision(referenceOpening({ player: nextPlayer, board: [] }));
  };
  const judge = (choice: "RAISE" | "CHECK" | "FOLD") => {
    if (!decision) return;
    const expected = normalizeAction(decision.action);
    const ok = choice === expected;
    const detail = decision.method === "PUBLISHED_OPTIMAL_STRATEGY"
      ? "Published optimal opening chart: raise all pairs except deuces; suited A-any/K-any/Q6+/J8+; unsuited A-any/K5+/Q8+/JT."
      : Object.keys(decision.evs).length
        ? `Solver EV: ${evText(decision.evs)}`
        : `Solver favors ${decision.action}.`;
    setNote({ ok, title: ok ? "Correct decision" : `Solver favors ${decision.action}`, detail });
    setCoachStats((value) => ({ correct: value.correct + Number(ok), total: value.total + 1 }));
  };
  const finish = (multiplier: number, folded = false) => {
    const playerHand = evaluate([...player, ...board]);
    const dealerHand = evaluate([...dealer, ...board]);
    const mainNet = folded ? -2 * ante : settle(playerHand, dealerHand, multiplier) * ante;
    const tripsNet = trips ? uthTripsNet(playerHand) * trips : 0;
    const net = mainNet + tripsNet;
    const nextBankroll = bankroll + net;
    const result = net > 0 ? "Win" : net < 0 ? "Loss" : "Push";
    setBankroll(nextBankroll);
    setPlayMultiplier(multiplier);
    setPhase("result");
    setMessage(`${result}: ${net >= 0 ? "+" : ""}$${net.toFixed(2)} · ${pokerHandName(playerHand)} vs ${pokerHandName(dealerHand)}`);
    setStats((value) => ({ rounds: value.rounds + 1, wins: value.wins + Number(net > 0), net: value.net + net }));
    setHistory((rows) => [{ id: Date.now(), result, net, bankroll: nextBankroll, detail: `${pokerHandName(playerHand)} · ${multiplier ? `${multiplier}x Play` : "Fold"}${trips ? ` · Trips ${uthTripsNet(playerHand) >= 0 ? "paid" : "lost"}` : ""}` }, ...rows]);
  };
  const nextRound = () => {
    setPhase("betting");
    setPlayer([]); setDealer([]); setBoard([]); setPlayMultiplier(0);
    setMessage("Adjust your chips or deal again.");
    setDecision(undefined);
  };
  const canAdd = (amount: number) => ante + trips + amount <= bankroll;

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <CasinoTable>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-100/55">Ultimate Texas Hold&apos;em</p><p className="mt-1 text-sm text-emerald-50/80">Bankroll <b className="text-white">${bankroll.toFixed(2)}</b></p></div><span className="rounded-full bg-black/20 px-3 py-1 text-xs text-emerald-100/70">{phase === "betting" ? "Place bets" : phase === "result" ? "Round complete" : "Decision in progress"}</span></div>
          <div className="mt-5"><CardRow label="Dealer" cards={phase === "result" ? cards(dealer) : []} hidden={phase !== "betting" && phase !== "result" ? 2 : 0} empty={phase === "betting" ? 2 : 0} /></div>
          <div className="my-5"><CardRow label="Community" cards={phase === "flop" ? cards(board.slice(0, 3)) : phase === "river" || phase === "result" ? cards(board) : []} empty={phase === "betting" || phase === "preflop" ? 5 : phase === "flop" ? 2 : 0} /></div>
          <div><CardRow label="Your hand" cards={cards(player)} empty={phase === "betting" ? 2 : 0} /></div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-8">
            <BetSpot label="Ante" amount={ante} locked={locked} onAdd={() => canAdd(selectedChip) && setAnte((value) => value + selectedChip)} onClear={() => setAnte(0)} />
            <BetSpot label="Blind" amount={ante} locked detail="Matches Ante" />
            <BetSpot label="Play" amount={playMultiplier * ante} locked detail={playMultiplier ? `${playMultiplier}x Ante` : "Decision bet"} />
            <BetSpot label="Trips" amount={trips} locked={locked} onAdd={() => canAdd(selectedChip) && setTrips((value) => value + selectedChip)} onClear={() => setTrips(0)} detail="Optional side bet" />
          </div>
          <div aria-live="polite" className="mx-auto mt-5 max-w-2xl rounded-xl bg-black/25 p-3 text-center text-sm text-emerald-50/80">{message}</div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {phase === "betting" && <Button onClick={deal}>Deal cards</Button>}
            {phase === "preflop" && <><Button onClick={() => { judge("RAISE"); finish(4); }}>Raise 4x · ${ante * 4}</Button><GhostButton onClick={() => { judge("RAISE"); finish(3); }}>Raise 3x · ${ante * 3}</GhostButton><GhostButton onClick={() => { judge("CHECK"); const nextBoard = board.slice(0, 3); setPhase("flop"); setMessage("The flop is open. Raise 2x or check to the river."); requestDecision({ player, board: nextBoard }); }}>Check</GhostButton><GhostButton onClick={() => requestDecision({ player, board: [] }, 256, "solve")} disabled={decisionLoading}>{decisionLoading ? "Calculating EV…" : "Calculate EV"}</GhostButton></>}
            {phase === "flop" && <><Button onClick={() => { judge("RAISE"); finish(2); }}>Raise 2x · ${ante * 2}</Button><GhostButton onClick={() => { judge("CHECK"); setPhase("river"); setMessage("Final decision: raise 1x or fold."); requestDecision({ player, board }); }}>Check</GhostButton></>}
            {phase === "river" && <><Button onClick={() => { judge("RAISE"); finish(1); }}>Raise 1x · ${ante}</Button><GhostButton onClick={() => { judge("FOLD"); finish(0, true); }} className="text-red-300">Fold</GhostButton></>}
            {phase === "result" && <Button onClick={nextRound}>Next round</Button>}
          </div>
          {(phase === "preflop" || phase === "flop" || phase === "river") && (
            <EvMetrics evs={decision?.evs} loading={decisionLoading} note={decision && Object.keys(decision.evs).length ? "River and flop EV are exact; opening EV requires the Calculate EV button." : undefined} />
          )}
        </CasinoTable>
        <Panel><h2 className="mb-4 font-semibold">Chip rack</h2><ChipRack selected={selectedChip} onSelect={setSelectedChip} disabled={locked} /><p className="mt-4 text-center text-xs text-zinc-500">Select a chip, then tap Ante or Trips. Blind always matches Ante.</p></Panel>
      </div>
      <div className="space-y-5">
        <CoachPanel note={note} accuracyLabel={coachStats.total ? `${Math.round((coachStats.correct / coachStats.total) * 100)}% accuracy` : undefined} emptyHint="Your raise/check/fold decisions are checked against the exact solver as you play." />
        <Panel><h2 className="font-semibold">Session</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Rounds</p><b className="text-xl">{stats.rounds}</b></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Wins</p><b className="text-xl">{stats.wins}</b></div><div className="col-span-2 rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Session net</p><b className={`text-xl ${stats.net >= 0 ? "text-emerald-300" : "text-red-300"}`}>{stats.net >= 0 ? "+" : ""}${stats.net.toFixed(2)}</b></div></div><div className="mt-4"><NumberField label="Reset bankroll" value={bankroll} min={1} prefix="$" disabled={locked} onValueChange={setBankroll} /></div></Panel>
        <Panel><h2 className="mb-4 font-semibold">Round history</h2><GameHistory rows={history} /></Panel>
        <Panel><h2 className="font-semibold">Table rules</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-500"><li>• Ante and Blind are equal mandatory bets.</li><li>• Raise 3x/4x preflop, 2x after the flop, or 1x after the river.</li><li>• Dealer qualifies with a pair or better; Ante pushes when the dealer fails to qualify.</li><li>• Trips pays independently using the standard 50/40/30/8/7/4/3 schedule.</li></ul></Panel>
      </div>
    </div>
  );
}
