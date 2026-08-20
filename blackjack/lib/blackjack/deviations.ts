import { Action } from "./types";
import { H17_PRO_DEVIATIONS } from "./apToolboxH17Pro";
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
/** The supplied AP Toolbox H17 Pro catalog used throughout CountLab. */
export const DEVIATIONS:Deviation[] = [...H17_PRO_DEVIATIONS];
export const deviationDecision=(d:Deviation,tc:number)=>((d.direction==="atOrBelow"?tc<=d.index:tc>=d.index)?d.deviationAction:d.normalAction);
/** Apply a catalog departure without replacing a rule-specific basic action. */
export const applyDeviationToBasic=(d:Deviation,basic:DeviationAction,tc:number)=>
  basic === d.normalAction && deviationDecision(d, tc) === d.deviationAction ? d.deviationAction : basic;

export interface DeviationRules {
  dealerHitsSoft17: boolean;
  lateSurrender: boolean;
}

/**
 * Resolves every matching AP Toolbox entry, rather than trusting catalog order.
 * Some H17 Pro cells overlap by design: the indexed stand takes precedence over
 * a surrender threshold once both have been reached (16 vs 9 and 15 vs 10).
 */
export function resolveDeviation(
  basicAction: DeviationAction,
  hand: string,
  dealer: string,
  tc: number,
  rules: DeviationRules,
): { action: DeviationAction; deviation?: Deviation; belowIndex?: true } {
  if (!rules.dealerHitsSoft17 || hand === "Insurance") return { action: basicAction };

  // The supplied chart narrows two generic H17/LS surrenders to count-based
  // decisions. Below their surrender thresholds, the chart's baseline is hit.
  const effectiveBasic = rules.lateSurrender && basicAction === "R"
    && ((hand === "16" && dealer === "9" && tc < -1) || (hand === "15" && dealer === "10" && tc < 0))
    ? "H"
    : basicAction;

  const candidates = DEVIATIONS.filter((deviation) => {
    if (deviation.hand !== hand || deviation.dealer !== dealer) return false;
    if (deviation.always) return rules.lateSurrender;
    if (deviation.deviationAction === "R" && !rules.lateSurrender) return false;
    const crossed = deviation.direction === "atOrBelow" ? tc <= deviation.index : tc >= deviation.index;
    if (!crossed) return false;
    return effectiveBasic === deviation.normalAction
      || deviation.overridesSurrender === true
      || deviation.deviationAction === "R";
  });
  if (!candidates.length) {
    // Two-sided cells: 13 v 2, 12 v 4, 12 v 5 and 11 v A already match basic
    // strategy at TC 0, so their index marks where the play reverts *below* it
    // rather than where it departs above it.
    const reverted = DEVIATIONS.find((deviation) =>
      deviation.hand === hand
      && deviation.dealer === dealer
      && !deviation.always
      && deviation.deviationAction === effectiveBasic
      && deviation.normalAction !== effectiveBasic
      && !(deviation.direction === "atOrBelow" ? tc <= deviation.index : tc >= deviation.index));
    return reverted
      ? { action: reverted.normalAction, deviation: reverted, belowIndex: true }
      : { action: effectiveBasic };
  }

  const selected = [...candidates].sort((a, b) => {
    const priority = (deviation: Deviation) => deviation.priority ?? (deviation.always ? 1 : 0);
    return priority(b) - priority(a);
  })[0];
  return { action: selected.deviationAction, deviation: selected };
}
