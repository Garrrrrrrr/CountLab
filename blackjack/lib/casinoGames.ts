export function comparePokerRanks(first: number[], second: number[]) {
  for (let index = 0; index < Math.max(first.length, second.length); index++) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export const pokerHandNames = [
  "High card",
  "One pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;

export function pokerHandName(rank: number[]) {
  return pokerHandNames[rank[0]] ?? "Poker hand";
}

/** Net Trips profit in betting units; a non-qualifying hand loses one unit. */
export function uthTripsNet(rank: number[]) {
  const category = rank[0];
  if (category === 8 && rank[1] === 14) return 50;
  return ({ 8: 40, 7: 30, 6: 8, 5: 7, 4: 4, 3: 3 } as Record<number, number>)[category] ?? -1;
}

export function shuffledDeck(random: () => number = Math.random) {
  const cards = Array.from({ length: 52 }, (_, index) => index);
  for (let index = cards.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
  return cards;
}
