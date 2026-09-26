"use client";

import { useMemo, useState } from "react";
import { count, dealtPercent, money, percent } from "@/lib/blackjack/labFormat";
import { compareGames, type CompareBasis, type GameComparison } from "@/lib/blackjack/labModel";
import { GhostButton, SegmentedControl, Section } from "@/components/ui";
import { StatusMark } from "./parts";
import type { Lab } from "./useLab";

const gameName = (row: GameComparison) => `${row.decks} decks, ${row.dealt} dealt`;

/**
 * The nine audited deck and penetration choices, ranked by SCORE for this
 * bankroll and unit. Each can be priced with the player's own ramp (so the
 * current game matches the headline) or with its own optimal ramp, and any
 * game can be switched to in place, with Undo.
 */
export function CompareGames({ lab, className = "" }: { lab: Lab; className?: string }) {
  const { config } = lab;
  const [basis, setBasis] = useState<CompareBasis>("yours");
  const rows = useMemo(() => compareGames(config, basis), [config, basis]);
  const rank = rows.findIndex((row) => row.current) + 1;
  const best = rows[0];
  const action = (row: GameComparison) => row.current
    ? <StatusMark tone="good">Your game</StatusMark>
    : (
      <GhostButton size="compact" className="whitespace-nowrap" onClick={() => lab.switchGame(row, basis === "optimal")} aria-label={`Use ${gameName(row)}${basis === "optimal" ? " with its optimal ramp" : ""}`}>
        {basis === "optimal" ? "Use game + ramp" : "Use this game"}
      </GhostButton>
    );
  return (
    <div className={className}>
      <Section
        title="Compare with other games"
        summary={rank ? `Your game ranks #${rank} of ${rows.length} · Best: ${gameName(best)}` : `Best: ${gameName(best)}`}
        icon="fa-ranking-star"
        open={false}
        analyticsSection="compare_against_the_other_games"
      >
        <p className="max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
          The nine audited games with your {money(config.baseBet)} unit and {money(config.bankroll)} bankroll, ranked by SCORE, which compares games regardless of stakes. Price them with your own ramp to see what switching tables alone would do, or give each game its own optimal ramp, capped at your {config.maxSpread}× maximum spread.
        </p>
        <SegmentedControl<CompareBasis>
          label="Price each game with"
          name="compare-basis"
          size="compact"
          analyticsField="compare_basis"
          className="lab-seg mt-3"
          value={basis}
          onChange={setBasis}
          options={[{ value: "yours", label: "Your bet ramp" }, { value: "optimal", label: "Its own optimal ramp" }]}
        />
        <div className="lab-compare mt-4">
          <ol className="lab-compare-list grid gap-2" aria-label="Games ranked by SCORE">
            {rows.map((row, index) => (
              <li key={`${row.decks}-${row.dealt}`} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${row.current ? "border-[var(--accent)]" : "border-[var(--rule)]"}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 font-semibold"><span className="font-data text-[var(--ink-muted)]">#{index + 1}</span> {row.decks} decks · {row.dealt} dealt ({dealtPercent(row.decks, row.dealt)}%)</span>
                    <span className="shrink-0 font-data font-semibold">{money(row.result.cScore)}</span>
                  </p>
                  <p className="mt-0.5 font-data text-xs text-[var(--ink-muted)]">{money(row.result.hourlyEv, 2)}/hr · ruin {percent(row.result.riskOfRuin)} · N₀ {count(row.result.nZeroRounds)}</p>
                </div>
                <div className="shrink-0">{action(row)}</div>
              </li>
            ))}
          </ol>
          <table className="lab-compare-table w-full text-right text-sm">
            <caption className="sr-only">Games ranked by SCORE</caption>
            <thead className="text-xs text-[var(--ink-muted)]">
              <tr>
                <th scope="col" className="pb-2 text-left font-medium">Rank</th>
                <th scope="col" className="pb-2 text-left font-medium">Game</th>
                <th scope="col" className="pb-2 font-medium">SCORE</th>
                <th scope="col" className="pb-2 font-medium">Win per hour</th>
                <th scope="col" className="pb-2 font-medium">Risk of ruin</th>
                <th scope="col" className="pb-2 font-medium">N₀ (rounds)</th>
                <th scope="col" className="pb-2 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.decks}-${row.dealt}`} className={`border-t border-[var(--rule)] ${row.current ? "bg-[color:color-mix(in_srgb,var(--accent)_7%,transparent)]" : ""}`}>
                  <td className="py-2 text-left text-[var(--ink-muted)]">#{index + 1}</td>
                  <th scope="row" className="py-2 text-left font-semibold">{row.decks}D · {row.dealt} dealt <span className="font-normal text-[var(--ink-muted)]">({dealtPercent(row.decks, row.dealt)}%)</span></th>
                  <td className="font-semibold">{money(row.result.cScore)}</td>
                  <td>{money(row.result.hourlyEv, 2)}</td>
                  <td>{percent(row.result.riskOfRuin)}</td>
                  <td>{count(row.result.nZeroRounds)}</td>
                  <td className="py-1.5 pl-3">{action(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
