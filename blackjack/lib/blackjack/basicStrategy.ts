import { calculateHandValue, isPair, isSoft, rankValue } from "./hand";
import { chartCell, StrategyChartRules, StrategySectionId } from "./strategyChart";
import { STRATEGY_TABLES, deckClass } from "./strategyTables";
import { Action, BlackjackRules, Card } from "./types";

export interface Decision { action: Action; fallback?: Action; explanation: string }

const NAMES: Record<Action, string> = { H: "Hit", S: "Stand", D: "Double", P: "Split", R: "Surrender" };

/**
 * The 1- and 2-deck grids are not transcribed yet, and `FullShoeGame` lets a
 * player pick either, so an unpopulated deck class must not throw here. Those
 * counts read the 4+ deck grid meanwhile — which is exactly what the
 * branch-based engine this replaces did, since it had no deck dependence at
 * all. The probe is against the table itself rather than a hardcoded list, so
 * this stops applying on its own the moment those grids land.
 */
const chartDecks = (rules: BlackjackRules): number =>
  STRATEGY_TABLES[`${deckClass(rules.decks)}/${rules.dealerHitsSoft17 ? "h17" : "s17"}`] ? rules.decks : 6;

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
 * The grid coordinate a hand sits at, or null for a hand above the printed
 * grid — every hard total of 18 or more stands unconditionally, as does the
 * only soft hand that reaches 21.
 *
 * A splittable hand is placed on its pair row before any total is considered:
 * 9,9 and T,T both total 18 or more, and answering those from the total would
 * silently stop splitting nines.
 */
function locate(cards: Card[], total: number, splittable: boolean): { section: StrategySectionId; row: string } | null {
  if (splittable) {
    // Splitting goes by card value, so K,Q sits on the same row as 10,10.
    const value = rankValue(cards[0]);
    return { section: "pairs", row: value === 11 ? "A,A" : value === 10 ? "T,T" : `${value},${value}` };
  }
  if (isSoft(cards) && total >= 13 && total <= 20) return { section: "soft", row: `A,${total - 11}` };
  if (total >= 18) return null;
  // Hard totals below 8 all hit; the printed grid starts its hard section there.
  return { section: "hard", row: String(Math.max(8, total)) };
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

  const located = locate(playerCards, total, splittable);
  if (!located) return withExplanation("S", undefined, kind, total, dealerUpcard, rules);

  const { action, fallback } = chartCell(toChartRules(rules), located.section, located.row, dealer, {
    // `chartCell` owns the doubleRule restriction, which needs the row; the
    // two-card guard is all this function has to contribute.
    canDouble: twoCards,
    canSurrender: rules.lateSurrender && twoCards,
    canSplit: located.section === "pairs",
  });
  return withExplanation(action, fallback, kind, total, dealerUpcard, rules);
}

function withExplanation(action: Action, fallback: Action | undefined, kind: string, total: number, up: Card, rules: BlackjackRules): Decision {
  const instruction = fallback ? `${NAMES[action]} if allowed, otherwise ${NAMES[fallback]}` : NAMES[action];
  return {
    action,
    fallback,
    explanation: `${total} (${kind}) vs dealer ${up.rank} is ${instruction} under ${rules.decks}-deck ${rules.dealerHitsSoft17 ? "H17" : "S17"} basic strategy.`,
  };
}
