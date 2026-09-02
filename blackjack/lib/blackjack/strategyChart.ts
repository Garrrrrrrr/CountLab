import { Action } from "./types";
import { CHART_DEALERS } from "./bjaH17Chart";
import { STRATEGY_TABLES, deckClass } from "./strategyTables";

/**
 * A printed chart cell. Codes are composite on purpose: `Ds` is "double if the
 * table lets you, otherwise stand". Folding the rule conditions into the cell
 * is what keeps the number of stored grids down to six instead of one per
 * combination of DAS, surrender and double restrictions.
 */
export type ChartCode = "H" | "S" | "P" | "D" | "Ds" | "Ph" | "Pd" | "Ps" | "Rh" | "Rs" | "Rp";

export const CHART_CODES: readonly ChartCode[] = ["H", "S", "P", "D", "Ds", "Ph", "Pd", "Ps", "Rh", "Rs", "Rp"];

export type StrategySectionId = "pairs" | "soft" | "hard";

export interface StrategyChartRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  surrender: "none" | "late" | "early";
  doubleRule: "any" | "9-11" | "10-11";
  europeanNoHoleCard: boolean;
}

export interface CodeOptions {
  canDouble: boolean;
  canSplit: boolean;
  doubleAfterSplit: boolean;
  canSurrender: boolean;
}

export interface ResolvedCode {
  action: Action;
  /** Set only where the action is still conditional at the table (a double or surrender that may be refused). */
  fallback?: Action;
}

/**
 * One code plus the table's permissions becomes one action.
 *
 * Demotion cascades: an `Rp` on a table without surrender becomes a split, and
 * if that hand cannot be split either (it is already a drawn hand) it demotes
 * again through the pair's own fallback. Each code carries its fallback in its
 * own letters, so the cascade never needs to consult a different cell.
 */
export function resolveCode(code: ChartCode, options: CodeOptions): ResolvedCode {
  switch (code) {
    case "H":
    case "S":
      return { action: code };
    case "D":
      return options.canDouble ? { action: "D", fallback: "H" } : { action: "H" };
    case "Ds":
      return options.canDouble ? { action: "D", fallback: "S" } : { action: "S" };
    case "P":
      return options.canSplit ? { action: "P" } : { action: "H" };
    case "Ph":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("H", options);
    case "Pd":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("D", options);
    case "Ps":
      return options.canSplit && options.doubleAfterSplit ? { action: "P" } : resolveCode("S", options);
    case "Rh":
      return options.canSurrender ? { action: "R", fallback: "H" } : resolveCode("H", options);
    case "Rs":
      return options.canSurrender ? { action: "R", fallback: "S" } : resolveCode("S", options);
    case "Rp":
      // The fallback must itself be a legal action, so it is the pair's own
      // resolution rather than a hardcoded "P" — a hand that cannot be split
      // falls through to "H" here exactly as the `canSurrender: false` branch does.
      return options.canSurrender
        ? { action: "R", fallback: resolveCode("P", options).action }
        : resolveCode("P", options);
  }
}

/** Hard totals a restricted double rule still permits. Soft doubles are never permitted under a restriction. */
const doubleAllowed = (rules: StrategyChartRules, section: StrategySectionId, row: string): boolean => {
  if (rules.doubleRule === "any") return true;
  if (section !== "hard") return false;
  const permitted = rules.doubleRule === "9-11" ? ["9", "10", "11"] : ["10", "11"];
  return permitted.includes(row);
};

/** The printed code, before the composite codes are resolved against the table's permissions. */
export function chartCode(rules: StrategyChartRules, section: StrategySectionId, row: string, dealer: string): ChartCode {
  const key = `${deckClass(rules.decks)}/${rules.dealerHitsSoft17 ? "h17" : "s17"}`;
  const table = STRATEGY_TABLES[key];
  if (!table) throw new Error(`No strategy table for ${key}`);
  const code = table.get(`${section}:${row}v${dealer}`);
  if (!code) throw new Error(`No chart cell for ${section} ${row} vs ${dealer}`);
  return code;
}

/**
 * `canDouble` composes; every other permission overrides.
 *
 * The table's own `doubleRule` and the caller's knowledge are independent
 * restrictions on the same action — the rules say which rows may be doubled,
 * the caller says whether this particular hand still can (a drawn hand cannot).
 * Letting the caller's `true` replace `doubleAllowed` would make `doubleRule`
 * dead whenever a caller passed the flag at all, so the two are ANDed instead.
 *
 * The others are genuine overrides: a caller passing `canSplit: false` or
 * `canSurrender: false` is stating a fact about the hand that the rules cannot
 * know, and no caller has a reason to widen them.
 */
export function chartCell(
  rules: StrategyChartRules,
  section: StrategySectionId,
  row: string,
  dealer: string,
  permissions: Partial<CodeOptions> = {},
): ResolvedCode & { code: ChartCode } {
  const code = chartCode(rules, section, row, dealer);
  const resolved = resolveCode(code, {
    canSplit: section === "pairs",
    doubleAfterSplit: rules.doubleAfterSplit,
    canSurrender: rules.surrender !== "none",
    ...permissions,
    canDouble: doubleAllowed(rules, section, row) && (permissions.canDouble ?? true),
  });
  return { ...resolved, code };
}

export { CHART_DEALERS };
