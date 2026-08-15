"use client";
import { useEffect, useRef, useState } from "react";
import { Button, GhostButton, NumberField, Panel, Select } from "@/components/ui";
import {
  cardName,
  Decision,
  flushRank,
  foldBreakdown,
  InfoState,
  settleBreakdown,
} from "@/lib/chaseFlush/engine";
import { shuffledDeck } from "@/lib/casinoGames";
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
import { track } from "@/lib/analytics/track";

type Phase = "betting" | "opening" | "board" | "river" | "result";
type Reveal = "all" | "from2" | "final" | "none";
type WorkerResponse =
  | { id: number; kind?: undefined; informed: Decision; normal?: Decision; stability: number; stableAction: boolean; error?: string }
  | { id: number; kind: "provisional"; decision: Decision; error?: string };
const rankName = (value: number) => value <= 10 ? String(value) : value === 11 ? "J" : value === 12 ? "Q" : value === 13 ? "K" : "A";
const flushName = (cards: number[]) => {
  const rank = flushRank(cards);
  return `${rank[0]}-card ${rankName(rank[1])}-high flush`;
};
const normalizeAction = (action: string): "BET" | "CHECK" | "FOLD" => (action === "check" ? "CHECK" : action === "fold" ? "FOLD" : "BET");
const evText = (evs: Record<string, number>) => Object.entries(evs).map(([action, ev]) => `${action} ${ev >= 0 ? "+" : ""}${ev.toFixed(3)}`).join(" · ");
const money = (value: number) => (value % 1 === 0 ? value : value.toFixed(2));

export function ChaseFlushTableGame({
  sixCardPayout,
  onPayoutChange,
}: {
  sixCardPayout: number;
  onPayoutChange: (value: number) => void;
}) {
  const [bankroll, setBankroll] = useState(1000),
    [selectedChip, setSelectedChip] = useState(25),
    [ante, setAnte] = useState(25),
    [phase, setPhase] = useState<Phase>("betting"),
    [reveal, setReveal] = useState<Reveal>("all"),
    [player, setPlayer] = useState<number[]>([]),
    [dealer, setDealer] = useState<number[]>([]),
    [board, setBoard] = useState<number[]>([]),
    [allInMultiplier, setAllInMultiplier] = useState(0),
    [message, setMessage] = useState("Place chips, then deal."),
    [history, setHistory] = useState<GameHistoryRow[]>([]),
    [stats, setStats] = useState({ rounds: 0, wins: 0, net: 0 }),
    [note, setNote] = useState<CoachNote>(),
    [coachStats, setCoachStats] = useState({ correct: 0, total: 0 }),
    [decision, setDecision] = useState<Decision>(),
    [decisionLoading, setDecisionLoading] = useState(false);
  const locked = phase !== "betting";
  const cards = (values: number[]) => values.map((card) => gameCard(card, cardName));
  const revealAt = (target: Phase) => reveal === "all" && target !== "betting" || reveal === "from2" && ["board", "river"].includes(target) || reveal === "final" && target === "river";
  const revealDealer = revealAt(phase);
  const worker = useRef<Worker | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    const instance = new Worker(new URL("../workers/chaseFlush.worker.ts", import.meta.url));
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== requestId.current) return;
      setDecisionLoading(false);
      if (event.data.error) return;
      const resolved = event.data.kind === "provisional" ? event.data.decision : event.data.informed;
      if (resolved) setDecision(resolved);
    };
    return () => instance.terminate();
  }, []);

  const requestDecision = (state: InfoState, samples: number) => {
    if (!worker.current) return;
    setDecisionLoading(true);
    setDecision(undefined);
    const id = ++requestId.current;
    if (state.board.length === 0) worker.current.postMessage({ id, kind: "provisional", state, samples, sixCardPayout });
    else worker.current.postMessage({ id, informed: state, normal: state, samples, sixCardPayout });
  };

  const deal = () => {
    if (ante <= 0) return setMessage("Place an Ante first.");
    if (ante * 5 > bankroll) return setMessage(`Keep at least $${money(ante * 5)} available for Ante, X-Tra, and a possible 3x All-In bet.`);
    const deck = shuffledDeck();
    const nextPlayer = deck.slice(0, 3);
    const nextDealer = deck.slice(3, 6);
    setPlayer(nextPlayer);
    setDealer(nextDealer);
    setBoard(deck.slice(6, 10));
    setAllInMultiplier(0);
    setPhase("opening");
    setMessage("Bet 3x now, or check for the first two community cards.");
    setNote(undefined);
    requestDecision({ player: nextPlayer, board: [], dealerVisible: revealAt("opening") ? nextDealer[0] : undefined }, 64);
    track("chase_flush_hand_dealt", { ante, bankroll, sixCardPayout });
  };
  const judge = (choice: "BET" | "CHECK" | "FOLD", street: "opening" | "board" | "river") => {
    if (!decision) return;
    const expected = normalizeAction(decision.action);
    const ok = choice === expected;
    const detail = Object.keys(decision.evs).length
      ? `${decision.method === "MONTE_CARLO" ? "Monte Carlo" : "Exact"} EV: ${evText(decision.evs)}`
      : `Solver favors ${decision.action}.`;
    setNote({ ok, title: ok ? "Correct decision" : `Solver favors ${decision.action}`, detail });
    setCoachStats((value) => ({ correct: value.correct + Number(ok), total: value.total + 1 }));
    track("chase_flush_decision", { street, choice, expected, ok, method: decision.method });
  };
  const finish = (multiplier: number, folded = false) => {
    const playerCards = [...player, ...board];
    const dealerCards = [...dealer, ...board];
    const breakdown = folded ? foldBreakdown() : settleBreakdown(playerCards, dealerCards, multiplier, sixCardPayout);
    const net = breakdown.total * ante;
    const nextBankroll = bankroll + net;
    const result = net > 0 ? "Win" : net < 0 ? "Loss" : "Push";
    setBankroll(nextBankroll);
    setAllInMultiplier(multiplier);
    setPhase("result");
    setMessage(`${result}: ${net >= 0 ? "+" : ""}$${net.toFixed(2)} · ${flushName(playerCards)} vs ${flushName(dealerCards)}`);
    setStats((value) => ({ rounds: value.rounds + 1, wins: value.wins + Number(net > 0), net: value.net + net }));
    setHistory((rows) => [{ id: Date.now(), result, net, bankroll: nextBankroll, detail: `${flushName(playerCards)} · Ante ${breakdown.ante >= 0 ? "+" : ""}${money(breakdown.ante)} · X-Tra ${breakdown.xtra >= 0 ? "+" : ""}${money(breakdown.xtra)} · All-In ${breakdown.allIn >= 0 ? "+" : ""}${money(breakdown.allIn)}` }, ...rows]);
    track("chase_flush_hand_resolved", { result, net, multiplier, folded, breakdown, playerHand: flushName(playerCards), dealerHand: flushName(dealerCards), nextBankroll });
  };
  const nextRound = () => {
    setPhase("betting"); setPlayer([]); setDealer([]); setBoard([]); setAllInMultiplier(0);
    setMessage("Adjust your Ante or deal again.");
    setDecision(undefined);
  };
  const exposed = phase === "result" ? dealer : revealDealer ? dealer.slice(0, 1) : [];
  const dealerHidden = phase === "betting" || phase === "result" ? 0 : 3 - exposed.length;

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <CasinoTable>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-100/55">Chase the Flush</p><p className="mt-1 text-sm text-emerald-50/80">Bankroll <b className="text-white">${bankroll.toFixed(2)}</b></p></div><span className="rounded-full bg-black/20 px-3 py-1 text-xs text-emerald-100/70">{phase === "betting" ? "Place bets" : phase === "result" ? "Round complete" : revealDealer ? "Dealer card exposed" : "Decision in progress"}</span></div>
          <div className="mt-5"><CardRow label="Dealer" cards={cards(exposed)} hidden={dealerHidden} empty={phase === "betting" ? 3 : 0} /></div>
          <div className="my-5"><CardRow label="Community" cards={phase === "board" ? cards(board.slice(0, 2)) : phase === "river" || phase === "result" ? cards(board) : []} empty={phase === "betting" || phase === "opening" ? 4 : phase === "board" ? 2 : 0} /></div>
          <div><CardRow label="Your hand" cards={cards(player)} empty={phase === "betting" ? 3 : 0} /></div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-8">
            <BetSpot label="Ante" amount={ante} locked={locked} onAdd={() => ante + selectedChip <= bankroll / 5 && setAnte((value) => value + selectedChip)} onClear={() => setAnte(0)} />
            <BetSpot label="X-Tra" amount={ante} locked detail="Matches Ante" />
            <BetSpot label="All-In" amount={allInMultiplier * ante} locked detail={allInMultiplier ? `${allInMultiplier}x Ante` : "Decision bet"} />
          </div>
          <div aria-live="polite" className="mx-auto mt-5 max-w-2xl rounded-xl bg-black/25 p-3 text-center text-sm text-emerald-50/80">{message}</div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {phase === "betting" && <Button onClick={deal}>Deal cards</Button>}
            {phase === "opening" && <><Button onClick={() => { judge("BET", "opening"); finish(3); }}>Bet 3x · ${money(ante * 3)}</Button><GhostButton onClick={() => { judge("CHECK", "opening"); setPhase("board"); setMessage("Two board cards are open. Bet 2x or check."); requestDecision({ player, board: board.slice(0, 2), dealerVisible: revealAt("board") ? dealer[0] : undefined }, 24); }}>Check</GhostButton><GhostButton disabled={decisionLoading} onClick={() => { track("chase_flush_ev_requested", { street: "opening" }); requestDecision({ player, board: [], dealerVisible: revealAt("opening") ? dealer[0] : undefined }, 400); }}>{decisionLoading ? "Calculating EV…" : "Calculate EV"}</GhostButton></>}
            {phase === "board" && <><Button onClick={() => { judge("BET", "board"); finish(2); }}>Bet 2x · ${money(ante * 2)}</Button><GhostButton onClick={() => { judge("CHECK", "board"); setPhase("river"); setMessage("Final decision: bet 1x or fold."); requestDecision({ player, board, dealerVisible: revealAt("river") ? dealer[0] : undefined }, 24); }}>Check</GhostButton></>}
            {phase === "river" && <><Button onClick={() => { judge("BET", "river"); finish(1); }}>Bet 1x · ${money(ante)}</Button><GhostButton onClick={() => { judge("FOLD", "river"); finish(0, true); }} className="text-red-300">Fold</GhostButton></>}
            {phase === "result" && <Button onClick={nextRound}>Next round</Button>}
          </div>
          {(phase === "opening" || phase === "board" || phase === "river") && (
            <EvMetrics evs={decision?.evs} loading={decisionLoading} note="Opening EV is a Monte Carlo estimate (the exact opening solve is too slow for live play); the second decision and final call are exact." />
          )}
        </CasinoTable>
        <Panel><h2 className="mb-4 font-semibold">Chip rack</h2><ChipRack selected={selectedChip} onSelect={setSelectedChip} disabled={locked} /><p className="mt-4 text-center text-xs text-zinc-500">Select a chip, then tap Ante. X-Tra automatically matches it.</p></Panel>
      </div>
      <div className="space-y-5">
        <CoachPanel note={note} accuracyLabel={coachStats.total ? `${Math.round((coachStats.correct / coachStats.total) * 100)}% accuracy` : undefined} emptyHint="Your bet/check/fold decisions are checked against the solver as you play." />
        <Panel><h2 className="font-semibold">Table setup</h2><div className="mt-4 grid gap-4"><Select label="Dealer-card reveal" value={reveal} disabled={locked} onChange={(event) => setReveal(event.target.value as Reveal)}><option value="all">Visible from opening</option><option value="from2">Visible after first board</option><option value="final">Visible at final decision</option><option value="none">No exposed card</option></Select><Select label="Six-card X-Tra payout" value={sixCardPayout} disabled={locked} onChange={(event) => onPayoutChange(+event.target.value)}><option value={50}>50:1 current table</option><option value={20}>20:1 legacy table</option></Select><NumberField label="Reset bankroll" value={bankroll} min={1} prefix="$" disabled={locked} onValueChange={setBankroll} /></div></Panel>
        <Panel><h2 className="font-semibold">Session</h2><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Rounds</p><b>{stats.rounds}</b></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Wins</p><b>{stats.wins}</b></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Net</p><b className={stats.net >= 0 ? "text-emerald-300" : "text-red-300"}>{stats.net >= 0 ? "+" : ""}${money(stats.net)}</b></div></div></Panel>
        <Panel><h2 className="mb-4 font-semibold">Round history</h2><GameHistory rows={history} /></Panel>
        <Panel><h2 className="font-semibold">Table rules</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-500"><li>• Ante and X-Tra are equal mandatory bets.</li><li>• Bet 3x opening, 2x after two board cards, or 1x after all four.</li><li>• Only flush length and suited ranks count; ordinary poker combinations do not.</li><li>• Dealer qualifies with a four-card flush or 9-high three-card flush.</li><li>• X-Tra pays 1/5/{sixCardPayout}/250 for four through seven suited cards.</li></ul></Panel>
      </div>
    </div>
  );
}
