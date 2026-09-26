"use client";
import { ReactNode, useEffect, useState } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import { announce, Button, Disclosure, GhostButton, KeyHint } from "@/components/ui";
import { hiLoValue, runningCount } from "@/lib/blackjack/hiLo";
import { displaySigned as signed } from "@/lib/blackjack/numericAnswer";
import type { Card } from "@/lib/blackjack/types";
import type { RunningCheckpoint } from "@/lib/blackjack/countingSetup";

const SUIT = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" } as const;
const RANK_NAME: Record<string, string> = { A: "Ace", K: "King", Q: "Queen", J: "Jack" };
export const cardName = (card: Card) => `${RANK_NAME[card.rank] ?? card.rank} of ${card.suit}`;
const valueText = (card: Card) => { const value = hiLoValue(card); return value > 0 ? "+1" : value < 0 ? "−1" : "0"; };

/** The cards on screen, placed a little differently each time like a real deal. */
export function CardGroup({ cards, seed, animated, hints }: { cards: Card[]; seed: number; animated: boolean; hints: boolean }) {
  const layouts = ["justify-center", "justify-center sm:justify-start sm:pl-10 md:pl-16", "justify-center sm:justify-end sm:pr-10 md:pr-16"];
  return (
    <ul aria-label="Cards on the table" className={`flex min-h-44 flex-wrap items-center gap-2 sm:min-h-52 ${layouts[seed % layouts.length]}`}>
      {cards.map((card, index) => (
        <li key={`${seed}-${card.rank}-${card.suit}-${index}`} className="flex flex-col items-center gap-2" style={{ transform: `rotate(${((seed + index * 3) % 9) - 4}deg) translateY(${(index % 3) * 4}px)` }}>
          <PlayingCard card={card} animated={animated} size={cards.length >= 4 ? "sm" : "md"} />
          {hints && <span className="rounded-full border border-[var(--rule)] bg-[var(--paper-raised)] px-2 font-data text-xs font-semibold text-[var(--ink)]">{valueText(card)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Where the next check comes, in words, for the line under the cards. */
export function nextCheckText(checkpoint: RunningCheckpoint, cursor: number, total: number) {
  if (checkpoint === "5" || checkpoint === "10") {
    const step = Number(checkpoint);
    return `Next check: after card ${Math.min(total, (Math.floor(cursor / step) + 1) * step)}`;
  }
  if (checkpoint === "final") return "One check, at the end";
  if (checkpoint === "random") return "Checks come at random moments";
  return "Check when the count reaches or crosses zero";
}

/**
 * A short "3, 2, 1" before the first card so a phone that is still scrolling
 * (or a reader still moving their hand) does not miss it. A single "Ready"
 * when reduced motion is on. Not counted in the session time.
 */
export function ReadyCountdown({ reducedMotion, onDone }: { reducedMotion: boolean; onDone: () => void }) {
  const [step, setStep] = useState(reducedMotion ? 0 : 3);
  useEffect(() => { announce("Get ready. Cards are coming."); }, []);
  useEffect(() => {
    const id = setTimeout(() => (step <= 1 ? onDone() : setStep(step - 1)), reducedMotion ? 800 : 650);
    return () => clearTimeout(id);
  }, [step, reducedMotion, onDone]);
  return (
    <div className="grid min-h-52 place-items-center text-center">
      <div>
        <p className="text-sm font-medium text-[var(--ink-muted)]">Get ready</p>
        <p aria-hidden="true" className="mt-2 font-data text-6xl font-semibold text-[var(--ink)]">{step || "Ready"}</p>
      </div>
    </div>
  );
}

function CenteredPanel({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-64 place-items-center py-4 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-overlay/[.07] text-xl text-[var(--ink)]"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
        <h2 className="mt-4 text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Paused: the cards on the table when the reader paused count as dealt, so
 * the place, the last cards and the count all agree, and resuming deals the
 * next card. The count stays hidden unless asked for, so pausing never
 * spoils the next check.
 */
export function PausedView({ cursor, total, count, last, hints, onResume, shortcuts }: { cursor: number; total: number; count: number; last: Card[]; hints: boolean; onResume: () => void; shortcuts: boolean }) {
  const [reveal, setReveal] = useState(false);
  return (
    <CenteredPanel icon="fa-pause" title="Paused">
      <p className="mt-2 text-[var(--ink-muted)]">{cursor ? `Paused after card ${cursor} of ${total}.` : "Paused before the first card."} Your place is saved.</p>
      {cursor > 0 && last.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-[var(--ink-muted)]">
          <span>{last.length === 1 ? "Last card dealt" : "Last cards dealt"}</span>
          <CardChips cards={last} values={hints} />
        </div>
      )}
      <div className="mt-4">
        <GhostButton size="compact" aria-pressed={reveal} onClick={() => setReveal((shown) => !shown)}>
          <i className={`fa-solid ${reveal ? "fa-eye-slash" : "fa-eye"} mr-1.5 text-xs`} aria-hidden="true" />{reveal ? "Hide my count" : "Show my count"}
        </GhostButton>
        {reveal && <p className="mt-3 text-sm text-[var(--ink-muted)]">Running count so far{cursor > 0 && `, through card ${cursor}`} <span className="mt-1 block font-data text-5xl font-semibold text-[var(--ink)]">{signed(count)}</span></p>}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onResume} className="min-w-44">Resume session</Button>
        {shortcuts && <span className="hidden items-center gap-1.5 text-xs text-[var(--ink-muted)] [@media(pointer:fine)]:flex"><KeyHint>P</KeyHint> or <KeyHint>Enter</KeyHint></span>}
      </div>
    </CenteredPanel>
  );
}

export function InterruptionView({ onReturn }: { onReturn: () => void }) {
  return (
    <CenteredPanel icon="fa-phone" title="Interruption">
      <p className="mt-2 text-[var(--ink-muted)]">Look away and hold your count. Come back when you are ready.</p>
      <Button onClick={onReturn} className="mt-5 min-w-44">Return to the table</Button>
    </CenteredPanel>
  );
}

const chip = "inline-flex items-center gap-1 rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-1.5 py-0.5 font-data text-xs text-[var(--ink)]";
function CardChips({ cards, values = true }: { cards: Card[]; values?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {cards.map((card, index) => (
        <li key={index} className={chip} aria-label={values ? `${cardName(card)}, ${valueText(card)}` : cardName(card)}>
          <span aria-hidden="true">{card.rank}{SUIT[card.suit]}</span>
          {values && <span aria-hidden="true" className="text-[var(--ink-muted)]">{valueText(card)}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * The cards dealt since the previous check, so a miss can be traced: the
 * count carried in, a tally by value, and the last few cards.
 */
export function CardRecap({ before, cards }: { before: Card[]; cards: Card[] }) {
  if (!cards.length) return null;
  const values = cards.map(hiLoValue);
  const plus = values.filter((value) => value > 0).length;
  const zero = values.filter((value) => value === 0).length;
  const minus = values.filter((value) => value < 0).length;
  const start = runningCount(before);
  const net = runningCount(cards);
  const recent = cards.slice(-10);
  return (
    <Disclosure summary={`Show the ${cards.length} ${cards.length === 1 ? "card" : "cards"} since the last check`}>
      <div className="space-y-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3 text-sm">
        <p className="font-data text-xs leading-6 text-[var(--ink)]">
          Count carried in {signed(start)} · +1 ×{plus} · 0 ×{zero} · −1 ×{minus} · net {signed(net)} · count now {signed(start + net)}
        </p>
        {cards.length > recent.length && <p className="text-xs text-[var(--ink-muted)]">The last {recent.length}:</p>}
        <CardChips cards={recent} />
        {cards.length > recent.length && (
          <Disclosure summary={`Show all ${cards.length}`}>
            <CardChips cards={cards} />
          </Disclosure>
        )}
      </div>
    </Disclosure>
  );
}
