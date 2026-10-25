"use client";
import { forwardRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlayingCard } from "@/components/blackjack";
import { Badge, Card, IconButton, cx } from "@/components/ui";
import { roundCountRange, summarizeHandGrades, type FullShoeDecision, type FullShoeLiveRound } from "@/lib/blackjack/fullShoeSession";
import { calculateHandValue } from "@/lib/blackjack/hand";
import { cardsText, money, signed } from "./format";

export const CATEGORY_NAME: Record<string, string> = { Betting: "Bet", "Basic Strategy": "Basic strategy", Deviations: "Index play", "Running count": "Running count", "True count": "True count" };

export function DecisionRow({ decision, compact = false }: { decision: FullShoeDecision; compact?: boolean }) {
  return (
    <li className={cx("rounded-xl border p-3 text-sm", decision.ok ? "border-pos/20 bg-pos/[0.06]" : "border-neg/25 bg-neg/[0.07]")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <Badge tone={decision.ok ? "pos" : "neg"} className="h-5 px-1.5 text-[0.6875rem]">{CATEGORY_NAME[decision.category] ?? decision.category}</Badge>
          <span className="tnum text-xs text-ink-3">TC {signed(decision.trueCount)}</span>
          {decision.credited && <Badge tone="info" className="h-5 px-1.5 text-[0.6875rem]">Your count</Badge>}
        </span>
        <span className="tnum font-semibold">
          {decision.ok ? <span className="text-pos">{decision.chosen}</span> : <><span className="text-neg line-through decoration-1">{decision.chosen}</span> <span aria-hidden>→</span><span className="sr-only">, right answer</span> <span className="text-ink">{decision.correct}</span></>}
        </span>
      </div>
      {!compact && decision.question && <p className="mt-1 font-medium">{decision.question}</p>}
      <p className="mt-1 text-xs leading-5 text-ink-2">{decision.explanation}</p>
    </li>
  );
}

const outcomeTone = (net: number) => (net > 0 ? "text-pos" : net < 0 ? "text-neg" : "text-ink-2");

/** The round-by-round strip: every round as a tile, green when every decision in it was right. */
export function GraderStrip({ rounds, selected, onSelect }: { rounds: FullShoeLiveRound[]; selected: number; onSelect: (index: number) => void }) {
  const grades = summarizeHandGrades(rounds);
  const graded = grades.filter((grade) => grade.graded > 0);
  const missed = graded.filter((grade) => grade.errors > 0).length;
  return (
    <div data-testid="hand-grader">
      <p className="text-sm text-ink-2">{graded.length === 0 ? "No decisions were graded." : missed === 0 ? `All ${graded.length} rounds played without a mistake.` : `${missed} of ${graded.length} rounds had a mistake. Pick one to replay it.`}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {grades.map((grade) => {
          const tone = grade.graded === 0 ? "border-line bg-surface-2 text-ink-3" : grade.errors ? "border-neg/30 bg-neg/10 text-neg" : "border-pos/25 bg-pos/10 text-pos";
          return (
            <button key={grade.index} type="button" data-testid="hand-grade-tile" data-round={grade.roundInShoe} data-grade={grade.graded === 0 ? "ungraded" : grade.errors ? "error" : "ok"}
              aria-label={`Round ${grade.roundInShoe}: ${grade.graded === 0 ? "not graded" : grade.errors ? `${grade.errors} ${grade.errors === 1 ? "mistake" : "mistakes"}` : "all right"}`}
              aria-pressed={grade.index === selected} onClick={() => onSelect(grade.index)}
              className={cx("tnum grid h-11 w-11 place-content-center rounded-xl border text-xs font-semibold leading-tight transition", tone, grade.index === selected && "ring-2 ring-brand ring-offset-1 ring-offset-surface")}>
              <span>{grade.roundInShoe}</span>
              {grade.errors > 0 && <span className="text-[0.625rem] opacity-80">{grade.errors}✕</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One round, replayed: the dealer, every hand, the count it started at, and each graded decision. */
export const RoundReplay = forwardRef<HTMLDivElement, { rounds: FullShoeLiveRound[]; index: number; onSelect: (index: number) => void }>(function RoundReplay({ rounds, index, onSelect }, ref) {
  const round = rounds[index];
  if (!round) return null;
  const range = roundCountRange(round);
  return (
    <div ref={ref} tabIndex={-1} className="outline-none" onKeyDown={(event) => {
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onSelect(index - 1); }
      if (event.key === "ArrowRight" && index < rounds.length - 1) { event.preventDefault(); onSelect(index + 1); }
    }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Round {round.round}</h3>
          <p className="text-xs text-ink-3">{index + 1} of {rounds.length} · use ← → to step</p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Previous round" variant="secondary" disabled={index === 0} onClick={() => onSelect(index - 1)}><ChevronLeft size={18} aria-hidden /></IconButton>
          <IconButton label="Next round" variant="secondary" disabled={index === rounds.length - 1} onClick={() => onSelect(index + 1)}><ChevronRight size={18} aria-hidden /></IconButton>
        </div>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="rounded-2xl bg-felt p-3 sm:p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-white/60">Dealer · {calculateHandValue(round.dealerCards) > 21 ? "bust" : calculateHandValue(round.dealerCards)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">{round.dealerCards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
            {round.playerHands.map((hand, i) => (
              <div key={i}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-white/60">{hand.seat !== undefined && round.playerHands.some((other) => other.seat !== hand.seat) ? `Seat ${hand.seat + 1}` : round.playerHands.length > 1 ? `Hand ${i + 1}` : "Your hand"}</p>
                <div className="mt-1 flex gap-1">{hand.cards.map((card, c) => <PlayingCard key={c} card={card} size="sm" />)}</div>
                <p className="tnum mt-1 text-xs font-semibold text-white/90">{money(hand.bet)}{hand.doubled ? " doubled" : ""} · <span className="rounded-full bg-surface px-1.5 py-px text-[0.6875rem]"><span className={outcomeTone(hand.net)}>{hand.outcome ?? (hand.surrendered ? "Surrender" : hand.net > 0 ? "Win" : hand.net < 0 ? "Loss" : "Push")} {hand.net ? money(hand.net, { sign: true }) : ""}</span></span></p>
              </div>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Running count at the deal", signed(round.runningCountBefore)],
            ["True count at the deal", signed(round.trueCountBefore)],
            ["True count range", range.min === range.max ? signed(range.min) : `${signed(range.min)} to ${signed(range.max)}`],
            ["Wagered", money(round.bet)],
            ["Result", money(round.netResult, { sign: true })],
            ...(round.bankrollAfter !== undefined ? [["Bankroll after", money(round.bankrollAfter)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className="tnum font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {round.decisions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Decisions</h4>
          <ol className="mt-2 space-y-2">{round.decisions.map((decision, i) => <DecisionRow key={i} decision={decision} />)}</ol>
        </div>
      )}
    </div>
  );
});

/** Every round in one table; scrolls sideways inside itself on phones. */
export function HistoryTable({ rounds, selected, onSelect }: { rounds: FullShoeLiveRound[]; selected: number; onSelect: (index: number) => void }) {
  return (
    <Card pad={false}>
      <h2 className="px-4 pt-4 text-base font-semibold sm:px-5">Every round</h2>
      <div className="mt-2 max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-ink-3">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pl-4 pr-2 font-medium sm:pl-5">#</th>
              <th scope="col" className="px-2 font-medium">Hands</th>
              <th scope="col" className="px-2 font-medium">Dealer</th>
              <th scope="col" className="px-2 font-medium">TC</th>
              <th scope="col" className="px-2 font-medium">Bet</th>
              <th scope="col" className="px-2 font-medium">Graded</th>
              <th scope="col" className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">Result</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rounds.map((round, index) => {
              const errors = round.decisions.filter((decision) => !decision.ok).length;
              return (
                <tr key={index} className={cx("cursor-pointer border-b border-line last:border-0 hover:bg-surface-2", index === selected && "bg-brand/10")} onClick={() => onSelect(index)}>
                  <td className="p-0"><button type="button" className="flex h-11 w-full min-w-11 items-center pl-4 pr-2 font-semibold underline-offset-2 hover:underline sm:pl-5" onClick={(event) => { event.stopPropagation(); onSelect(index); }} aria-label={`Replay round ${round.round}`}>{round.round}</button></td>
                  <td className="px-2">{round.playerHands.map((hand) => cardsText(hand.cards)).join(" | ")}</td>
                  <td className="px-2">{cardsText(round.dealerCards)}</td>
                  <td className="px-2">{signed(round.trueCountBefore)}</td>
                  <td className="px-2">{round.bet ? money(round.bet) : "Watched"}</td>
                  <td className={cx("px-2", errors ? "text-neg" : "text-ink-2")}>{round.decisions.length ? (errors ? `${errors} missed` : "all right") : "—"}</td>
                  <td className={cx("py-2 pl-2 pr-4 text-right font-semibold sm:pr-5", outcomeTone(round.netResult))}>{money(round.netResult, { sign: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
