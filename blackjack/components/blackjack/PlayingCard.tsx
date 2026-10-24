import type { CSSProperties } from "react";
import type { Card, Rank, Suit } from "@/lib/blackjack/types";
import { cx } from "@/components/ui/cx";

const GLYPH: Record<Suit, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const RANK_NAME: Record<Rank, string> = { A: "Ace", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine", "10": "Ten", J: "Jack", Q: "Queen", K: "King" };

export const cardName = (card: Card) => `${RANK_NAME[card.rank]} of ${card.suit}`;

/** Widths in px. Height is always 1.4× and type scales with the width. */
export const CARD_SIZES = { xs: 34, sm: 44, md: 58, lg: 76, xl: 96, "2xl": 124 } as const;
export type CardSize = keyof typeof CARD_SIZES;

/**
 * A playing card drawn in CSS, so it is crisp at any size and costs no images.
 *
 * Size is a CSS variable, which lets a caller make it responsive with classes:
 * `size="md" className="sm:[--card-w:76px]"`.
 */
export function PlayingCard({ card, faceDown = false, size = "md", className, style, animate = false, delay = 0 }: {
  card?: Card; faceDown?: boolean; size?: CardSize; className?: string; style?: CSSProperties; animate?: boolean; delay?: number;
}) {
  // The size falls back to `size` unless a class sets --card-w, so `sm:[--card-w:76px]` can make a card responsive.
  const base = `${CARD_SIZES[size]}px`;
  const sizing = { width: `var(--card-w, ${base})`, height: `calc(var(--card-w, ${base}) * 1.4)`, fontSize: `calc(var(--card-w, ${base}) * 0.3)`, animationDelay: delay ? `${delay}ms` : undefined, ...style } as CSSProperties;
  if (faceDown || !card) {
    return (
      <div role="img" aria-label="Face-down card" style={sizing} className={cx("relative shrink-0 rounded-[0.14em] p-[0.12em] shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]", animate && "animate-deal", "bg-[#f7f4ec]", className)}>
        <div className="h-full w-full rounded-[0.1em] bg-[#1b2433] [background-image:repeating-linear-gradient(45deg,rgb(245_185_60/0.32)_0_2px,transparent_2px_7px),repeating-linear-gradient(-45deg,rgb(245_185_60/0.32)_0_2px,transparent_2px_7px)]" />
      </div>
    );
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const corner = (
    <span className="flex flex-col items-center font-bold leading-[0.9] tracking-[-0.04em]">
      <span>{card.rank}</span>
      <span className="text-[0.72em] leading-none">{GLYPH[card.suit]}</span>
    </span>
  );
  return (
    <div
      role="img"
      aria-label={cardName(card)}
      style={sizing}
      className={cx(
        "relative shrink-0 select-none overflow-hidden rounded-[0.14em] border border-black/10 bg-[#fbfaf6] shadow-[0_6px_16px_-6px_rgb(0_0_0/0.45)]",
        red ? "text-[#c8202f]" : "text-[#16181d]",
        animate && "animate-deal",
        className,
      )}
    >
      <span className="absolute left-[0.16em] top-[0.14em]">{corner}</span>
      <span className="absolute inset-0 grid place-items-center text-[1.5em] leading-none" aria-hidden>{GLYPH[card.suit]}</span>
      <span className="absolute bottom-[0.14em] right-[0.16em] rotate-180">{corner}</span>
    </div>
  );
}

/** Cards overlapped like a dealt hand. `overlap` is the share of each card left visible. */
export function CardRow({ cards, size = "md", overlap = 0.42, faceDownIndex, className, animate = false, label }: {
  cards: Card[]; size?: CardSize; overlap?: number; faceDownIndex?: number; className?: string; animate?: boolean; label?: string;
}) {
  const width = CARD_SIZES[size];
  return (
    <div role="group" aria-label={label} className={cx("flex", className)}>
      {cards.map((card, index) => (
        <PlayingCard key={index} card={card} size={size} faceDown={index === faceDownIndex} animate={animate} delay={animate ? index * 60 : 0}
          style={index ? { marginLeft: -width * (1 - overlap) } : undefined} />
      ))}
    </div>
  );
}
