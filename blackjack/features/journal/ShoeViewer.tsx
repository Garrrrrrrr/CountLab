"use client";
import { useMemo, useRef, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton, Segmented, cx } from "@/components/ui";
import { PlayingCard } from "@/components/blackjack";
import { track } from "@/lib/analytics/track";
import { percent, plural, signedMoney, trueCountLabel } from "@/lib/blackjack/journalFormat";
import type { SimulatedShoe, ShoeSimulationResult } from "@/lib/blackjack/shoeSimulation";
import { exactMoney, toneClass } from "./model";
import { Figure } from "./parts";

type Sort = "order" | "profit" | "loss" | "count";
const net = (value: number) => signedMoney(value, value % 1 ? 2 : 0);
const tc = (value: number) => trueCountLabel(Number(value.toFixed(1)));

/** One shoe, hand by hand: the cards, the count before the deal, the bet and what it paid. */
function ShoeHands({ shoe, onBack }: { shoe: SimulatedShoe; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const hand = shoe.hands[index];
  if (!hand) return null;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 h-11" icon={<ArrowLeft size={16} aria-hidden />} onClick={onBack}>All shoes</Button>
        <h4 ref={heading} tabIndex={-1} className="mt-1 text-base font-semibold outline-none">Shoe {shoe.shoeNumber} · {plural(shoe.totalHands, "hand")} · <span className={toneClass(shoe.totalProfit)}>{net(shoe.totalProfit)}</span></h4>
      </div>
      <div className="rounded-2xl bg-felt p-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <IconButton label="Previous hand" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={20} aria-hidden /></IconButton>
          <p className="tnum text-sm font-semibold" aria-live="polite">Hand {hand.roundInShoe} of {shoe.totalHands}</p>
          <IconButton label="Next hand" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={index === shoe.hands.length - 1} onClick={() => setIndex((value) => Math.min(shoe.hands.length - 1, value + 1))}><ChevronRight size={20} aria-hidden /></IconButton>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Dealer</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{hand.dealerCards.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} size="sm" />)}</div>
        {hand.playerHands.map((box, boxIndex) => (
          <div key={boxIndex} className="mt-3 border-t border-white/15 pt-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold uppercase tracking-[0.12em] text-white/70">{hand.playerHands.length > 1 ? `Hand ${boxIndex + 1}` : "You"}</span>
              <span className="tnum font-semibold">{box.surrendered ? "Surrendered · " : ""}Bet {exactMoney(box.bet ?? hand.bet)} · {net(box.net)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{box.cards.map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} size="sm" />)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 xs:grid-cols-4">
        <Figure label="Running count" value={trueCountLabel(hand.runningCountBefore)} />
        <Figure label="True count" value={tc(hand.trueCountBefore)} />
        <Figure label="Bet per hand" value={exactMoney(hand.bet)} />
        <Figure label="Result" value={net(hand.netResult)} tone={hand.netResult > 0 ? "pos" : hand.netResult < 0 ? "neg" : undefined} />
      </div>
      <div>
        <h5 className="eyebrow mb-2">Every hand</h5>
        <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-line p-1" aria-label={`Hands in shoe ${shoe.shoeNumber}`}>
          {shoe.hands.map((row, rowIndex) => (
            <li key={row.handNumber}>
              <button type="button" aria-current={rowIndex === index ? "true" : undefined} onClick={() => setIndex(rowIndex)}
                className={cx("tnum flex h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm", rowIndex === index ? "bg-brand/15 font-semibold" : "hover:bg-surface-2")}>
                <span>Hand {row.roundInShoe}</span>
                <span className="text-ink-3">TC {tc(row.trueCountBefore)} · bet {exactMoney(row.bet)}</span>
                <span className={toneClass(row.netResult)}>{net(row.netResult)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * A representative simulation of the session's game: every shoe it dealt,
 * then any shoe hand by hand. Not the session's real cards, which CountLab
 * never recorded.
 */
export function ShoeViewer({ result, capped }: { result: ShoeSimulationResult; capped: boolean }) {
  const [sort, setSort] = useState<Sort>("order");
  const [open, setOpen] = useState<number | null>(null);
  const winning = result.shoes.filter((shoe) => shoe.totalProfit > 0).length;
  const sorted = useMemo(() => {
    const rows = result.shoes.map((shoe, index) => ({ shoe, index }));
    if (sort === "profit") rows.sort((a, b) => b.shoe.totalProfit - a.shoe.totalProfit);
    if (sort === "loss") rows.sort((a, b) => a.shoe.totalProfit - b.shoe.totalProfit);
    if (sort === "count") rows.sort((a, b) => b.shoe.tcMax - a.shoe.tcMax);
    return rows;
  }, [result.shoes, sort]);

  if (open !== null && result.shoes[open]) return <ShoeHands shoe={result.shoes[open]} onBack={() => setOpen(null)} />;
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 xs:grid-cols-4">
        <Figure label="Hands" value={result.totalHands.toLocaleString("en-US")} sub={capped ? "First 2,000 of the session" : undefined} />
        <Figure label="Shoes" value={result.totalShoes.toLocaleString("en-US")} />
        <Figure label="Result" value={net(result.totalProfit)} tone={result.totalProfit > 0 ? "pos" : result.totalProfit < 0 ? "neg" : undefined} />
        <Figure label="Winning shoes" value={percent(result.shoes.length ? winning / result.shoes.length : 0, 0)} />
      </div>
      <Segmented<Sort> label="Sort shoes" value={sort} onChange={setSort} size="sm"
        options={[{ value: "order", label: "In order" }, { value: "profit", label: "Best" }, { value: "loss", label: "Worst" }, { value: "count", label: "Top TC" }]} />
      <ul className="card divide-y divide-line overflow-hidden" aria-label="Simulated shoes">
        {sorted.map(({ shoe, index }) => (
          <li key={shoe.shoeNumber}>
            <button type="button" onClick={() => { track("shoe_viewed", { shoeNumber: shoe.shoeNumber, totalProfit: shoe.totalProfit, totalHands: shoe.totalHands }); setOpen(index); }}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Shoe {shoe.shoeNumber}</span>
                <span className="tnum block text-xs text-ink-3">{plural(shoe.totalHands, "hand")} · TC {tc(shoe.tcMin)} to {tc(shoe.tcMax)}</span>
              </span>
              <span className={cx("tnum shrink-0 font-semibold", toneClass(shoe.totalProfit))}>{net(shoe.totalProfit)}</span>
              <ChevronRight size={18} aria-hidden className="-mr-1 shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
