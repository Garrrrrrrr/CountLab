import type { BlackjackRules } from "@/lib/blackjack/types";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";
import type { Settings, SurrenderRule } from "@/lib/statistics/storage";

export type { SurrenderRule };
export type DoublingRule = "any" | "9-11" | "10-11";

/**
 * The table rules every strategy answer depends on.
 *
 * `surrender: "early"` is early surrender against a ten (decided before the
 * dealer checks for blackjack) with late surrender against every other card,
 * which is how ES10 is dealt. `noHoleCard` is the European game, where the
 * dealer takes only one card until the players have acted.
 */
export interface TableRules {
  decks: number;
  hitSoft17: boolean;
  das: boolean;
  surrender: SurrenderRule;
  doubling: DoublingRule;
  noHoleCard: boolean;
}

export const DEFAULT_TABLE_RULES: TableRules = { decks: 6, hitSoft17: true, das: true, surrender: "late", doubling: "any", noHoleCard: false };

/** The deck counts the strategy tables distinguish: 1, 2 and 4–8 share a grid each. */
export const DECK_OPTIONS = [1, 2, 4, 6, 8] as const;

export function rulesFromSettings(settings: Pick<Settings, "decks" | "dealerHitsSoft17" | "doubleAfterSplit" | "surrender">): TableRules {
  return {
    ...DEFAULT_TABLE_RULES,
    decks: (DECK_OPTIONS as readonly number[]).includes(settings.decks) ? settings.decks : 6,
    hitSoft17: settings.dealerHitsSoft17,
    das: settings.doubleAfterSplit,
    surrender: settings.surrender,
  };
}

/** No-hole-card games deal no surrender here: there is no peek for late surrender to follow. */
export const effectiveSurrender = (rules: TableRules): SurrenderRule => (rules.noHoleCard ? "none" : rules.surrender);

/** Whether the table lets a two-card hand be given up at all. Both rules cover every dealer card; ES10 only changes the ten column's thresholds. */
export const surrenderOffered = (rules: TableRules): boolean => effectiveSurrender(rules) !== "none";

export const SURRENDER_LABEL: Record<SurrenderRule, string> = { none: "No surrender", late: "Late surrender", early: "Early surrender vs 10" };
export const SURRENDER_SHORT: Record<SurrenderRule, string> = { none: "NS", late: "LS", early: "ES10" };
export const DOUBLING_LABEL: Record<DoublingRule, string> = { any: "Any two cards", "9-11": "Hard 9–11 only", "10-11": "Hard 10–11 only" };

/** "6D · H17 · DAS · LS", the one-line rules summary used everywhere. */
export function rulesSummary(rules: TableRules): string {
  const parts = [
    rules.decks >= 4 ? `${rules.decks}D` : rules.decks === 1 ? "1D" : "2D",
    rules.hitSoft17 ? "H17" : "S17",
    rules.das ? "DAS" : "No DAS",
    SURRENDER_SHORT[effectiveSurrender(rules)],
  ];
  if (rules.doubling !== "any") parts.push(`D${rules.doubling}`);
  if (rules.noHoleCard) parts.push("ENHC");
  return parts.join(" · ");
}

/** The strategy-table rules shape the audited grids read. */
export function toChartRules(rules: TableRules): StrategyChartRules {
  return {
    decks: rules.decks,
    dealerHitsSoft17: rules.hitSoft17,
    doubleAfterSplit: rules.das,
    surrender: effectiveSurrender(rules),
    doubleRule: rules.doubling,
    europeanNoHoleCard: rules.noHoleCard,
  };
}

/** The engine-wide rules shape used by the shoe and simulation code. */
export function toBlackjackRules(rules: TableRules, resplitAces = true): BlackjackRules {
  const surrender = effectiveSurrender(rules);
  return {
    decks: rules.decks,
    dealerHitsSoft17: rules.hitSoft17,
    doubleAfterSplit: rules.das,
    resplitAces,
    lateSurrender: surrender !== "none",
    earlySurrenderVsTen: surrender === "early",
    doubleRule: rules.doubling,
  };
}

export function fromBlackjackRules(rules: BlackjackRules): TableRules {
  return {
    decks: rules.decks,
    hitSoft17: rules.dealerHitsSoft17,
    das: rules.doubleAfterSplit,
    surrender: rules.earlySurrenderVsTen ? "early" : rules.lateSurrender ? "late" : "none",
    doubling: rules.doubleRule ?? "any",
    noHoleCard: false,
  };
}
