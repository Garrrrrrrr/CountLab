"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import { DEVIATION_ACTION_NAMES } from "@/lib/blackjack/deviations";
import { H17_PRO_DEVIATIONS } from "@/lib/blackjack/apToolboxH17Pro";

const catalogs = H17_PRO_DEVIATIONS.map((row) => ({ ...row, catalog: "AP Toolbox H17 Pro" }));

export default function DeviationReferencePage() {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalogs.filter((row) => !query || `${row.catalog} ${row.hand} ${row.dealer} ${row.normalAction} ${row.deviationAction}`.toLowerCase().includes(query));
  }, [search]);
  return <>
    <h1 className="text-3xl font-semibold">Index Deviations</h1>
    <p className="mt-2 text-zinc-400">AP Toolbox H17 Pro deviations: 34 plays for 4–8 deck H17 games.</p>
    <Panel className="mt-7">
      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-sm text-zinc-300">
        <p>Based exactly on the supplied AP Toolbox H17 Pro charts. The catalog includes insurance, split, soft-total, hard-total, and late-surrender decisions. “Always” means the chart marks the surrender as a standing H17 late-surrender play rather than a count threshold.</p>
        <p className="mt-2 text-xs text-zinc-500">Insurance is TC +3 for the chart’s 4–8 deck games.</p>
      </div>
      <input className="mt-5 min-h-11 w-full rounded-lg bg-black/20 px-3 ring-1 ring-white/10" placeholder="Search catalog, hand, or dealer…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <p className="mt-4 text-xs text-zinc-500">Showing {rows.length} of {catalogs.length} departures</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-zinc-500"><tr><th className="p-2">Catalog</th><th className="p-2">Hand</th><th className="p-2">Dealer</th><th className="p-2">Index</th><th className="p-2">Baseline</th><th className="p-2">Departure</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.catalog}-${row.id}`} className="border-t border-white/[.06]"><td className="p-2 text-zinc-400">{row.catalog}</td><td className="p-2 font-medium">{row.hand}</td><td className="p-2">{row.dealer}</td><td className="p-2 text-emerald-300">{row.always ? "Always" : `TC ${row.direction === "atOrBelow" ? "≤" : "≥"} ${row.index > 0 ? "+" : ""}${row.index}`}</td><td className="p-2">{DEVIATION_ACTION_NAMES[row.normalAction]}</td><td className="p-2 font-medium text-emerald-200">{DEVIATION_ACTION_NAMES[row.deviationAction]}{row.overridesSurrender ? "*" : ""}</td></tr>)}</tbody>
      </table></div>
    </Panel>
  </>;
}
