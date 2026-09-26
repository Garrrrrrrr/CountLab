"use client";
import type { ReactNode } from "react";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card } from "@/lib/blackjack/types";
import { useMediaQuery } from "@/lib/useMediaQuery";

const RANK_NAME: Partial<Record<Card["rank"], string>> = { A: "ace", J: "jack", Q: "queen", K: "king" };
const cardName = (card: Card) => `${RANK_NAME[card.rank] ?? card.rank} of ${card.suit}`;

/**
 * The hand as a table reads: your cards, then the dealer's upcard, on one row
 * at every width so the whole decision fits a phone screen with its answer.
 * The cards are pictures; screen readers get one sentence instead.
 */
export function HandTable({ player, dealer, animated = false, children, dealKey }: {
  /** Omitted for insurance, which is decided on the upcard and the count alone. */
  player?: readonly Card[];
  dealer: Card;
  animated?: boolean;
  /** Extra table information under the cards (the count, for index plays). */
  children?: ReactNode;
  /** Changes with every hand, so the deal animation replays. */
  dealKey?: number;
}) {
  const wide = useMediaQuery("(min-width: 640px)");
  const size = wide ? "md" : "sm";
  return (
    <div className="min-w-0">
      <p className="sr-only">{player ? `Your hand: ${player.map(cardName).join(", ")}. ` : ""}Dealer shows the {cardName(dealer)}.</p>
      <div aria-hidden="true" className="flex items-end justify-center gap-4 sm:gap-10">
        {player && (
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)]">Your hand</p>
            <div key={dealKey} className="flex gap-2">
              {player.map((card, index) => <PlayingCard key={index} card={card} size={size} animated={animated} dealIndex={index} fast />)}
            </div>
          </div>
        )}
        {player && <span className="mb-8 font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--ink-muted)] sm:mb-12">vs</span>}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--ink-muted)]">Dealer shows</p>
          <div key={dealKey}>
            <PlayingCard card={dealer} size={size} animated={animated} dealIndex={2} fast />
          </div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
