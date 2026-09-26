"use client";

import { useState } from "react";
import { Button, HelpTip } from "@/components/ui";
import type { IndexRanking as Ranking, RankedPlay } from "@/lib/blackjack/referenceChartModel";
import type { StrategyChartRules } from "@/lib/blackjack/strategyChart";

const TOP = 10;
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`;

/** A small bar beside a value in a ranked list, scaled to the largest value shown. */
function ValueBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, (Math.abs(value) / max) * 100) : 0;
  return (
    <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-overlay/[.08] [print-color-adjust:exact]">
      <span className={`block h-full rounded-full ${value < 0 ? "bg-[var(--negative)]" : "bg-[var(--accent)]"}`} style={{ width: `max(2px, ${width}%)` }} />
    </span>
  );
}

function PlayRow({ play, rank, max, hidden, onShow, disabled }: { play: RankedPlay; rank?: number; max: number; hidden: boolean; onShow: (key: string) => void; disabled: boolean }) {
  const value = play.value;
  return (
    <li className={`${hidden ? "hidden print:grid" : "grid"} ref-rank-row grid-cols-[2rem_minmax(0,1fr)_2.75rem] items-start gap-x-2 gap-y-1 border-t border-[var(--rule)] py-2.5 first:border-t-0 lg:grid-cols-[2rem_minmax(10rem,13rem)_minmax(0,1fr)_7.5rem_9.5rem_2.75rem] lg:items-center lg:gap-x-4 print:grid-cols-[1.5rem_9rem_minmax(0,1fr)_5rem] print:py-1 print:text-[9px]`}>
      <span className="pt-0.5 font-data text-sm font-semibold text-[var(--ink-muted)] lg:pt-0 print:text-[9px]">{rank ?? "–"}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <b className="font-data text-sm print:text-[9px]">{play.label}</b>
        {play.kind !== play.label && <span className="text-xs text-[var(--ink-muted)] print:text-[8px]">{play.kind}</span>}
        {play.chip && <span className={`ref-chip ref-chip-static ${play.available ? "" : "ref-chip-off"}`}>{play.chip}</span>}
      </span>
      <span className="col-span-3 col-start-1 row-start-2 min-w-0 text-sm leading-5 text-[var(--ink)] sm:col-span-2 sm:col-start-2 lg:col-span-1 lg:col-start-auto lg:row-start-auto print:col-span-1 print:col-start-auto print:row-start-auto print:text-[9px] print:leading-4">
        {play.sentence}
        {!play.available && <span className="ml-1 whitespace-nowrap text-xs font-semibold text-[var(--warning)]">Not available under these rules</span>}
        {!play.showLabel && <span className="block text-xs text-[var(--ink-muted)]">Also in the chart key, above the tables.</span>}
      </span>
      <span className="col-span-3 col-start-1 row-start-3 flex min-w-0 items-center gap-2 text-sm sm:col-span-2 sm:col-start-2 lg:col-span-1 lg:col-start-auto lg:row-start-auto lg:block print:col-span-1 print:col-start-auto print:row-start-auto print:block">
        {value ? (
          <>
            <span className={`shrink-0 font-data font-semibold print:text-[9px] ${value.ev < 0 ? "text-[var(--negative)]" : ""}`}>{signed(value.ev)}</span>
            <span className="w-20 shrink-0 lg:mt-1 lg:block lg:w-full print:hidden"><ValueBar value={value.ev} max={max} /></span>
            {value.ev < 0 && <span className="text-xs text-[var(--negative)] lg:block">Costs value at this spread</span>}
            <span className="text-xs text-[var(--ink-muted)] lg:hidden print:hidden">&middot; Changes the play {value.fires.toFixed(2)} times per 100 rounds</span>
          </>
        ) : <span className="text-xs text-[var(--ink-muted)]">Not measured yet</span>}
      </span>
      <span className="hidden text-xs leading-4 text-[var(--ink-muted)] lg:block print:hidden">
        {value && <>Changes the play {value.fires.toFixed(2)} times per 100 rounds</>}
      </span>
      <span className="col-start-3 row-start-1 justify-self-end lg:col-start-auto lg:row-start-auto print:hidden">
        {play.showLabel && (
          <button type="button" disabled={disabled} onClick={() => onShow(play.key)} aria-label={play.showLabel} title={play.showLabel} className="pressable grid h-11 w-11 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--paper)] text-sm text-[var(--ink)] hover:border-[var(--ink-muted)] disabled:opacity-40">
            <i className="fa-solid fa-crosshairs" aria-hidden="true" />
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * The index plays for these rules, most valuable first: what to learn first,
 * what each is worth, and a button that takes you to its cell.
 */
export function IndexRanking({ ranking, rules, onShow, disabled }: { ranking: Ranking; rules: StrategyChartRules; onShow: (key: string) => void; disabled: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { ranked, afterSurrender, unmeasured, total, max, topShare } = ranking;
  const surrenderOn = rules.surrender !== "none";
  return (
    <section id="index-plays-ranked" aria-labelledby="index-ranking-heading" className="ref-ranking ref-anchor surface min-w-0 rounded-2xl p-4 sm:p-5 print:break-before-page print:border-0 print:p-0 print:shadow-none">
      <h2 id="index-ranking-heading" data-analytics-section="index_play_ranking" className="font-display text-xl font-semibold">Index plays ranked by value</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ink-muted)] print:text-[9px] print:leading-4">
        Learn them from the top. Value is what adding one play to basic strategy earns, in betting units{" "}
        <HelpTip label="Units">A unit is your minimum bet. +0.05 units per 100 rounds is 5 cents per 100 rounds at a $1 unit.</HelpTip>
        {" "}per 100 rounds, with a 1–12 bet spread. Priced for {rules.dealerHitsSoft17 ? "H17" : "S17"} tables {surrenderOn ? "with" : "without"} surrender.
      </p>
      <ol aria-labelledby="index-ranking-heading" className="mt-3">
        {ranked.map((play, index) => (
          <PlayRow key={play.key} play={play} rank={index + 1} max={max} hidden={!showAll && index >= TOP} onShow={onShow} disabled={disabled} />
        ))}
      </ol>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-muted)] print:text-[9px] print:leading-4">
        Together, these plays add about <b className="font-data text-[var(--ink)]">{signed(total)}</b> units per 100 rounds.
        {topShare && <> The top {topShare.count} give {Math.round(topShare.share * 100)}% of that.</>}
        {" "}Each is measured on its own, so the total is close but not exact.
      </p>
      {ranked.length > TOP && (
        <Button variant="quiet" size="compact" enterAction={false} disabled={disabled} onClick={() => setShowAll((all) => !all)} className="no-print mt-3 [@media(pointer:coarse)]:min-h-11">
          {showAll ? `Show the top ${TOP}` : `Show all ${ranked.length} index plays`}
        </Button>
      )}
      {afterSurrender.length > 0 && (
        <div className="mt-6 print:mt-3">
          <h3 id="index-ranking-after" data-analytics-section="index_play_ranking_after_surrender" className="text-base font-semibold">After hitting or splitting (surrender no longer offered)</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ink-muted)] print:text-[9px] print:leading-4">These stand indices apply once surrender is off the table: a drawn hand or a split one. Priced as measured at tables without surrender, and left out of the total above.</p>
          <ul aria-labelledby="index-ranking-after" className="mt-2">
            {afterSurrender.map((play) => <PlayRow key={play.key} play={play} max={max} hidden={false} onShow={onShow} disabled={disabled} />)}
          </ul>
        </div>
      )}
      {unmeasured.length > 0 && (
        <div className="mt-6 print:mt-3">
          <h3 id="index-ranking-unmeasured" data-analytics-section="index_play_ranking_unmeasured" className="text-base font-semibold">Not measured yet</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ink-muted)] print:text-[9px] print:leading-4">Early surrender&apos;s ten-column plays come from Stanford Wong&apos;s tables; their value at this spread has not been simulated.</p>
          <ul aria-labelledby="index-ranking-unmeasured" className="mt-2">
            {unmeasured.map((play) => <PlayRow key={play.key} play={play} max={max} hidden={false} onShow={onShow} disabled={disabled} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
