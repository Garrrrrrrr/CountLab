import type { Action } from "./types";

/**
 * Chart cell colors, shared by the reference charts and the home-page preview.
 * These sit on fixed, saturated fills, so their text colors are literal rather
 * than theme tokens.
 */
export const ACTION_STYLE: Record<Action, string> = {
  H: "border-sky-800 bg-sky-700 text-white",
  S: "border-slate-800 bg-slate-700 text-white",
  D: "border-amber-600 bg-amber-400 text-slate-950",
  P: "border-violet-800 bg-violet-700 text-white",
  R: "border-rose-800 bg-rose-700 text-white",
};

export const ACTION_LABEL: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};
