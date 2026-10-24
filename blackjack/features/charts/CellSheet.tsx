"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Action } from "@/lib/blackjack/types";
import { ACTION_FILL, ACTION_NAME } from "@/components/blackjack/actions";
import { Sheet } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { SOURCE_NAME, basicPlay, countLadder, handLabel, playIndex, rulesSummary, signedCount, surrenderRule, thresholdPhrase, wongSource, type CellRef, type LadderSegment, type TableRules } from "@/lib/strategy";

const LADDER_MIN = -6;
const LADDER_MAX = 10;
const lower = (action: Action) => ACTION_NAME[action].toLowerCase();

function rangeText(segment: LadderSegment) {
  if (segment.from === LADDER_MIN && segment.to === LADDER_MAX) return "At every count";
  if (segment.from === LADDER_MIN) return `${signedCount(segment.to)} or lower`;
  if (segment.to === LADDER_MAX) return `${signedCount(segment.from)} or higher`;
  return segment.from === segment.to ? `At ${signedCount(segment.from)}` : `${signedCount(segment.from)} to ${signedCount(segment.to)}`;
}

/**
 * One cell's play at every true count from −6 to +10, as a coloured bar and
 * as sentences. This is the whole index story for a hand in one picture:
 * where basic strategy holds and where the count changes it.
 */
export function CountLadder({ rules, cell, marker, surrender = true }: { rules: TableRules; cell: CellRef; marker?: number; surrender?: boolean }) {
  const segments = surrender ? countLadder(rules, cell, LADDER_MIN, LADDER_MAX) : countLadderNoSurrender(rules, cell);
  const span = LADDER_MAX - LADDER_MIN + 1;
  return (
    <div>
      <div className="relative">
        <div className="flex h-10 overflow-hidden rounded-xl" aria-hidden>
          {segments.map((segment) => (
            <div key={segment.from} className={cx("flex items-center justify-center border-r border-black/10 text-sm font-bold last:border-r-0", ACTION_FILL[segment.action])} style={{ flexGrow: segment.to - segment.from + 1, flexBasis: 0 }}>
              {segment.to - segment.from >= 1 ? segment.action : ""}
            </div>
          ))}
        </div>
        {marker !== undefined && marker >= LADDER_MIN && marker <= LADDER_MAX && (
          <div aria-hidden className="absolute -top-1.5 bottom-[-0.375rem] w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${((marker - LADDER_MIN + 0.5) / span) * 100}%` }} />
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[0.6875rem] text-ink-3" aria-hidden>
        {[-6, -4, -2, 0, 2, 4, 6, 8, 10].map((tc) => <span key={tc} className="w-6 text-center first:text-left last:text-right">{signedCount(tc)}</span>)}
      </div>
      <ul className="mt-3 space-y-1.5">
        {segments.map((segment) => (
          <li key={segment.from} className="flex items-center gap-2.5 text-sm">
            <span className={cx("inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-xs font-bold", ACTION_FILL[segment.action])} aria-hidden>{segment.action}</span>
            <span className="tnum w-28 shrink-0 font-medium">{rangeText(segment)}</span>
            <span className="text-ink-2">{ACTION_NAME[segment.action]}{segment.fallback ? `, else ${lower(segment.fallback)}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same ladder for a hand that can no longer surrender (after a hit or a split). */
function countLadderNoSurrender(rules: TableRules, cell: CellRef): LadderSegment[] {
  return countLadder({ ...rules, surrender: "none" }, cell, LADDER_MIN, LADDER_MAX);
}

export function CellSheet({ rules, cell, open, onClose, tc }: {
  rules: TableRules; cell: CellRef | null; open: boolean; onClose: () => void; tc?: number;
}) {
  if (!cell) return null;
  const title = `${handLabel(cell.section, cell.row)} vs ${cell.dealer === "A" ? "an ace" : cell.dealer}`;
  const basic = basicPlay(rules, cell);
  const index = playIndex(rules, cell);
  const surrender = cell.section === "soft" ? undefined : surrenderRule(rules, cell);
  const hasSurrender = surrender && surrender.at !== Infinity;
  const differentWithoutSurrender = hasSurrender && countLadderNoSurrender(rules, cell).length > 1;
  const neverWithCount = surrender?.basic && surrender.at === Infinity;
  const changes = [
    hasSurrender && Number.isFinite(surrender!.at) && (surrender!.basic ? `Play on at ${signedCount(surrender!.at - 1)} or lower` : `Surrender at ${signedCount(surrender!.at)} or higher`),
    neverWithCount && "Never surrender",
    index && `${hasSurrender ? `Can't surrender: ${lower(index.play)}` : ACTION_NAME[index.play]} ${thresholdPhrase(index)}`,
  ].filter((line): line is string => Boolean(line));
  return (
    <Sheet open={open} onClose={onClose} title={title} description={rulesSummary(rules)}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-xs font-medium text-ink-3">Basic strategy</dt>
            <dd className="mt-1 font-semibold">
              {surrender?.basic ? "Surrender" : ACTION_NAME[basic.action]}
              {!surrender?.basic && basic.fallback && <span className="font-normal text-ink-2"> · else {lower(basic.fallback)}</span>}
              {surrender?.basic && <span className="font-normal text-ink-2"> · else {lower(basic.action)}</span>}
            </dd>
          </div>
          <div className="rounded-xl bg-brand/10 p-3">
            <dt className="text-xs font-medium text-ink-3">With the count</dt>
            <dd className="mt-1 space-y-0.5 font-semibold">
              {changes.length ? changes.map((line) => <p key={line}>{line}</p>) : <p>No change</p>}
            </dd>
          </div>
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Play at each true count{hasSurrender ? " (surrender allowed)" : ""}</h3>
          <CountLadder rules={rules} cell={cell} marker={tc} />
        </section>

        {differentWithoutSurrender && (
          <section>
            <h3 className="mb-1 text-sm font-semibold">If you can&rsquo;t surrender</h3>
            <p className="mb-2 text-sm text-ink-3">After you hit or split, or at a table without surrender.</p>
            <CountLadder rules={rules} cell={cell} marker={tc} surrender={false} />
          </section>
        )}

        {neverWithCount && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm leading-6 text-ink-2">
            Basic strategy surrenders this hand, but Wong&rsquo;s surrender table prints no number for it: with a count, play it out.
          </p>
        )}

        <p className="text-xs leading-5 text-ink-3">
          Numbers: {[SOURCE_NAME[wongSource(rules)], surrender?.source && SOURCE_NAME[surrender.source]].filter(Boolean).filter((value, position, all) => all.indexOf(value) === position).join(" · ")}.
          {rules.decks > 1 && rules.decks !== 4 && ` Wong's four-deck numbers, which he gives for every multiple-deck game.`}
          {" "}Basic strategy, the play with no count, is checked against an exact calculation for these rules.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/train/basic-strategy" className="flex h-11 items-center justify-between rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2">Drill basic strategy <ChevronRight size={16} aria-hidden /></Link>
          <Link href="/train/deviations" className="flex h-11 items-center justify-between rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-surface-2">Drill index plays <ChevronRight size={16} aria-hidden /></Link>
        </div>
      </div>
    </Sheet>
  );
}
