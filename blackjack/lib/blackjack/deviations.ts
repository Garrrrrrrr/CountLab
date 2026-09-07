import { Action, Rank } from "./types";
import { getBasicStrategyDecision } from "./basicStrategy";
import { EARLY_SURRENDER_VS_TEN, supersededByEarlySurrenderVsTen } from "./earlySurrender";
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
  listedBaseline?: true;
}
/** The supplied H17 Pro catalog; kept as the default/legacy export. */
export const DEVIATIONS:Deviation[] = [...H17_PRO_DEVIATIONS];
export const deviationDecision=(d:Deviation,tc:number)=>((d.direction==="atOrBelow"?tc<=d.index:tc>=d.index)?d.deviationAction:d.normalAction);

export interface DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
  /**
   * Early surrender against a ten. The ace, 9 and 8 stay on late surrender, so
   * this is additive to `lateSurrender` rather than a third exclusive mode —
   * which is also how the rule is dealt in practice.
   */
  earlySurrenderVsTen?: boolean;
}

/**
 * Whether the table lets this hand be given up against this upcard.
 *
 * Surrender availability is per-upcard once early surrender is in play, so
 * every gate that used to read `lateSurrender` has to ask about a dealer card.
 */
export const surrenderAvailable = (rules: DeviationRules, dealer: string): boolean =>
  rules.lateSurrender || (rules.earlySurrenderVsTen === true && dealer === "10");

/**
 * The supplied H17/S17 Pro catalog matching a table's dealer rule, with the ten
 * column swapped for Wong's early-surrender indices where the rule calls for it.
 */
export function getDeviationCatalog(rules: { dealerHitsSoft17: boolean; earlySurrenderVsTen?: boolean }): Deviation[] {
  const set = rules.dealerHitsSoft17 ? "h17Pro" : "s17Pro";
  const catalog = rules.dealerHitsSoft17 ? H17_PRO_DEVIATIONS : S17_PRO_DEVIATIONS;
  if (!rules.earlySurrenderVsTen) return catalog;
  return [...catalog.filter((row) => !supersededByEarlySurrenderVsTen(row)), ...EARLY_SURRENDER_VS_TEN[set]];
}

/**
 * Resolves every matching catalog entry, rather than trusting catalog order.
 * Some chart cells overlap by design: the indexed stand takes precedence over a
 * surrender threshold once both have been reached — an indexed surrender's own
 * deviationAction ("R") always qualifies as a candidate, so it competes on its
 * own threshold even where the catalog's "normalAction" field doesn't match a
 * table that already surrenders that cell at basic strategy.
 *
 * A starred stand index is the one case where the chart's own precedence is not
 * followed. Those rows only apply where surrender is unavailable — see the note
 * on `overridesSurrender` in h17Pro.ts.
 *
 * A row can also depart *away* from a surrender: the H17 chart's 16 v 9 and
 * 15 v 10 cells surrender at basic strategy and print an index for the low
 * counts where the hand is played out instead. Those rows carry
 * `normalAction: "R"`, so both fallback lookups below — which can return a
 * row's `normalAction` — have to check surrender is on offer before they do.
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

  const canSurrender = surrenderAvailable(rules, dealer);
  const candidates = catalog.filter((deviation) => {
    if (deviation.hand !== hand || deviation.dealer !== dealer) return false;
    if (deviation.always) return canSurrender;
    if (deviation.deviationAction === "R" && !canSurrender) return false;
    // A starred stand index is for tables (and split hands) with no surrender.
    if (deviation.overridesSurrender && canSurrender) return false;
    const crossed = deviation.direction === "atOrBelow" ? tc <= deviation.index : tc >= deviation.index;
    if (!crossed) return false;
    return basicAction === deviation.normalAction
      || deviation.listedBaseline === true
      || deviation.overridesSurrender === true
      || deviation.deviationAction === "R";
  });
  if (!candidates.length) {
    const listedBaseline = catalog.find((deviation) => {
      if (!deviation.listedBaseline || deviation.hand !== hand || deviation.dealer !== dealer) return false;
      if (deviation.normalAction === "R" && !canSurrender) return false;
      if (deviation.deviationAction === "R" && !canSurrender) return false;
      if (deviation.overridesSurrender && canSurrender) return false;
      return deviation.direction === "atOrBelow"
        ? tc > deviation.index
        : tc < deviation.index;
    });
    if (listedBaseline) return { action: listedBaseline.normalAction, deviation: listedBaseline, belowIndex: true };
    // Two-sided cells (13 v 2, 12 v 4 and Soft 19 v 6 in the H17 catalog)
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
      // Returning `normalAction` must never conjure a surrender at a table that
      // does not offer one — 16 v 9 reverts to "R" only where "R" is legal.
      && (deviation.normalAction !== "R" || canSurrender)
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
 * Both directions have to be checked. Two-sided cells (13 v 2 and 12 v 4 in the
 * H17 catalog) print the index where the play *reverts*, so reading it as
 * "departs at or above" inverts them — 13 v 2 hits at TC -1 and below. The H17
 * chart's 16 v 9 and 15 v 10 surrenders run downwards for a different reason:
 * basic strategy surrenders both, and the printed index is the low count at
 * which the chart stops and plays the hand out instead.
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
  // A step in the direction that leaves the row's own window, checked first, so
  // a two-sided cell is reported on the side its printed index belongs to.
  const away = row.direction === "atOrBelow" ? 1 : -1;
  const onIndex = at(row.index);
  const leaving = at(row.index + away);
  if (leaving !== onIndex) return { baseline: leaving, departure: onIndex, atOrBelow: row.direction === "atOrBelow", changesPlay: true };
  const returning = at(row.index - away);
  if (returning !== onIndex) return { baseline: returning, departure: onIndex, atOrBelow: row.direction !== "atOrBelow", changesPlay: true };
  return { baseline: basic, departure: onIndex, atOrBelow: false, changesPlay: onIndex !== basic };
}

const actionLabel = (action: DeviationAction) => DEVIATION_ACTION_NAMES[action];

const lowerCaseAction = (action: DeviationAction) => actionLabel(action).toLowerCase();

const signedIndex = (index: number) => `${index > 0 ? "+" : ""}${index}`;

/**
 * A short instruction for one catalog row, built from its resolved transition.
 * The hand and dealer are already visible wherever this sentence is rendered,
 * so it stays focused on the count and action.
 */
export function deviationSentence(row: Deviation, transition: DeviationTransition): string {
  if (!transition.changesPlay) {
    return `No change: basic strategy always says ${lowerCaseAction(transition.baseline)}.`;
  }
  if (row.always) return `${actionLabel(transition.departure)} when late surrender is available; otherwise ${lowerCaseAction(transition.baseline)}.`;

  const index = signedIndex(row.index);
  // State the below-index play first for upward indices. It makes the common
  // low-count exception read as a direct instruction rather than asking the
  // reader to mentally invert the threshold.
  const sentence = transition.atOrBelow
    ? `${actionLabel(transition.departure)} when the true count is ${index} or lower; otherwise ${lowerCaseAction(transition.baseline)}.`
    : `${actionLabel(transition.baseline)} when the true count is below ${index}; otherwise ${lowerCaseAction(transition.departure)}.`;
  return row.overridesSurrender
    ? `${sentence} Use surrender instead when it is available on the original two-card hand.`
    : sentence;
}

export interface DeviationTrainingRow {
  row: Deviation;
  transition: DeviationTransition;
}

/**
 * The live rows shown by the reference chart for a particular ruleset.
 *
 * The drill consumes these resolved transitions instead of reinterpreting the
 * raw catalog. This keeps reverse-side indices (such as 13 vs 2) pointed in the
 * same direction as the chart and excludes rows the chart marks as no effect.
 */
export function deviationTrainingRows(
  rules: DeviationRules,
  decks = 6,
  catalog: Deviation[] = getDeviationCatalog(rules),
): DeviationTrainingRow[] {
  return catalog
    .map((row) => ({ row, transition: deviationTransition(row, rules, decks) }))
    .filter(({ transition }) => transition.changesPlay);
}
