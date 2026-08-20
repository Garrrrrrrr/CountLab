"use client";

import { useMemo, useState } from "react";
import { Panel, Select } from "@/components/ui";
import { DEVIATION_ACTION_NAMES } from "@/lib/blackjack/deviations";
import { H17_PRO_DEVIATIONS } from "@/lib/blackjack/h17Pro";
import { S17_PRO_DEVIATIONS } from "@/lib/blackjack/s17Pro";
import { DEVIATION_RANKING, DEVIATION_RANKING_METADATA } from "@/lib/blackjack/deviationRanking";

type Ruleset = "h17" | "s17";
const CATALOGS: Record<Ruleset, { label: string; rows: typeof H17_PRO_DEVIATIONS }> = {
  h17: { label: "H17 Pro", rows: H17_PRO_DEVIATIONS },
  s17: { label: "S17 Pro", rows: S17_PRO_DEVIATIONS },
};

export default function DeviationReferencePage() {
  const [ruleset, setRuleset] = useState<Ruleset>("h17");
  const [sort, setSort] = useState<"chart" | "ev">("chart");
  const [search, setSearch] = useState("");
  const catalog = CATALOGS[ruleset];
  const catalogs = useMemo(
    () => catalog.rows.map((row) => ({ ...row, catalog: catalog.label, evPer100: DEVIATION_RANKING[row.id] as number | undefined })),
    [catalog],
  );
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = catalogs.filter((row) => !query || `${row.catalog} ${row.hand} ${row.dealer} ${row.normalAction} ${row.deviationAction}`.toLowerCase().includes(query));
    if (sort !== "ev") return filtered;
    return [...filtered].sort((a, b) => (b.evPer100 ?? Number.NEGATIVE_INFINITY) - (a.evPer100 ?? Number.NEGATIVE_INFINITY));
  }, [catalogs, search, sort]);
  return <>
    <h1 className="text-3xl font-semibold">Index Deviations</h1>
    <p className="mt-2 text-zinc-400">Pro deviations for 4–8 deck games: 34 H17 plays, 32 S17 plays.</p>
    <Panel className="mt-7">
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-sm text-zinc-300">
        <p>Based exactly on the supplied Pro charts for each dealer rule. Each catalog includes insurance, split, soft-total, hard-total, and late-surrender decisions. “Always” means the chart marks the surrender as a standing late-surrender play rather than a count threshold.</p>
        <p className="mt-2 text-xs text-zinc-500">Insurance is TC +3 for 4–8 deck games. EV impact is each play&apos;s own standalone marginal value against a no-index baseline — {DEVIATION_RANKING_METADATA.method} Overlapping plays (e.g. 16 v 9 stand vs surrender) aren&apos;t additive, so don&apos;t sum this column.</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Select label="Dealer rule" value={ruleset} onChange={(event) => setRuleset(event.target.value as Ruleset)}>
          <option value="h17">H17 (dealer hits soft 17)</option>
          <option value="s17">S17 (dealer stands soft 17)</option>
        </Select>
        <Select label="Sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="chart">Chart order</option>
          <option value="ev">EV impact</option>
        </Select>
        <label className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
          Search
          <input className="field min-h-11 w-full min-w-0 rounded-xl px-3 text-[.9rem] text-zinc-100 outline-none" placeholder="Catalog, hand, or dealer…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <p className="mt-4 text-xs text-zinc-500">Showing {rows.length} of {catalogs.length} departures</p>
      <div className="mt-3 grid gap-3 sm:hidden">{rows.map((row) => <article key={`${row.catalog}-${row.id}`} className="rounded-xl border border-white/[.06] bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><b>{row.hand} vs {row.dealer}</b><span className="shrink-0 text-emerald-300">{row.always ? "Always" : `TC ${row.direction === "atOrBelow" ? "≤" : "≥"} ${row.index > 0 ? "+" : ""}${row.index}`}</span></div><p className="mt-2 text-sm text-zinc-400">{DEVIATION_ACTION_NAMES[row.normalAction]} → <b className="text-emerald-200">{DEVIATION_ACTION_NAMES[row.deviationAction]}{row.overridesSurrender ? "*" : ""}</b></p><p className="mt-2 text-xs text-zinc-500">EV impact: {row.evPer100 === undefined ? "–" : `${row.evPer100 >= 0 ? "+" : ""}${row.evPer100.toFixed(3)}%`}</p></article>)}</div>
      <div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm">
        <thead className="text-zinc-500"><tr><th className="p-2">Hand</th><th className="p-2">Dealer</th><th className="p-2">Index</th><th className="p-2">Baseline</th><th className="p-2">Departure</th><th className="p-2">EV impact</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.catalog}-${row.id}`} className="border-t border-white/[.06]"><td className="p-2 font-medium">{row.hand}</td><td className="p-2">{row.dealer}</td><td className="p-2 text-emerald-300">{row.always ? "Always" : `TC ${row.direction === "atOrBelow" ? "≤" : "≥"} ${row.index > 0 ? "+" : ""}${row.index}`}</td><td className="p-2">{DEVIATION_ACTION_NAMES[row.normalAction]}</td><td className="p-2 font-medium text-emerald-200">{DEVIATION_ACTION_NAMES[row.deviationAction]}{row.overridesSurrender ? "*" : ""}</td><td className="p-2 tabular-nums text-zinc-400">{row.evPer100 === undefined ? "–" : `${row.evPer100 >= 0 ? "+" : ""}${row.evPer100.toFixed(3)} units`}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-3 text-xs text-zinc-600">EV impact is units per 100 hands, simulated {DEVIATION_RANKING_METADATA.trialsPerRow.toLocaleString()} paired shoe sessions per play ({DEVIATION_RANKING_METADATA.handsPerShoe} hands/shoe) — {DEVIATION_RANKING_METADATA.limit}</p>
    </Panel>
  </>;
}
