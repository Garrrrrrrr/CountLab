"use client";
import { useState } from "react";
import { Button, GhostButton, NumberField, Panel, Select } from "@/components/ui";
import {
  cardName,
  flushRank,
  foldBreakdown,
  settleBreakdown,
} from "@/lib/chaseFlush/engine";
import { shuffledDeck } from "@/lib/casinoGames";
import {
  BetSpot,
  CardRow,
  CasinoTable,
  ChipRack,
  GameHistory,
  GameHistoryRow,
  gameCard,
} from "@/components/CasinoGameUI";

type Phase = "betting" | "opening" | "board" | "river" | "result";
type Reveal = "all" | "from2" | "final" | "none";
const rankName = (value: number) => value <= 10 ? String(value) : value === 11 ? "J" : value === 12 ? "Q" : value === 13 ? "K" : "A";
const flushName = (cards: number[]) => {
  const rank = flushRank(cards);
  return `${rank[0]}-card ${rankName(rank[1])}-high flush`;
};

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
    [stats, setStats] = useState({ rounds: 0, wins: 0, net: 0 });
  const locked = phase !== "betting";
  const cards = (values: number[]) => values.map((card) => gameCard(card, cardName));
  const revealDealer = reveal === "all" && phase !== "betting" || reveal === "from2" && ["board", "river"].includes(phase) || reveal === "final" && phase === "river";

  const deal = () => {
    if (ante <= 0) return setMessage("Place an Ante first.");
    if (ante * 5 > bankroll) return setMessage(`Keep at least $${ante * 5} available for Ante, X-Tra, and a possible 3x All-In bet.`);
    const deck = shuffledDeck();
    setPlayer(deck.slice(0, 3));
    setDealer(deck.slice(3, 6));
    setBoard(deck.slice(6, 10));
    setAllInMultiplier(0);
    setPhase("opening");
    setMessage("Bet 3x now, or check for the first two community cards.");
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
    setHistory((rows) => [{ id: Date.now(), result, net, bankroll: nextBankroll, detail: `${flushName(playerCards)} · Ante ${breakdown.ante >= 0 ? "+" : ""}${breakdown.ante} · X-Tra ${breakdown.xtra >= 0 ? "+" : ""}${breakdown.xtra} · All-In ${breakdown.allIn >= 0 ? "+" : ""}${breakdown.allIn}` }, ...rows]);
  };
  const nextRound = () => {
    setPhase("betting"); setPlayer([]); setDealer([]); setBoard([]); setAllInMultiplier(0);
    setMessage("Adjust your Ante or deal again.");
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
            {phase === "opening" && <><Button onClick={() => finish(3)}>Bet 3x · ${ante * 3}</Button><GhostButton onClick={() => { setPhase("board"); setMessage("Two board cards are open. Bet 2x or check."); }}>Check</GhostButton></>}
            {phase === "board" && <><Button onClick={() => finish(2)}>Bet 2x · ${ante * 2}</Button><GhostButton onClick={() => { setPhase("river"); setMessage("Final decision: bet 1x or fold."); }}>Check</GhostButton></>}
            {phase === "river" && <><Button onClick={() => finish(1)}>Bet 1x · ${ante}</Button><GhostButton onClick={() => finish(0, true)} className="text-red-300">Fold</GhostButton></>}
            {phase === "result" && <Button onClick={nextRound}>Next round</Button>}
          </div>
        </CasinoTable>
        <Panel><h2 className="mb-4 font-semibold">Chip rack</h2><ChipRack selected={selectedChip} onSelect={setSelectedChip} disabled={locked} /><p className="mt-4 text-center text-xs text-zinc-500">Select a chip, then tap Ante. X-Tra automatically matches it.</p></Panel>
      </div>
      <div className="space-y-5">
        <Panel><h2 className="font-semibold">Table setup</h2><div className="mt-4 grid gap-4"><Select label="Dealer-card reveal" value={reveal} disabled={locked} onChange={(event) => setReveal(event.target.value as Reveal)}><option value="all">Visible from opening</option><option value="from2">Visible after first board</option><option value="final">Visible at final decision</option><option value="none">No exposed card</option></Select><Select label="Six-card X-Tra payout" value={sixCardPayout} disabled={locked} onChange={(event) => onPayoutChange(+event.target.value)}><option value={50}>50:1 current table</option><option value={20}>20:1 legacy table</option></Select><NumberField label="Reset bankroll" value={bankroll} min={1} prefix="$" disabled={locked} onValueChange={setBankroll} /></div></Panel>
        <Panel><h2 className="font-semibold">Session</h2><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Rounds</p><b>{stats.rounds}</b></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Wins</p><b>{stats.wins}</b></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xs text-zinc-500">Net</p><b className={stats.net >= 0 ? "text-emerald-300" : "text-red-300"}>{stats.net >= 0 ? "+" : ""}${stats.net}</b></div></div></Panel>
        <Panel><h2 className="mb-4 font-semibold">Round history</h2><GameHistory rows={history} /></Panel>
        <Panel><h2 className="font-semibold">Table rules</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-500"><li>• Ante and X-Tra are equal mandatory bets.</li><li>• Bet 3x opening, 2x after two board cards, or 1x after all four.</li><li>• Only flush length and suited ranks count; ordinary poker combinations do not.</li><li>• Dealer qualifies with a four-card flush or 9-high three-card flush.</li><li>• X-Tra pays 1/5/{sixCardPayout}/250 for four through seven suited cards.</li></ul></Panel>
      </div>
    </div>
  );
}
