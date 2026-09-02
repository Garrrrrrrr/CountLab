import { Action } from "./types";

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
  /** Set only where the action is still conditional at the table (a double that may be refused). */
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
      return options.canSurrender ? { action: "R", fallback: "P" } : resolveCode("P", options);
  }
}
