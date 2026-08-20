import { Action } from "./types";
import { H17_PRO_DEVIATIONS } from "./apToolboxH17Pro";
import { S17_PRO_DEVIATIONS } from "./apToolboxS17Pro";
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
/** The supplied AP Toolbox H17 Pro catalog; kept as the default/legacy export. */
export const DEVIATIONS:Deviation[] = [...H17_PRO_DEVIATIONS];
export const deviationDecision=(d:Deviation,tc:number)=>((d.direction==="atOrBelow"?tc<=d.index:tc>=d.index)?d.deviationAction:d.normalAction);
/** Apply a catalog departure without replacing a rule-specific basic action. */
export const applyDeviationToBasic=(d:Deviation,basic:DeviationAction,tc:number)=>
  basic === d.normalAction && deviationDecision(d, tc) === d.deviationAction ? d.deviationAction : basic;

export interface DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
}

/** The supplied AP Toolbox Pro catalog matching a table's dealer rule. */
export function getDeviationCatalog(rules: { dealerHitsSoft17: boolean }): Deviation[] {
  return rules.dealerHitsSoft17 ? H17_PRO_DEVIATIONS : S17_PRO_DEVIATIONS;
}

/**
 * Resolves every matching AP Toolbox entry, rather than trusting catalog order.
 * Some Pro-chart cells overlap by design: the indexed stand takes precedence
 * over a surrender threshold once both have been reached (16 vs 9 and 15 vs
 * 10) — an indexed surrender's own deviationAction ("R") always qualifies as a
 * candidate, so it competes on its own threshold even where the catalog's
 * "normalAction" field doesn't match a table that already surrenders that cell
 * at basic strategy.
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
