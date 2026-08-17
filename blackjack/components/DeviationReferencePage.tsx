"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui";
import { DEVIATION_ACTION_NAMES } from "@/lib/blackjack/deviations";
import { FREEBJ_DEFAULT_HILO_DEVIATIONS } from "@/lib/blackjack/fullHiLoIndices";

export default function DeviationReferencePage() {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return FREEBJ_DEFAULT_HILO_DEVIATIONS.filter((row) =>
      !query || `${row.hand} ${row.dealer} ${row.normalAction} ${row.deviationAction}`.toLowerCase().includes(query),
    );
  }, [search]);
  return (
    <>
      <h1 className="text-3xl font-semibold">Index Deviations</h1>
      <p className="mt-2 text-zinc-400">The MIT-licensed FreeBJ default Hi-Lo deviation set.</p>
      <Panel className="mt-7">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-sm text-zinc-300">
          <p>This is a compact 17-play training reference, not a claimed complete index matrix. It includes no insurance or surrender departures; surrender remains the selected table&rsquo;s basic-strategy decision. Exact indices vary by rules, decks, penetration, and true-count method.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Source: {FREEBJ_DEFAULT_HILO_DEVIATIONS.length} default deviations ·{" "}
            <a className="text-emerald-300 hover:underline" href="https://github.com/kevin-lesenechal/freebj" target="_blank" rel="noreferrer">FreeBJ (MIT)</a>
          </p>
        </div>
        <input className="mt-5 min-h-11 w-full rounded-lg bg-black/20 px-3 ring-1 ring-white/10" placeholder="Search hand or dealer…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <p className="mt-4 text-xs text-zinc-500">Showing {rows.length} of {FREEBJ_DEFAULT_HILO_DEVIATIONS.length} departures</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500"><tr><th className="p-2">Player hand</th><th className="p-2">Dealer</th><th className="p-2">Index</th><th className="p-2">Basic strategy</th><th className="p-2">Departure</th><th className="p-2">Surrender departure</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/[.06]"><td className="p-2 font-medium">{row.hand}</td><td className="p-2">{row.dealer}</td><td className="p-2 text-emerald-300">TC {row.direction === "atOrBelow" ? "≤" : "≥"} {row.index > 0 ? "+" : ""}{row.index}</td><td className="p-2">{DEVIATION_ACTION_NAMES[row.normalAction]}</td><td className="p-2 font-medium text-emerald-200">{DEVIATION_ACTION_NAMES[row.deviationAction]}</td><td className="p-2">{row.surrenderAllowed ? "Yes" : "No"}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
