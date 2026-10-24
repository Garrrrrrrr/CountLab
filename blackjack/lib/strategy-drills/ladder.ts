/**
 * A cell's play across the true-count range, for the hand actually dealt.
 *
 * `countLadder` in lib/strategy answers for an original two-card hand at a
 * table that offers surrender. A drill also asks about hands that cannot
 * surrender or double (a three-card 16 against a 10), and those switch at the
 * stand index, not at the surrender threshold. This is the same loop with the
 * hand's permissions passed through to `cellDecision`, so it stays the
 * engine's answer at every count.
 */
import { cellDecision, takeInsurance, type CellRef, type LadderSegment, type Permissions, type TableRules } from "@/lib/strategy";

export function handLadder(rules: TableRules, cell: CellRef, permissions: Permissions, min = -6, max = 10): LadderSegment[] {
  const segments: LadderSegment[] = [];
  for (let tc = min; tc <= max; tc += 1) {
    const decision = cellDecision(rules, cell, tc, permissions);
    const last = segments[segments.length - 1];
    if (last && last.action === decision.action && last.fallback === decision.fallback) last.to = tc;
    else segments.push({ from: tc, to: tc, action: decision.action, fallback: decision.fallback });
  }
  return segments;
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
