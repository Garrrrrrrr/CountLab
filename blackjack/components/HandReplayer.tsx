"use client";

import { useState } from "react";
import type { SimulatedShoe } from "@/lib/blackjack/shoeSimulation";
import { GhostButton, Metric, Panel } from "./ui";
import { PlayingCard } from "./PlayingCard";

const money = (value: number, digits = 2) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const cardLabel = (cards: { rank: string; suit: string }[]) => cards.map((card) => `${card.rank}${card.suit[0].toUpperCase()}`).join(" ");

export function HandReplayer({ shoe, onBack }: { shoe: SimulatedShoe; onBack: () => void }) {
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const hand = shoe.hands[selectedHandIndex];
  if (!hand) return null;

  return (
    <Panel>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-medium text-zinc-500 hover:text-zinc-200"><i className="fa-solid fa-arrow-left mr-1.5" />Back to Shoes</button>
          <h2 className="mt-1 text-lg font-semibold">Shoe #{shoe.shoeNumber} Analysis</h2>
        </div>
        <span className="rounded-full bg-white/[.05] px-3 py-1 text-xs text-zinc-400">{shoe.totalHands} hands</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Hand Replayer</h3>
              <p className="text-xs text-zinc-500">Hand {hand.roundInShoe} of {shoe.totalHands}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <GhostButton className="min-h-8 px-3 py-1.5" disabled={selectedHandIndex === 0} onClick={() => setSelectedHandIndex((i) => Math.max(0, i - 1))}><i className="fa-solid fa-chevron-left" /></GhostButton>
              <span>{selectedHandIndex + 1} / {shoe.hands.length}</span>
              <GhostButton className="min-h-8 px-3 py-1.5" disabled={selectedHandIndex === shoe.hands.length - 1} onClick={() => setSelectedHandIndex((i) => Math.min(shoe.hands.length - 1, i + 1))}><i className="fa-solid fa-chevron-right" /></GhostButton>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Dealer</p>
            <div className="flex gap-2">{hand.dealerCards.map((card, index) => <PlayingCard key={index} card={card} size="sm" />)}</div>

            {hand.playerHands.map((box, boxIndex) => (
              <div key={boxIndex} className="mt-4 border-t border-white/[.06] pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium uppercase tracking-wide text-zinc-500">Hand {boxIndex + 1}</span>
                  <span className={box.net >= 0 ? "text-emerald-300" : "text-red-300"}>{box.net >= 0 ? "+" : ""}{money(box.net, 0)}</span>
                </div>
                <div className="flex gap-2">{box.cards.map((card, index) => <PlayingCard key={index} card={card} size="sm" />)}</div>
                <p className="mt-2 text-xs text-zinc-500">{box.surrendered ? "Surrendered" : cardLabel(box.cards)} · Bet {money(box.bet ?? hand.bet, 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold">Context</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Running count" value={hand.runningCountBefore} />
            <Metric label="True count" value={hand.trueCountBefore.toFixed(1)} />
            <Metric label="Total wager" value={money(hand.bet, 0)} />
            <Metric label="Net result" value={`${hand.netResult >= 0 ? "+" : ""}${money(hand.netResult, 0)}`} />
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">Shoe summary</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Total hands" value={shoe.totalHands} />
            <Metric label="Total P/L" value={`${shoe.totalProfit >= 0 ? "+" : ""}${money(shoe.totalProfit, 0)}`} />
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-white/[.06] pt-5">
        <h3 className="font-semibold">Hand History</h3>
        <p className="mt-1 text-xs text-zinc-500">Click a row to view that hand.</p>
        <div className="mt-3 max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="sticky top-0 bg-[#0c0f0c] text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-3">#</th>
                <th>Hands</th>
                <th>Dealer</th>
                <th>TC</th>
                <th>Min</th>
                <th>Max</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {shoe.hands.map((row, index) => (
                <tr
                  key={row.handNumber}
                  onClick={() => setSelectedHandIndex(index)}
                  className={`cursor-pointer border-t border-white/[.06] hover:bg-white/[.03] ${index === selectedHandIndex ? "bg-emerald-300/[.05]" : ""}`}
                >
                  <td className="py-2.5">{row.roundInShoe}</td>
                  <td className="py-2.5">{row.playerHands.map((box) => `${cardLabel(box.cards)}(${box.net >= 0 ? "+" : ""}${money(box.net, 0)})`).join(" ")}</td>
                  <td className="py-2.5">{cardLabel(row.dealerCards)}</td>
                  <td className="py-2.5">{row.trueCountBefore.toFixed(1)}</td>
                  <td className="py-2.5">{row.tcMin.toFixed(1)}</td>
                  <td className="py-2.5">{row.tcMax.toFixed(1)}</td>
                  <td className={`py-2.5 ${row.netResult >= 0 ? "text-emerald-300" : "text-red-300"}`}>{row.netResult >= 0 ? "+" : ""}{money(row.netResult, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
