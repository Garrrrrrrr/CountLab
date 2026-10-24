import { countLadder, takeInsurance, type CellRef, type LadderSegment, type Permissions, type TableRules } from "@/lib/strategy";

/** A cell's play across the true-count range for the hand actually dealt (with its own permissions). */
export function handLadder(rules: TableRules, cell: CellRef, permissions: Permissions, min = -6, max = 10): LadderSegment[] {
  return countLadder(rules, cell, min, max, permissions);
}

/** Insurance across the range: decline, then take from the index up. */
export function insuranceLadder(min = -6, max = 10): { from: number; to: number; take: boolean }[] {
  const segments: { from: number; to: number; take: boolean }[] = [];
  for (let tc = min; tc <= max; tc += 1) {
    const take = takeInsurance(tc);
    const last = segments[segments.length - 1];
    if (last && last.take === take) last.to = tc;
    else segments.push({ from: tc, to: tc, take });
  }
  return segments;
}

/** The usual −6…+10 range, widened so the index and the count on the table both sit inside it. */
export function ladderDomain(points: readonly number[], min = -6, max = 10): { min: number; max: number } {
  return { min: Math.min(min, ...points.map((point) => point - 2)), max: Math.max(max, ...points.map((point) => point + 2)) };
}
