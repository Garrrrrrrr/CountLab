import { calculateHandValue, isPair, isSoft, rankValue } from "./hand";
import { chartCell, StrategyChartRules, StrategySectionId } from "./strategyChart";
import { STRATEGY_TABLES, deckClass } from "./strategyTables";
import { Action, BlackjackRules, Card } from "./types";

export interface Decision { action: Action; fallback?: Action; explanation: string }

const NAMES: Record<Action, string> = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

/**
 * The deck count whose grid actually answers the question.
 *
 * The 1- and 2-deck grids are not transcribed yet, and `FullShoeGame` and
 * `CountingDrills` both let a player pick either, so an unpopulated deck class
 * must not throw here. Those counts read the 4+ deck grid meanwhile — which is
 * exactly what the branch-based engine this replaces did, since it had no deck
 * dependence at all.
 *
 * Deliberately scoped to the two classes known to be missing rather than to
 * "any lookup that fails": a 4+ deck game has no plausible correct answer other
 * than its own grid, so a missing `4plus` key is a broken build and should
 * throw in `chartCode` rather than be silently served something else. This
 * whole function goes away once the 1D and 2D grids land.
 */
const chartDecks = (rules: BlackjackRules): number => {
  const deckKey = deckClass(rules.decks);
  if (deckKey === "4plus") return rules.decks;
  return STRATEGY_TABLES[`${deckKey}/${rules.dealerHitsSoft17 ? "h17" : "s17"}`] ? rules.decks : 6;
};

/** `BlackjackRules` predates the chart's wider rule set; ENHC and early surrender are chart-page-only. */
const toChartRules = (rules: BlackjackRules): StrategyChartRules => ({
  decks: chartDecks(rules),
  dealerHitsSoft17: rules.dealerHitsSoft17,
  doubleAfterSplit: rules.doubleAfterSplit,
  surrender: rules.lateSurrender ? "late" : "none",
  doubleRule: rules.doubleRule ?? "any",
  europeanNoHoleCard: false,
});

/**
 * The grid coordinate a hand sits at, or the action for a hand that falls
 * outside the printed grid entirely.
 *
 * A splittable hand is placed on its pair row before any total is considered:
 * 9,9 and T,T both total 18 or more, and answering those from the total would
 * silently stop splitting nines.
 *
 * Both ends of the grid are answered without a lookup. Above it, every hard
 * total of 18 or more stands, as does the only soft hand that reaches 21.
 * Below it, a hard total under 8 always hits — and it must not be clamped onto
 * the hard-8 row, because the 1- and 2-deck grids double hard 8 against a 5 and
 * a 6. Clamping would tell a two-card hard 6, or a `canSplit: false` 3,3, to
 * double the moment those grids land.
 */
function locate(cards: Card[], total: number, splittable: boolean): { section: StrategySectionId; row: string } | { outsideGrid: Action } {
  if (splittable) {
    // Splitting goes by card value, so K,Q sits on the same row as 10,10.
    const value = rankValue(cards[0]);
    return { section: "pairs", row: value === 11 ? "A,A" : value === 10 ? "T,T" : `${value},${value}` };
  }
  if (isSoft(cards) && total >= 13 && total <= 20) return { section: "soft", row: `A,${total - 11}` };
  if (total >= 18) return { outsideGrid: "S" };
  if (total < 8) return { outsideGrid: "H" };
  return { section: "hard", row: String(total) };
}

export function getBasicStrategyDecision({ playerCards, dealerUpcard, rules, canSplit: splitPermitted = true }: {
  playerCards: Card[]; dealerUpcard: Card; rules: BlackjackRules; canSplit?: boolean;
}): Decision {
  const total = calculateHandValue(playerCards);
  const twoCards = playerCards.length === 2;
  const splittable = splitPermitted && twoCards && isPair(playerCards);
  const kind = splittable ? "pair" : isSoft(playerCards) ? "soft hand" : "hard hand";
  const dealerValue = rankValue(dealerUpcard);
  const dealer = dealerValue === 11 ? "A" : String(dealerValue);

  const chartRules = toChartRules(rules);
  const located = locate(playerCards, total, splittable);
  if ("outsideGrid" in located) return withExplanation(located.outsideGrid, undefined, kind, total, dealerUpcard, chartRules);

  const { action, fallback } = chartCell(chartRules, located.section, located.row, dealer, {
    // A drawn hand cannot double or surrender whatever the table allows.
    // `chartCell` ANDs this with its own `doubleRule` restriction, so both apply.
    canDouble: twoCards,
    canSurrender: rules.lateSurrender && twoCards,
    canSplit: located.section === "pairs",
  });
  return withExplanation(action, fallback, kind, total, dealerUpcard, chartRules);
}

/** Reports the deck count of the grid that answered, which is not always the one the player selected — see `chartDecks`. */
function withExplanation(action: Action, fallback: Action | undefined, kind: string, total: number, up: Card, rules: StrategyChartRules): Decision {
  const instruction = fallback ? `${NAMES[action]} if allowed, otherwise ${NAMES[fallback]}` : NAMES[action];
  return {
    action,
    fallback,
    explanation: `${total} (${kind}) vs dealer ${up.rank} is ${instruction} under ${rules.decks}-deck ${rules.dealerHitsSoft17 ? "H17" : "S17"} basic strategy.`,
  };
}
