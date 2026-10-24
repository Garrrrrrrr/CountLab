/**
 * Picks card sizes so a round always fits the felt without scrolling: one
 * hand gets big cards, a table of split hands gets smaller ones, and only a
 * row too wide even for the smallest cards scrolls (inside its own rail).
 *
 * Widths mirror CARD_SIZES in components/blackjack/PlayingCard.tsx; height is
 * always 1.4 × width there too.
 */
export type FeltCardSize = "xs" | "sm" | "md" | "lg" | "xl";

export const FELT_CARD_WIDTH: Record<FeltCardSize, number> = { xs: 34, sm: 44, md: 58, lg: 76, xl: 96 };
const ORDER: FeltCardSize[] = ["xl", "lg", "md", "sm", "xs"];

/** Share of each overlapped card left showing. */
export const CARD_REVEAL = 0.4;
export const HAND_GAP = 8;
export const SEAT_GAP = 16;
/** Label, captions, gaps and padding around the two card rows. */
export const FELT_CHROME = 92;

export const handWidth = (size: FeltCardSize, cards: number) => {
  const width = FELT_CARD_WIDTH[size];
  return width + Math.max(0, cards - 1) * width * CARD_REVEAL;
};

/** Width of the seats row: hands side by side within a seat, seats apart. */
export function rowWidth(size: FeltCardSize, seats: readonly (readonly number[])[]): number {
  return seats.reduce((sum, hands, index) => sum + (index ? SEAT_GAP : 0) + hands.reduce((inner, cards, h) => inner + (h ? HAND_GAP : 0) + handWidth(size, Math.max(2, cards)), 0), 0);
}

export interface FeltLayout {
  dealer: FeltCardSize;
  player: FeltCardSize;
  /** The seats row is wider than the felt even at the smallest size and must scroll. */
  overflow: boolean;
}

/**
 * `seats` lists, per seat in play, the number of cards in each hand.
 * `reserve` is the width kept clear on each side of the dealer's cards
 * (the discard tray sits in one corner).
 */
export function pickCardSizes({ width, height, dealerCards, seats, reserve = 0, max = "xl" }: {
  width: number; height: number; dealerCards: number; seats: readonly (readonly number[])[]; reserve?: number; max?: FeltCardSize;
}): FeltLayout {
  const sizes = ORDER.slice(ORDER.indexOf(max));
  const dealerRoom = Math.max(0, width - 2 * reserve);
  const fitsDealer = (size: FeltCardSize) => handWidth(size, Math.max(2, dealerCards)) <= dealerRoom;
  const fitsHeight = (dealer: FeltCardSize, player: FeltCardSize) => 1.4 * (FELT_CARD_WIDTH[dealer] + FELT_CARD_WIDTH[player]) + FELT_CHROME <= height;
  const seatsRow = seats.length ? seats : [[2]];
  for (const player of sizes) {
    if (rowWidth(player, seatsRow) > width) continue;
    // The dealer's cards may be one size smaller than the player's to save
    // height (more only when a long dealer hand needs the width), so the two
    // rows still read as one table.
    const from = sizes.indexOf(player);
    const widest = sizes.slice(from).findIndex(fitsDealer);
    if (widest < 0) continue;
    const dealer = sizes.slice(from + widest, from + widest + 2).find((size) => fitsHeight(size, player));
    if (dealer) return { dealer, player, overflow: false };
  }
  const smallest = sizes[sizes.length - 1];
  return { dealer: smallest, player: smallest, overflow: rowWidth(smallest, seatsRow) > width };
}
