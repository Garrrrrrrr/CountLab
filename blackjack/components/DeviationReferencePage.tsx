"use client";

import { useMemo, useState } from "react";
import { Panel, Select } from "@/components/ui";
import { DEVIATION_ACTION_NAMES, deviationTransition } from "@/lib/blackjack/deviations";
import { H17_PRO_DEVIATIONS } from "@/lib/blackjack/h17Pro";
import { S17_PRO_DEVIATIONS } from "@/lib/blackjack/s17Pro";
import {
  DEVIATION_RANKING,
  DEVIATION_RANKING_METADATA,
  DeviationRankingProfile,
} from "@/lib/blackjack/deviationRanking";

type Ruleset = "h17" | "s17";
const CATALOGS: Record<Ruleset, { label: string; rows: typeof H17_PRO_DEVIATIONS }> = {
  h17: { label: "H17 Pro", rows: H17_PRO_DEVIATIONS },
  s17: { label: "S17 Pro", rows: S17_PRO_DEVIATIONS },
};

const signedEv = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`;

export default function DeviationReferencePage() {
  const [ruleset, setRuleset] = useState<Ruleset>("h17");
  const [surrender, setSurrender] = useState(true);
  const [sort, setSort] = useState<"chart" | "ev">("chart");
  const [search, setSearch] = useState("");
  const catalog = CATALOGS[ruleset];
  const profile = `${ruleset}${surrender ? "-ls" : "-no-ls"}` as DeviationRankingProfile;

  const rows = useMemo(() => {
    const ranking = DEVIATION_RANKING[profile];
    const rules = { dealerHitsSoft17: ruleset === "h17", lateSurrender: surrender };
    const query = search.trim().toLowerCase();

    const decorated = catalog.rows.map((row) => {
      const [evPer100, standardError, triggersPer100] = ranking[row.id] ?? [0, 0, 0];
      // A row is dormant when the departure never differs from basic strategy
      // under these rules: an unconditional surrender the table already plays,
      // or a starred stand index that a late surrender outranks at every count.
      // The measured trigger rate and `changesPlay` agree; a test asserts it.
      return { ...row, ...deviationTransition(row, rules), evPer100, standardError, triggersPer100, dormant: triggersPer100 === 0 };
    });
    const filtered = decorated.filter(
      (row) => !query || `${catalog.label} ${row.hand} ${row.dealer} ${DEVIATION_ACTION_NAMES[row.baseline]} ${DEVIATION_ACTION_NAMES[row.departure]}`.toLowerCase().includes(query),
    );
    if (sort === "ev") filtered.sort((a, b) => b.evPer100 - a.evPer100);
    return filtered;
  }, [catalog, profile, ruleset, search, sort, surrender]);

  const live = rows.filter((row) => !row.dormant);
  const total = live.reduce((sum, row) => sum + row.evPer100, 0);
  const widestInterval = Math.max(0, ...live.map((row) => 1.96 * row.standardError));

  const indexLabel = (row: (typeof rows)[number]) =>
    row.always
      ? "Always"
      : `TC ${row.atOrBelow || row.direction === "atOrBelow" ? "≤" : "≥"} ${row.index > 0 ? "+" : ""}${row.index}`;
  const evLabel = (row: (typeof rows)[number]) =>
    row.dormant ? "no effect" : `${signedEv(row.evPer100)} ± ${(1.96 * row.standardError).toFixed(3)}`;

  return <>
    <h1 className="text-3xl font-semibold">Index Deviations</h1>
    <p className="mt-2 text-zinc-400">Index deviations for 4–8 deck games: 30 H17 plays, 32 S17 plays.</p>
    <Panel className="mt-7">
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-sm text-zinc-300">
        <p>The H17 rows are every index the H17 chart prints, so this page, the play drill and the chart drill all teach one set of numbers; the S17 rows come from the supplied S17 Pro chart. Each catalog includes insurance, split, soft-total, hard-total, and late-surrender decisions. “Always” means the chart marks the surrender as a standing late-surrender play rather than a count threshold.</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Insurance is TC +3 for 4–8 deck games. Whether the table offers surrender changes which plays do anything at all, so pick both settings below. The chart’s starred stand indices for 15 and 16 are applied only where surrender is unavailable: standing on those hands is worth about −0.53 to −0.61 per unit at <em>every</em> true count, because a ten-rich shoe leaves the dealer fewer stiff hands to bust with, so it never overtakes the flat −0.50 of surrendering.
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Two H17 cells are printed against the measurement and are shown here as printed: the chart surrenders 15 v 10 at 0 and below and 16 v 9 at −1 and below, playing the hand above those counts, where basic strategy surrenders at every count. Their measured EV below is negative — the chart is what the drill grades, and the cost of following it is on the table rather than quietly corrected.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Dealer rule" value={ruleset} onChange={(event) => setRuleset(event.target.value as Ruleset)}>
          <option value="h17">H17 (dealer hits soft 17)</option>
          <option value="s17">S17 (dealer stands soft 17)</option>
        </Select>
        <Select label="Surrender" value={surrender ? "ls" : "none"} onChange={(event) => setSurrender(event.target.value === "ls")}>
          <option value="ls">Late surrender offered</option>
          <option value="none">No surrender</option>
        </Select>
        <Select label="Sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="chart">Chart order</option>
          <option value="ev">EV impact</option>
        </Select>
        <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
          Search
          <input className="field min-h-11 w-full min-w-0 rounded-xl px-3 text-[.9rem] text-zinc-100 outline-none" placeholder="Hand, dealer, or action…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Showing {rows.length} of {catalog.rows.length} departures · {live.length} change a play under these rules, worth about {total.toFixed(2)} units per 100 rounds together
      </p>

      <div className="mt-3 grid gap-3 sm:hidden">{rows.map((row) => (
        <article key={row.id} className={`rounded-xl border border-white/[.06] bg-black/20 p-3 ${row.dormant ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <b>{row.hand} vs {row.dealer}</b>
            <span className="shrink-0 text-emerald-300">{indexLabel(row)}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">{DEVIATION_ACTION_NAMES[row.baseline]} → <b className="text-emerald-200">{DEVIATION_ACTION_NAMES[row.departure]}</b></p>
          <p className="mt-2 text-xs text-zinc-500">
            {row.dormant
              ? "No effect: basic strategy already plays this way here."
              : <>EV impact {evLabel(row)} units / 100 rounds · fires {row.triggersPer100.toFixed(2)}× per 100</>}
          </p>
        </article>
      ))}</div>

      <div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm">
        <thead className="text-zinc-500"><tr>
          <th className="p-2">Hand</th><th className="p-2">Dealer</th><th className="p-2">Index</th>
          <th className="p-2">Baseline</th><th className="p-2">Departure</th>
          <th className="p-2 text-right">EV impact</th><th className="p-2 text-right">Fires</th>
        </tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id} className={`border-t border-white/[.06] ${row.dormant ? "text-zinc-600" : ""}`}>
            <td className="p-2 font-medium">{row.hand}</td>
            <td className="p-2">{row.dealer}</td>
            <td className={`p-2 ${row.dormant ? "" : "text-emerald-300"}`}>{indexLabel(row)}</td>
            <td className="p-2">{DEVIATION_ACTION_NAMES[row.baseline]}</td>
            <td className={`p-2 font-medium ${row.dormant ? "" : "text-emerald-200"}`}>{DEVIATION_ACTION_NAMES[row.departure]}</td>
            <td className="p-2 text-right tabular-nums" title={row.dormant ? "Basic strategy already plays this way under these rules" : "Units per 100 rounds, with a 95% interval"}>{evLabel(row)}</td>
            <td className="p-2 text-right tabular-nums text-zinc-500">{row.dormant ? "—" : `${row.triggersPer100.toFixed(2)}/100`}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <div className="mt-4 space-y-2 border-t border-white/[.06] pt-4 text-xs leading-5 text-zinc-600">
        <p>
          <b className="text-zinc-500">EV impact</b> is units won per 100 rounds by adding that one departure to basic strategy, on {DEVIATION_RANKING_METADATA.game.toLowerCase()} with a {DEVIATION_RANKING_METADATA.ramp} bet ramp. <b className="text-zinc-500">Fires</b> is how often in 100 rounds it actually changes a decision.
        </p>
        <p>
          Measured over {DEVIATION_RANKING_METADATA.rounds.toLocaleString()} rounds per profile with {DEVIATION_RANKING_METADATA.replications} paired replications per triggered decision — {DEVIATION_RANKING_METADATA.method}. Widest 95% interval on this table: ±{widestInterval.toFixed(3)}.
        </p>
        <p>{DEVIATION_RANKING_METADATA.limit}, so treat the column total as close but not exact.</p>
      </div>
    </Panel>
  </>;
}
