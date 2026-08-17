import { FREEBJ_DEFAULT_HILO_DEVIATIONS } from "./fullHiLoIndices";
import { Action } from "./types";
export type DeviationAction = Action | "I" | "N";
export const DEVIATION_ACTION_NAMES:Record<DeviationAction,string>={H:"Hit",S:"Stand",D:"Double",P:"Split",R:"Surrender",I:"Take insurance",N:"Decline insurance"};
export interface Deviation { hand:string; dealer:string; index:number; normalAction:DeviationAction; deviationAction:DeviationAction; direction?:"atOrAbove"|"atOrBelow" }
/**
 * One canonical, MIT-licensed departure set for every drill and simulator.
 * FreeBJ's defaults intentionally do not include insurance or surrender
 * departures, so those actions remain basic-strategy decisions here.
 */
export const DEVIATIONS:Deviation[]=FREEBJ_DEFAULT_HILO_DEVIATIONS.map(({hand,dealer,index,normalAction,deviationAction,direction})=>({hand,dealer,index,normalAction,deviationAction,direction}));
export const deviationDecision=(d:Deviation,tc:number)=>((d.direction==="atOrBelow"?tc<=d.index:tc>=d.index)?d.deviationAction:d.normalAction);
/** Apply a catalog departure without replacing a rule-specific basic action. */
export const applyDeviationToBasic=(d:Deviation,basic:DeviationAction,tc:number)=>
  basic === d.normalAction && deviationDecision(d, tc) === d.deviationAction ? d.deviationAction : basic;
