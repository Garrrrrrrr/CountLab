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
  const bucketSizes = new Map<number, number>([[-1, 0], [0, 0], [1, 0]]);
  for (const card of cards) {
    const value = hiLoValue(card);
    bucketSizes.set(value, bucketSizes.get(value)! + 1);
  }

  let selection: { positive: number; neutral: number; negative: number } | undefined;
  let closestToNaturalMix = Number.POSITIVE_INFINITY;
  for (let positive = 0; positive <= Math.min(depthCards, bucketSizes.get(1)!); positive++) {
    const negative = positive - requiredRunningCount;
    const neutral = depthCards - positive - negative;
    if (negative < 0 || neutral < 0 || negative > bucketSizes.get(-1)! || neutral > bucketSizes.get(0)!) continue;

    // Share the required count shift between extra low cards and fewer high
    // cards while leaving the neutral ranks near their natural frequency.
    // Looking only at the positive-card distance makes 7/8/9 absorb the
    // difference, which visibly packs neutral cards into the stacked prefix.
    const candidates = new Map([[1, positive], [0, neutral], [-1, negative]]);
    const distance = [1, 0, -1].reduce((total, value) => {
      const expected = depthCards * (bucketSizes.get(value)! / cards.length);
      return total + ((candidates.get(value)! - expected) ** 2) / Math.max(1, expected);
    }, 0);
    if (distance < closestToNaturalMix) {
      selection = { positive, neutral, negative };
      closestToNaturalMix = distance;
    }
  }
  if (!selection) throw new Error("The requested stacked-shoe target is not possible with this shoe and depth");

  const arranged = [...cards];
  const targetCounts = new Map<number, number>([
    [1, selection.positive],
    [0, selection.neutral],
    [-1, selection.negative],
  ]);
  const prefixCounts = new Map<number, number>([[-1, 0], [0, 0], [1, 0]]);
  for (let index = 0; index < depthCards; index++) {
    const value = hiLoValue(arranged[index]);
    prefixCounts.set(value, prefixCounts.get(value)! + 1);
  }

  const surplusPositions: number[] = [];
  const surplusRemaining = new Map<number, number>([1, 0, -1].map((value) => [
    value,
    Math.max(0, prefixCounts.get(value)! - targetCounts.get(value)!),
  ]));
  // Pull replacements from the end of the prefix so the start of the shoe
  // remains a genuine shuffle and the count develops near the target depth.
  for (let index = depthCards - 1; index >= 0; index--) {
    const value = hiLoValue(arranged[index]);
    if (surplusRemaining.get(value)! > 0) {
      surplusPositions.push(index);
      surplusRemaining.set(value, surplusRemaining.get(value)! - 1);
    }
  }

  const neededValues: number[] = [];
  for (const value of [1, 0, -1]) {
    const deficit = Math.max(0, targetCounts.get(value)! - prefixCounts.get(value)!);
    for (let count = 0; count < deficit; count++) neededValues.push(value);
  }
  for (const neededValue of neededValues) {
    const prefixIndex = surplusPositions.shift();
    const replacementIndex = arranged.findIndex((card, index) => index >= depthCards && hiLoValue(card) === neededValue);
    if (prefixIndex === undefined || replacementIndex < 0) {
      throw new Error("The requested stacked-shoe target is not possible with this shoe and depth");
    }
    [arranged[prefixIndex], arranged[replacementIndex]] = [arranged[replacementIndex], arranged[prefixIndex]];
  }

  return arranged;
}
