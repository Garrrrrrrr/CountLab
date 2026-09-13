"use client";

import { useMemo, useState } from "react";
import type { SimulatedShoe } from "@/lib/blackjack/shoeSimulation";
import { summarizeHandGrades } from "@/lib/blackjack/fullShoeSession";
import { GhostButton, Metric, Panel } from "./ui";
import { PlayingCard } from "./PlayingCard";

const money = (value: number, digits = 2) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const cardLabel = (cards: { rank: string; suit: string }[]) => cards.map((card) => `${card.rank}${card.suit[0].toUpperCase()}`).join(" ");

export function HandReplayer({
  shoe,
  onBack,
  backLabel = "Back to Shoes",
  title = `Shoe #${shoe.shoeNumber} Analysis`,
}: {
  shoe: SimulatedShoe;
  onBack: () => void;
  backLabel?: string;
  title?: string;
}) {
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const grades = useMemo(() => summarizeHandGrades(shoe.hands), [shoe.hands]);
  // Shoes replayed from the simulator carry no graded decisions; the strip is
  // only meaningful when something was actually graded.
  const gradedHands = grades.filter((grade) => grade.graded > 0);
  const missedHands = gradedHands.filter((grade) => grade.errors > 0).length;
  const hand = shoe.hands[selectedHandIndex];
  if (!hand) return null;

  return (
    <Panel>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"><i className="fa-solid fa-arrow-left mr-1.5" />{backLabel}</button>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        <span className="rounded-full bg-white/[.05] px-3 py-1 text-xs text-[var(--ink-muted)]">{shoe.totalHands} hands</span>
      </div>

      {gradedHands.length > 0 && (
        <div data-testid="hand-grader" className="mb-5 rounded-2xl border border-white/[.06] bg-black/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-semibold">Hand Grader</h3>
            <p className="text-xs text-[var(--ink-muted)]">
              {missedHands === 0
                ? `All ${gradedHands.length} graded hands played correctly`
                : `${missedHands} of ${gradedHands.length} hands had errors`}
            </p>
          </div>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Select a hand to open it below.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {grades.map((grade) => {
              const tone = grade.graded === 0
                ? "border-white/[.08] bg-white/[.03] text-[var(--ink-muted)]"
                : grade.errors > 0
                  ? "border-red-400/30 bg-red-400/[.12] text-[var(--negative)]"
                  : "border-emerald-400/25 bg-emerald-400/[.1] text-[var(--accent)]";
              const result = grade.graded === 0
                ? "not graded"
                : grade.errors > 0
                  ? `${grade.errors} error${grade.errors === 1 ? "" : "s"}`
                  : "all correct";
              return (
                <button
                  key={grade.index}
                  type="button"
                  data-testid="hand-grade-tile"
                  data-round={grade.roundInShoe}
                  data-grade={grade.graded === 0 ? "ungraded" : grade.errors > 0 ? "error" : "ok"}
                  aria-label={`Hand ${grade.roundInShoe}, ${result}`}
                  aria-pressed={grade.index === selectedHandIndex}
                  onClick={() => setSelectedHandIndex(grade.index)}
                  className={`pressable grid h-10 w-10 place-content-center rounded-lg border text-[.7rem] font-semibold leading-tight outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${tone} ${grade.index === selectedHandIndex ? "ring-2 ring-white/50" : ""}`}
                >
                  <span>{grade.roundInShoe}</span>
                  {grade.errors > 0 && <span className="text-[.6rem] font-bold opacity-80">{grade.errors}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[.7rem] text-[var(--ink-muted)]">
            <span><i className="fa-solid fa-square mr-1.5 text-[var(--accent)]/70" aria-hidden="true" />All correct</span>
            <span><i className="fa-solid fa-square mr-1.5 text-[var(--negative)]/70" aria-hidden="true" />Has errors</span>
            <span><i className="fa-solid fa-square mr-1.5 text-[var(--ink-muted)]" aria-hidden="true" />Not graded</span>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Hand Replayer</h3>
              <p className="text-xs text-[var(--ink-muted)]">Hand {hand.roundInShoe} of {shoe.totalHands}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              <GhostButton className="px-3 py-1.5" disabled={selectedHandIndex === 0} onClick={() => setSelectedHandIndex((i) => Math.max(0, i - 1))}><i className="fa-solid fa-chevron-left" /></GhostButton>
              <span>{selectedHandIndex + 1} / {shoe.hands.length}</span>
              <GhostButton className="px-3 py-1.5" disabled={selectedHandIndex === shoe.hands.length - 1} onClick={() => setSelectedHandIndex((i) => Math.min(shoe.hands.length - 1, i + 1))}><i className="fa-solid fa-chevron-right" /></GhostButton>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Dealer</p>
            <div className="flex gap-2">{hand.dealerCards.map((card, index) => <PlayingCard key={index} card={card} size="sm" />)}</div>

            {hand.playerHands.map((box, boxIndex) => (
              <div key={boxIndex} className="mt-4 border-t border-white/[.06] pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium uppercase tracking-wide text-[var(--ink-muted)]">Hand {boxIndex + 1}</span>
                  <span className={box.net >= 0 ? "text-[var(--accent)]" : "text-[var(--negative)]"}>{box.net >= 0 ? "+" : ""}{money(box.net, 0)}</span>
                </div>
                <div className="flex gap-2">{box.cards.map((card, index) => <PlayingCard key={index} card={card} size="sm" />)}</div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">{box.surrendered ? "Surrendered" : cardLabel(box.cards)} · Bet {money(box.bet ?? hand.bet, 0)}</p>
              </div>
            ))}

            {hand.decisions && hand.decisions.length > 0 && (
              <div className="mt-4 border-t border-white/[.06] pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Decision review</p>
                <div className="mt-2 space-y-2">
                  {hand.decisions.map((decision, index) => (
                    <div key={`${decision.category}-${index}`} className={`rounded-xl border p-3 text-sm ${decision.ok ? "border-emerald-400/15 bg-emerald-400/[.05]" : "border-red-400/20 bg-red-400/[.06]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{decision.category} · TC {decision.trueCount >= 0 ? "+" : ""}{decision.trueCount}</span>
                        <strong className={decision.ok ? "text-[var(--accent)]" : "text-[var(--negative)]"}>{decision.chosen} → {decision.correct}</strong>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{decision.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold">Context</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Running count" value={hand.runningCountBefore} />
            <Metric label="True count" value={hand.trueCountBefore.toFixed(1)} />
            <Metric label="Total wager" value={money(hand.bet, 0)} />
            <Metric label="Net result" value={`${hand.netResult >= 0 ? "+" : ""}${money(hand.netResult, 0)}`} />
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-[var(--ink-muted)]">Shoe summary</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Total hands" value={shoe.totalHands} />
            <Metric label="Total P/L" value={`${shoe.totalProfit >= 0 ? "+" : ""}${money(shoe.totalProfit, 0)}`} />
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-white/[.06] pt-5">
        <h3 className="font-semibold">Hand History</h3>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">Select a row, then press Enter or Space to view that hand.</p>
        <div className="mt-3 max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--paper-raised)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="pb-3">#</th>
                <th>Hands</th>
                <th>Dealer</th>
                <th>TC</th>
                <th>Min</th>
                <th>Max</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {shoe.hands.map((row, index) => (
                <tr
                  key={row.handNumber}
                  role="button"
                  tabIndex={0}
                  aria-label={`View hand ${row.roundInShoe}`}
                  onClick={() => setSelectedHandIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedHandIndex(index);
                    }
                  }}
                  className={`cursor-pointer border-t border-white/[.06] outline-none hover:bg-white/[.03] focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${index === selectedHandIndex ? "bg-emerald-300/[.05]" : ""}`}
                >
                  <td className="py-2.5">{row.roundInShoe}</td>
                  <td className="py-2.5">{row.playerHands.map((box) => `${cardLabel(box.cards)}(${box.net >= 0 ? "+" : ""}${money(box.net, 0)})`).join(" ")}</td>
                  <td className="py-2.5">{cardLabel(row.dealerCards)}</td>
                  <td className="py-2.5">{row.trueCountBefore.toFixed(1)}</td>
                  <td className="py-2.5">{row.tcMin.toFixed(1)}</td>
                  <td className="py-2.5">{row.tcMax.toFixed(1)}</td>
                  <td className={`py-2.5 ${row.netResult >= 0 ? "text-[var(--accent)]" : "text-[var(--negative)]"}`}>{row.netResult >= 0 ? "+" : ""}{money(row.netResult, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
