import { hiLoValue } from "./hiLo";
import type { Card } from "./types";

export interface StackedShoeOptions {
  targetTrueCount: number;
  depth: number;
}

/**
 * Reorders a shuffled, complete shoe without adding or removing cards.
 *
 * `cards` is in deal order (the first item is dealt first). The selected prefix
 * reaches the requested floored true count at `depth`; the remaining shuffled
 * cards then play out normally.
 */
export function arrangeStackedShoe(cards: readonly Card[], options: StackedShoeOptions): Card[] {
  if (!cards.length || options.targetTrueCount <= 0) return [...cards];

  const depthCards = Math.max(1, Math.min(cards.length - 1, Math.round(cards.length * options.depth)));
  const decksRemaining = (cards.length - depthCards) / 52;
  const requiredRunningCount = Math.ceil(options.targetTrueCount * decksRemaining);
  const buckets = new Map<number, Card[]>([[-1, []], [0, []], [1, []]]);
  for (const card of cards) buckets.get(hiLoValue(card))!.push(card);

  let selection: { positive: number; neutral: number; negative: number } | undefined;
  let closestToNaturalMix = Number.POSITIVE_INFINITY;
  for (let positive = 0; positive <= Math.min(depthCards, buckets.get(1)!.length); positive++) {
    const negative = positive - requiredRunningCount;
    const neutral = depthCards - positive - negative;
    if (negative < 0 || neutral < 0 || negative > buckets.get(-1)!.length || neutral > buckets.get(0)!.length) continue;
    const distance = Math.abs(positive - depthCards * (buckets.get(1)!.length / cards.length));
    if (distance < closestToNaturalMix) {
      selection = { positive, neutral, negative };
      closestToNaturalMix = distance;
    }
  }
  if (!selection) throw new Error("The requested stacked-shoe target is not possible with this shoe and depth");

  const selected = new Map<number, Card[]>([
    [1, buckets.get(1)!.slice(0, selection.positive)],
    [0, buckets.get(0)!.slice(0, selection.neutral)],
    [-1, buckets.get(-1)!.slice(0, selection.negative)],
  ]);
  const selectedCards = new Set([...selected.get(1)!, ...selected.get(0)!, ...selected.get(-1)!]);
  const prefix: Card[] = [];
  let runningCount = 0;
  for (let index = 0; index < depthCards; index++) {
    const ideal = requiredRunningCount * ((index + 1) / depthCards);
    const available = [1, 0, -1].filter((value) => selected.get(value)!.length > 0);
    const value = available.sort((left, right) =>
      Math.abs(runningCount + left - ideal) - Math.abs(runningCount + right - ideal),
    )[0];
    prefix.push(selected.get(value)!.shift()!);
    runningCount += value;
  }

  return [...prefix, ...cards.filter((card) => !selectedCards.has(card))];
}
