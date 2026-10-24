"use client";
import { useState } from "react";
import { ArrowRight, ChevronUp } from "lucide-react";
import { chance, count, DASH, money, percent, riskLabel, signedMoney } from "@/lib/blackjack/labFormat";
import type { TripOutlook } from "@/lib/blackjack/labModel";
import { Button, cx } from "@/components/ui";
import type { Calc } from "./useCalculator";

function Cell({ label, value, tone }: { label: string; value: string; tone?: "neg" | "warn" | "pos" }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[0.6875rem] font-medium text-ink-3">{label}</span>
      <span className={cx("tnum block truncate text-base font-semibold leading-tight", tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : tone === "pos" ? "text-pos" : "text-ink")}>{value}</span>
    </span>
  );
}

/**
 * The live answer while the inputs are on screen (below the two-column
 * layout): win an hour, swing an hour and risk of ruin. It sits above the tab
 * bar on phones and expands in place to the other headline figures, with a way
 * to the full results.
 */
export function ResultsBar({ calc, trip, onOpenResults, className }: { calc: Calc; trip: TripOutlook; onOpenResults: () => void; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { pricing, config } = calc;
  const { result, noBets, figures } = pricing;
  const ruinTone = result.riskOfRuin <= config.targetRisk ? undefined : result.riskOfRuin <= 0.135 ? "warn" : "neg";
  return (
    <div
      role="region"
      aria-label="Live results"
      className={cx(
        "no-print z-30 border-line bg-surface/95 backdrop-blur-xl",
        "fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-b))] border-t shadow-2 lg:sticky lg:inset-x-auto lg:bottom-4 lg:mt-4 lg:rounded-2xl lg:border",
        className,
      )}
    >
      {expanded && (
        <div id="results-bar-more" className="max-h-[50dvh] overflow-y-auto border-b border-line px-4 pb-3 pt-3">
          {noBets ? (
            <p className="text-sm text-ink-2">You are not betting at any count.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm xs:grid-cols-3">
              {[
                ["Win a round", money(result.evPerRound, 2)],
                ["Units an hour", Number.isFinite(figures.unitsPerHour) ? figures.unitsPerHour.toFixed(2) : DASH],
                ["Average bet", money(result.averageBet, 2)],
                [`Bankroll for ${riskLabel(config.targetRisk)}`, money(result.requiredBankroll)],
                ["N₀ hours", count(result.nZeroHours)],
                ["SCORE", Number.isFinite(figures.score) ? money(figures.score, 2) : DASH],
                [`Trip, ${count(config.hours)} h`, signedMoney(trip.expected)],
                ["Trip ahead", percent(trip.chanceAhead, 1)],
                ["Trip ruin", chance(trip.riskOfRuin)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="truncate text-[0.6875rem] font-medium text-ink-3">{label}</dt>
                  <dd className="tnum truncate font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <Button variant="secondary" size="sm" block className="mt-3 min-h-11" onClick={() => { setExpanded(false); onOpenResults(); }} trailing={<ArrowRight size={15} aria-hidden />}>
            All results, trip and comparisons
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2">
        <button type="button" aria-expanded={expanded} aria-controls="results-bar-more" onClick={() => setExpanded((open) => !open)}
          className="grid min-h-11 min-w-0 flex-1 grid-cols-3 items-center gap-3 rounded-xl text-left"
          aria-label={noBets ? "Not betting at any count. Show more results" : `Win ${money(result.hourlyEv, 2)} an hour, swing ±${money(result.sdPerHour)} an hour, risk of ruin ${percent(result.riskOfRuin)}. ${expanded ? "Show fewer" : "Show more"} results`}>
          <Cell label={pricing.estimated ? "Est. win / hr" : "Win / hour"} value={noBets ? DASH : money(result.hourlyEv, 2)} tone={!noBets && result.hourlyEv < 0 ? "neg" : undefined} />
          <Cell label="SD / hour" value={noBets ? DASH : `±${money(result.sdPerHour)}`} />
          <Cell label="Risk of ruin" value={noBets ? DASH : percent(result.riskOfRuin)} tone={noBets ? undefined : ruinTone} />
        </button>
        <button type="button" aria-hidden tabIndex={-1} onClick={() => setExpanded((open) => !open)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2">
          <ChevronUp size={20} className={cx("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>
    </div>
  );
}
