"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { PlayingCard } from "@/components/blackjack";
import { announce } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import type { TableCard, TableRound } from "@/lib/blackjack/countingTraining";
import { hiLoValue, runningCount } from "@/lib/blackjack/hiLo";
import type { Card } from "@/lib/blackjack/types";
import { CardChips, Disclosure, signedText } from "../counting-shared/parts";

/**
 * Card width for a group of `n` on screen: as large as a phone allows, one
 * row, never wider than reads comfortably on a desktop.
 */
const GROUP_WIDTH: Record<number, string> = {
  1: "min(176px, calc(100vw - 6rem))",
  2: "min(150px, calc((100vw - 4.5rem) / 2))",
  3: "min(124px, calc((100vw - 5rem) / 3))",
  4: "min(104px, calc((100vw - 5.5rem) / 4))",
};

function ValueBadge({ card }: { card: Card }) {
  const value = hiLoValue(card);
  return (
    <span aria-hidden className={cx("tnum mt-2 inline-grid h-6 min-w-9 place-items-center rounded-full px-2 text-xs font-bold", value > 0 ? "bg-pos text-white" : value < 0 ? "bg-neg text-white" : "bg-white/85 text-black/70")}>
      {signedText(value)}
    </span>
  );
}

/** The group of cards on the felt, placed a little differently each time like a real deal. */
export function CardGroupView({ cards, seed, animate, hints }: { cards: Card[]; seed: number; animate: boolean; hints: boolean }) {
  const width = GROUP_WIDTH[Math.min(4, Math.max(1, cards.length))];
  return (
    <ul aria-label="Cards on the table" className="flex flex-nowrap items-center justify-center gap-2.5">
      {cards.map((card, index) => (
        <li key={`${seed}-${index}`} className="flex flex-col items-center" style={{ transform: `rotate(${((seed * 7 + index * 3) % 7) - 3}deg) translateY(${((seed + index) % 3) * 3}px)` }}>
          <PlayingCard card={card} animate={animate} delay={animate ? index * 45 : 0} style={{ "--card-w": width } as CSSProperties} />
          {hints && <ValueBadge card={card} />}
        </li>
      ))}
    </ul>
  );
}

/** Card widths at the table by how many spots it has, phones first. Literal strings so Tailwind keeps them. */
const TABLE_CARD: Record<number, string> = {
  1: "[--hand-w:88px] sm:[--hand-w:104px]",
  2: "[--hand-w:72px] sm:[--hand-w:96px]",
  3: "[--hand-w:60px] sm:[--hand-w:88px]",
  5: "[--hand-w:50px] sm:[--hand-w:72px]",
  7: "[--hand-w:44px] sm:[--hand-w:62px]",
};
const SEAT_COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 5: "grid-cols-3", 7: "grid-cols-4" };

/**
 * One hand, overlapped like a dealt hand. Each card shows 42% of its width,
 * or less when the hand would not fit its spot: the step is worked out from
 * the spot's width (a size container), so a long hand never spills into the
 * next spot on a phone.
 */
function Hand({ entries, revealed, animate, hints, label, share = 1 }: { entries: TableCard[]; revealed: number; animate: boolean; hints: boolean; label: string; share?: number }) {
  const shown = entries.filter((entry) => revealed > entry.at || (entry.downFrom !== undefined && revealed >= entry.downFrom));
  const room = share > 1 ? `(100cqw / ${share} - 0.5rem)` : "100cqw";
  const step = `max(var(--hand-w) * 0.2, min(var(--hand-w) * 0.42, (${room} - var(--hand-w)) / ${Math.max(1, entries.length - 1)}))`;
  return (
    <div role="group" aria-label={label} className="flex min-h-[calc(var(--hand-w)*1.4)] justify-center">
      {shown.map((entry, index) => {
        const faceDown = revealed <= entry.at;
        const fresh = animate && (entry.at === revealed - 1 || (faceDown && revealed === entry.downFrom));
        return (
          <div key={entry.at} className="flex flex-col items-center" style={index ? { marginLeft: `calc(${step} - var(--hand-w))` } : undefined}>
            <PlayingCard card={entry.card} faceDown={faceDown} animate={fresh} style={{ "--card-w": "var(--hand-w)" } as CSSProperties} />
            {hints && !faceDown && <span aria-hidden className={cx("tnum mt-1 text-[0.625rem] font-bold", hiLoValue(entry.card) > 0 ? "text-white" : hiLoValue(entry.card) < 0 ? "text-white/70" : "text-white/40")}>{signedText(hiLoValue(entry.card))}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A table round as it stands: the dealer at the top, the spots along the
 * bottom. `revealed` is how many of the round's cards are face up.
 */
export function TableView({ round, revealed, spots, animate, hints, roundNumber, rules }: { round: TableRound; revealed: number; spots: number; animate: boolean; hints: boolean; roundNumber: number; rules?: string }) {
  return (
    <div className={cx("flex w-full flex-1 flex-col justify-between gap-5 py-2", TABLE_CARD[spots] ?? TABLE_CARD[3])}>
      <div className="flex flex-col items-center gap-1.5 [container-type:inline-size]">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/60">Dealer · round {roundNumber}</span>
        <Hand entries={round.dealer} revealed={revealed} animate={animate} hints={hints} label="Dealer's cards" />
      </div>
      {rules && <p aria-hidden className="text-center text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-white/25">{rules}</p>}
      <ul aria-label="Player spots" className={cx("grid items-end gap-x-2 gap-y-4", SEAT_COLUMNS[spots] ?? "grid-cols-3")}>
        {round.seats.map((hands, spot) => (
          <li key={spot} className="flex min-w-0 flex-col items-center gap-1.5 [container-type:inline-size]">
            <div className="flex w-full items-end justify-center gap-x-2">
              {hands.map((hand, index) => (
                <Hand key={index} entries={hand} revealed={revealed} animate={animate} hints={hints} share={hands.length} label={`Spot ${spot + 1}${hands.length > 1 ? `, hand ${index + 1}` : ""}`} />
              ))}
            </div>
            <span className="text-[0.6875rem] font-medium text-white/55">Spot {spot + 1}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The cards since the previous check, so a miss can be traced: the count
 * carried in, the tally by value, and the cards themselves.
 */
export function CardRecap({ before, cards, className }: { before: Card[]; cards: Card[]; className?: string }) {
  if (!cards.length) return null;
  const values = cards.map(hiLoValue);
  const plus = values.filter((value) => value > 0).length;
  const zero = values.filter((value) => value === 0).length;
  const minus = values.filter((value) => value < 0).length;
  const start = runningCount(before);
  const net = runningCount(cards);
  const recent = cards.slice(-12);
  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-3.5 text-sm", className)}>
      <p className="font-semibold">Since the last check: {cards.length} {cards.length === 1 ? "card" : "cards"}</p>
      <dl className="tnum mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {[
          ["Carried in", signedText(start)],
          ["+1 cards", String(plus)],
          ["0 cards", String(zero)],
          ["−1 cards", String(minus)],
          ["Net", signedText(net)],
          ["Count now", signedText(start + net)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2 px-1 py-1.5 [@media(max-height:700px)]:py-1">
            <dt className="text-[0.6875rem] text-ink-3">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        {cards.length > recent.length && <p className="mb-1.5 text-xs text-ink-3">The last {recent.length}:</p>}
        <CardChips cards={recent} />
      </div>
      {cards.length > recent.length && (
        <Disclosure summary={`All ${cards.length} cards`} className="mt-3">
          <CardChips cards={cards} />
        </Disclosure>
      )}
    </div>
  );
}

/**
 * "3, 2, 1" before the first card, so a hand still moving to the phone does
 * not miss it; a single "Ready" with reduced motion. Not session time.
 */
export function ReadyCountdown({ reducedMotion, onDone }: { reducedMotion: boolean; onDone: () => void }) {
  const [step, setStep] = useState(reducedMotion ? 0 : 3);
  useEffect(() => { announce("Get ready. Cards are coming."); }, []);
  useEffect(() => {
    const id = window.setTimeout(() => (step <= 1 ? onDone() : setStep(step - 1)), reducedMotion ? 800 : 600);
    return () => window.clearTimeout(id);
  }, [step, reducedMotion, onDone]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-white/70">Get ready</p>
      <p aria-hidden key={step} className="tnum animate-pop mt-1 text-7xl font-semibold text-white">{step || "Ready"}</p>
    </div>
  );
}
