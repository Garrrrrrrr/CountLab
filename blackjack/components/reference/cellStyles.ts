import { ACTION_STYLE } from "@/lib/blackjack/actionStyles";
import type { CellTone, H17Tone } from "@/lib/blackjack/referenceChartModel";

/**
 * Cell fills are fixed colours in both themes, like a printed card. Ds gets
 * a fill of its own so "double, otherwise stand" never reads as a plain double.
 */
export const TONE_STYLE: Record<CellTone, string> = {
  H: ACTION_STYLE.H,
  S: ACTION_STYLE.S,
  D: ACTION_STYLE.D,
  Ds: "border-amber-700 bg-amber-950 text-amber-200",
  P: ACTION_STYLE.P,
  R: ACTION_STYLE.R,
  none: "border-[var(--rule)] bg-transparent text-[var(--ink-muted)]",
};

/** The printed H17 chart's tokens. Index cells are white with an amber edge (about 19:1 text contrast). */
export const H17_TONE_STYLE: Record<H17Tone, string> = {
  Y: ACTION_STYLE.P,
  N: "border-slate-700 bg-slate-800 text-white",
  YN: "border-violet-700 bg-violet-950 text-violet-100",
  H: ACTION_STYLE.H,
  S: ACTION_STYLE.S,
  D: ACTION_STYLE.D,
  Ds: TONE_STYLE.Ds,
  SUR: ACTION_STYLE.R,
  index: "ref-h17-index border-amber-600 bg-white text-slate-950",
  none: TONE_STYLE.none,
};

/** A key swatch the same size everywhere, in the cell's own colours. */
export const SWATCH = "inline-grid h-6 min-w-6 shrink-0 place-items-center rounded-[5px] border px-1 font-data text-xs font-bold leading-none print:h-4 print:min-w-4 print:text-[8px]";
