"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, CircleCheck, Circle, Lightbulb, SlidersHorizontal } from "lucide-react";
import { AnswerDisplay } from "@/components/blackjack";
import { Button, Callout, Card } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { countingBenchmarkDetails, countingCategoryLabel, mistakeCauses } from "@/lib/blackjack/countingTraining";
import { hiLoValue } from "@/lib/blackjack/hiLo";
import type { Card as PlayingCardData } from "@/lib/blackjack/types";
import { useSessions } from "@/lib/hooks/useSessions";
import { relativeTime } from "@/lib/statistics/drillRound";
import type { Mistake } from "@/lib/statistics/storage";

export type CountingDrill = "Running Count" | "True Count" | "Deck Estimation";

/**
 * Keypad and answer box sizes for short screens (an iPhone SE or a phone in
 * a small browser window): 44px keys so the question keeps more of the
 * screen. Applied to the shared NumberPad from outside, by selector, because
 * only these drills need it.
 */
export const COMPACT_PAD = "[@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:[&>div:first-child>button]:h-11 [@media(max-height:700px)]:[&>div:last-child>button:first-child]:h-11 [@media(max-height:700px)]:[&>div]:gap-1";
export const COMPACT_DISPLAY = "[@media(max-height:700px)]:h-12";

/** "+3", "0", "−2" with a real minus sign. */
export const signedText = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0");

/** The sentence above Start that says exactly what is about to happen. */
export function SessionLine({ parts }: { parts: readonly string[] }) {
  return (
    <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm leading-6 text-ink-2">
      <span className="font-semibold text-ink">This session: </span>
      {parts.map((part, index) => (
        <span key={part}>{index > 0 && <span aria-hidden className="text-ink-3"> · </span>}{index > 0 && <span className="sr-only">, </span>}{part}</span>
      ))}
    </p>
  );
}

/** Shown when the values match no preset, so an unticked list does not look broken. */
export function CustomNote({ onReset, resetLabel }: { onReset: () => void; resetLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-2">
      <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={15} aria-hidden /> Custom session</span>
      <Button size="sm" variant="ghost" onClick={onReset}>{resetLabel}</Button>
    </div>
  );
}

/** A fold for options most sessions never touch. */
export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  return (
    <details open={defaultOpen} className={cx("group rounded-2xl border border-line bg-surface", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-3 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-line px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}

const HI_LO = [
  { ranks: ["2", "3", "4", "5", "6"], value: "+1", tone: "text-pos" },
  { ranks: ["7", "8", "9"], value: "0", tone: "text-ink-3" },
  { ranks: ["10", "J", "Q", "K", "A"], value: "−1", tone: "text-neg" },
] as const;

/** The Hi-Lo values: the whole method in three rows. */
export function HiLoValues({ className }: { className?: string }) {
  return (
    <dl className={cx("grid gap-1.5", className)}>
      {HI_LO.map((row) => (
        <div key={row.value} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-1.5">
          <dt className="flex flex-wrap gap-1">
            {row.ranks.map((rank) => <span key={rank} className="tnum grid h-6 min-w-6 place-items-center rounded-md border border-line bg-surface px-1 text-xs font-semibold">{rank}</span>)}
          </dt>
          <dd className={cx("tnum text-sm font-bold", row.tone)}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2.5 text-base font-semibold">{title}</h2>
      <div className="text-sm leading-6 text-ink-2">{children}</div>
    </Card>
  );
}

/** The reader's history with this drill and where it stands against its benchmark target. */
export function ProgressAside({ drill, best }: { drill: CountingDrill; best: { label: string; value: string } }) {
  const all = useSessions();
  const mine = all.filter((session) => session.drill === drill);
  const last = mine[0];
  const target = countingBenchmarkDetails(all).find((detail) => detail.drill === drill);
  return (
    <AsideCard title="Your progress">
      <dl className="divide-y divide-line">
        <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
          <dt>Last session</dt>
          <dd className={cx("tnum text-right", last ? "font-semibold text-ink" : "text-ink-3")}>{last ? `${last.accuracy}% · ${relativeTime(last.date)}` : "None yet"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt>{best.label}</dt>
          <dd className="tnum text-right font-semibold text-ink">{best.value}</dd>
        </div>
        {target && (
          <div className="py-2 last:pb-0">
            <dt className="flex items-center justify-between gap-3">
              <span>Benchmark</span>
              {target.met
                ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-pos"><CircleCheck size={14} aria-hidden /> Met</span>
                : <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3"><Circle size={14} aria-hidden /> Not yet</span>}
            </dt>
            <dd className="mt-1 text-xs leading-5 text-ink-3">{target.label}. {target.latest}.</dd>
          </div>
        )}
      </dl>
    </AsideCard>
  );
}

/** Where the finished session leaves the reader against the drill's benchmark target. */
export function BenchmarkNote({ drill }: { drill: CountingDrill }) {
  const all = useSessions();
  const target = countingBenchmarkDetails(all).find((detail) => detail.drill === drill);
  if (!target) return null;
  return (
    <Callout tone={target.met ? "pos" : "info"} title={target.met ? `Benchmark met: ${target.label.toLowerCase()}` : `Benchmark: ${target.label.toLowerCase()}`}
      action={<Link href="/progress" className="inline-flex min-h-11 items-center gap-1 font-semibold text-ink hover:underline">All your progress <ChevronRight size={16} aria-hidden /></Link>}>
      Latest: {target.latest}.{target.note && ` ${target.note}`}
    </Callout>
  );
}

/** Accuracy per category of the finished session, in plain words. */
export function Breakdown({ categories }: { categories?: Record<string, { correct: number; total: number }> }) {
  const rows = Object.entries(categories ?? {}).filter(([, value]) => value.total > 0);
  if (!rows.length) return null;
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">Breakdown</h2>
      <ul className="space-y-3">
        {rows.map(([key, value]) => {
          const pct = Math.round((value.correct / value.total) * 100);
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink-2">{countingCategoryLabel(key)}</span>
                <span className="tnum shrink-0 font-semibold">{value.correct}/{value.total}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className={cx("h-full rounded-full", pct >= 90 ? "bg-pos" : pct >= 70 ? "bg-brand" : "bg-neg")} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** What tripped the reader up, most common first, each with the habit that fixes it. */
export function CauseCard({ mistakes }: { mistakes: readonly Mistake[] }) {
  const causes = mistakeCauses(mistakes);
  if (!causes.length) return null;
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">What tripped you up</h2>
      <ul className="space-y-3">
        {causes.map((cause) => (
          <li key={cause.category} className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warn/10 text-warn"><Lightbulb size={15} aria-hidden /></span>
            <div className="min-w-0 text-sm leading-6">
              <p className="font-semibold">{cause.label} <span className="tnum font-medium text-ink-3">· {cause.count} {cause.count === 1 ? "time" : "times"}</span></p>
              {cause.tip && <p className="text-ink-2">{cause.tip}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One line on how the session went, after the score. */
export const verdict = (accuracy: number) =>
  accuracy >= 95 ? "Excellent. Try more speed or a harder session."
  : accuracy >= 85 ? "Solid. A little more practice will make it automatic."
  : accuracy >= 70 ? "Getting there. Look at the misses, then go again."
  : "Worth another round. Slow down and look at the misses below.";

/** A centred message in the play area: paused, interrupted, getting ready. */
export function StageNotice({ icon, title, children, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-1 flex-col items-center justify-center px-2 py-6 text-center", className)}>
      {icon && <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink-2">{icon}</span>}
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-sm text-[0.9375rem] leading-6 text-ink-2">{children}</div>}
    </div>
  );
}

const SUIT = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" } as const;
const RANK_NAME: Record<string, string> = { A: "Ace", K: "King", Q: "Queen", J: "Jack" };
export const spokenCard = (card: PlayingCardData) => `${RANK_NAME[card.rank] ?? card.rank} of ${card.suit}`;
const valueText = (card: PlayingCardData) => signedText(hiLoValue(card));

/** Small rank-and-suit chips, with each card's Hi-Lo value when `values`. */
export function CardChips({ cards, values = true }: { cards: readonly PlayingCardData[]; values?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {cards.map((card, index) => {
        const red = card.suit === "hearts" || card.suit === "diamonds";
        const value = hiLoValue(card);
        return (
          <li key={index} className="tnum inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-1.5 text-xs font-semibold" aria-label={values ? `${spokenCard(card)}, ${valueText(card)}` : spokenCard(card)}>
            <span aria-hidden className={red ? "text-neg" : "text-ink"}>{card.rank}{SUIT[card.suit]}</span>
            {values && <span aria-hidden className={value > 0 ? "text-pos" : value < 0 ? "text-neg" : "text-ink-3"}>{valueText(card)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One answer box with its label, for drills that ask two numbers (decks
 * left and the true count). Tapping it makes it the box the keypad types into.
 */
export function PadField({ label, value, active = true, onSelect, tone, hint, className }: {
  label: string; value: string; active?: boolean; onSelect?: () => void; tone?: "pos" | "neg"; hint?: string; className?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1.5 z-10 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</span>
      {hint && <span aria-hidden className="pointer-events-none absolute right-3 top-1.5 z-10 text-[0.6875rem] font-medium text-ink-3">{hint}</span>}
      <AnswerDisplay value={value} label={label} tone={tone} className={cx("pt-3", COMPACT_DISPLAY, "[@media(max-height:700px)]:pt-4 [@media(max-height:700px)]:[&_output]:text-[1.75rem]")} />
    </>
  );
  if (!onSelect) return <div className={cx("relative min-w-0 flex-1", className)}>{inner}</div>;
  return (
    <button type="button" onClick={onSelect} aria-pressed={active} aria-label={`${label}: ${value === "" ? "empty" : value.replace("-", "minus ")}${active ? ", typing here" : ""}`}
      className={cx("relative min-w-0 flex-1 rounded-2xl text-left transition", active ? "ring-2 ring-brand ring-offset-2 ring-offset-bg" : "opacity-75 hover:opacity-100", className)}>
      {inner}
    </button>
  );
}
