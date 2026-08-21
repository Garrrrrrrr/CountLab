import { Action, Rank } from "./types";
import { getBasicStrategyDecision } from "./basicStrategy";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { S17_PRO_DEVIATIONS } from "./s17Pro";
export type DeviationAction = Action | "I" | "N";
export const DEVIATION_ACTION_NAMES:Record<DeviationAction,string>={H:"Hit",S:"Stand",D:"Double",P:"Split",R:"Surrender",I:"Take insurance",N:"Decline insurance"};
export interface Deviation {
  hand: string;
  dealer: string;
  index: number;
  normalAction: DeviationAction;
  deviationAction: DeviationAction;
  direction?: "atOrAbove" | "atOrBelow";
  always?: true;
  priority?: number;
  overridesSurrender?: true;
}
/** The supplied H17 Pro catalog; kept as the default/legacy export. */
export const DEVIATIONS:Deviation[] = [...H17_PRO_DEVIATIONS];
export const deviationDecision=(d:Deviation,tc:number)=>((d.direction==="atOrBelow"?tc<=d.index:tc>=d.index)?d.deviationAction:d.normalAction);

export interface DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
}

/** The supplied Pro catalog matching a table's dealer rule. */
export function getDeviationCatalog(rules: { dealerHitsSoft17: boolean }): Deviation[] {
  return rules.dealerHitsSoft17 ? H17_PRO_DEVIATIONS : S17_PRO_DEVIATIONS;
}

/**
 * Resolves every matching the reference product entry, rather than trusting catalog order.
 * Some Pro-chart cells overlap by design: the indexed stand takes precedence
 * over a surrender threshold once both have been reached (16 vs 9 and 15 vs
 * 10) — an indexed surrender's own deviationAction ("R") always qualifies as a
 * candidate, so it competes on its own threshold even where the catalog's
 * "normalAction" field doesn't match a table that already surrenders that cell
 * at basic strategy.
 *
 * A starred stand index is the one case where the chart's own precedence is not
 * followed. Those rows only apply where surrender is unavailable — see the note
 * on `overridesSurrender` in h17Pro.ts.
 */
export function resolveDeviation(
  basicAction: DeviationAction,
  hand: string,
  dealer: string,
  tc: number,
  rules: DeviationRules,
  catalog: Deviation[] = getDeviationCatalog(rules),
): { action: DeviationAction; deviation?: Deviation; belowIndex?: true } {
  if (hand === "Insurance") return { action: basicAction };

  const candidates = catalog.filter((deviation) => {
    if (deviation.hand !== hand || deviation.dealer !== dealer) return false;
    if (deviation.always) return rules.lateSurrender;
    if (deviation.deviationAction === "R" && !rules.lateSurrender) return false;
    // A starred stand index is for tables (and split hands) with no surrender.
    if (deviation.overridesSurrender && rules.lateSurrender) return false;
    const crossed = deviation.direction === "atOrBelow" ? tc <= deviation.index : tc >= deviation.index;
    if (!crossed) return false;
    return basicAction === deviation.normalAction
      || deviation.overridesSurrender === true
      || deviation.deviationAction === "R";
  });
  if (!candidates.length) {
    // Two-sided cells (e.g. 13 v 2, 12 v 4, 12 v 5, 11 v A in the H17 catalog)
    // already match basic strategy at TC 0, so the catalog's normalAction field
    // never matches real basic strategy and this entry never appears in
    // `candidates` above at any count. Its index instead marks where the play
    // reverts back to that normalAction, inclusive at the index itself — the
    // chart prints these as e.g. "0-": hit at TC 0 or below, not only below 0.
    const reverted = catalog.find((deviation) =>
      deviation.hand === hand
      && deviation.dealer === dealer
      && !deviation.always
      && deviation.deviationAction === basicAction
      && deviation.normalAction !== basicAction
      && (deviation.direction === "atOrBelow" ? tc >= deviation.index : tc <= deviation.index));
    return reverted
      ? { action: reverted.normalAction, deviation: reverted, belowIndex: true }
      : { action: basicAction };
  }

  const selected = [...candidates].sort((a, b) => {
    const priority = (deviation: Deviation) => deviation.priority ?? (deviation.always ? 1 : 0);
    return priority(b) - priority(a);
  })[0];
  return { action: selected.deviationAction, deviation: selected };
}

/**
 * Two cards matching a chart hand label. Derived rather than table-driven: a
 * hardcoded map silently fell back to 10,6 for every label it was missing, so
 * "8 v 5" and "14 v 10" were dealt as a hard 16 — and because the basic-strategy
 * answer is computed from these cards, the drill also marked the wrong action
 * correct for the hard-8 doubles.
 */
export function deviationHandRanks(hand: string): [Rank, Rank] {
  const pair = /^(A|\d{1,2}),(A|\d{1,2})$/.exec(hand);
  if (pair) return [pair[1] as Rank, pair[2] as Rank];
  const soft = /^Soft (\d{1,2})$/.exec(hand);
  if (soft) return ["A", String(Number(soft[1]) - 11) as Rank];
  const total = Number(hand);
  if (!Number.isFinite(total)) return ["10", "6"];
  // Pick a non-pair, ace-free pair of cards so the hand reads as the hard total.
  const high = total >= 12 ? 10 : total - 2;
  return [String(high) as Rank, String(total - high) as Rank];
}

export interface DeviationTransition {
  /** The play basic strategy makes outside the threshold, under these rules. */
  baseline: DeviationAction;
  /** The play the departure switches to once the threshold is crossed. */
  departure: DeviationAction;
  /** True when the departure applies at or *below* the printed index. */
  atOrBelow: boolean;
  /** False when the departure never differs from basic strategy under these rules. */
  changesPlay: boolean;
}

/**
 * The transition a catalog row actually produces, found by resolving the play
 * on both sides of its printed index against real basic strategy rather than
 * trusting the row's `normalAction` field.
 *
 * Both directions have to be checked. Two-sided cells (13 v 2, 12 v 4, 12 v 5,
 * 11 v A) print the index where the play *reverts*, so reading it as "departs
 * at or above" inverts them — 13 v 2 hits at TC -1 and below. And where basic
 * strategy already surrenders (16 v 9, 15 v 10 in an H17 late-surrender game)
 * the row's own threshold is a no-op while its revert side is the real play.
 *
 * Resolved against this row alone, matching how each row's EV is measured. Two
 * chart rows can cover one cell — 16 v 10 carries both a starred stand and an
 * unconditional surrender — and resolving against the whole catalog would
 * credit a dormant row with its neighbour's transition.
 */
export function deviationTransition(row: Deviation, rules: DeviationRules, decks = 6): DeviationTransition {
  if (row.hand === "Insurance") {
    return {
      baseline: row.normalAction,
      departure: row.deviationAction,
      atOrBelow: row.direction === "atOrBelow",
      changesPlay: true,
    };
  }
  const [first, second] = deviationHandRanks(row.hand);
  const basic = getBasicStrategyDecision({
    playerCards: [{ rank: first, suit: "spades" }, { rank: second, suit: "hearts" }],
    dealerUpcard: { rank: row.dealer as Rank, suit: "diamonds" },
    rules: { decks, doubleAfterSplit: true, resplitAces: true, doubleRule: "any", ...rules },
  }).action;
  const at = (trueCount: number) => resolveDeviation(basic, row.hand, row.dealer, trueCount, rules, [row]).action;
  const inside = row.direction === "atOrBelow" ? row.index + 1 : row.index - 1;
  const outside = row.direction === "atOrBelow" ? row.index - 1 : row.index + 1;
  const onIndex = at(row.index);
  if (at(inside) !== onIndex) return { baseline: at(inside), departure: onIndex, atOrBelow: false, changesPlay: true };
  if (at(outside) !== onIndex) return { baseline: at(outside), departure: onIndex, atOrBelow: true, changesPlay: true };
  return { baseline: basic, departure: onIndex, atOrBelow: false, changesPlay: onIndex !== basic };
}
