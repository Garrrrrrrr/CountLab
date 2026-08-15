"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { DEVIATION_ACTION_NAMES } from "@/lib/blackjack/deviations";
import {
  FAB_4_DEVIATIONS,
  FULL_HI_LO_DEVIATIONS,
  FullHiLoDeviation,
  ILLUSTRIOUS_18_DEVIATIONS,
} from "@/lib/blackjack/fullHiLoIndices";
import { analytics } from "@/lib/analytics";

export default function DeviationReferencePage() {
  const [sort, setSort] = useState("index"),
    [search, setSearch] = useState(""),
    [set, setSet] = useState<"all" | "i18" | "fab4">("all"),
    [visibleMobileRows, setVisibleMobileRows] = useState(20);
  const searchState = useRef({ queryLength: 0, resultCount: 0 });
  const allRows = [
    ...FULL_HI_LO_DEVIATIONS,
    ILLUSTRIOUS_18_DEVIATIONS[0],
    ...FAB_4_DEVIATIONS,
  ];
  const selectedRows = set === "i18"
    ? ILLUSTRIOUS_18_DEVIATIONS
    : set === "fab4"
      ? FAB_4_DEVIATIONS
      : allRows;
  const i18EvOrder = new Map(ILLUSTRIOUS_18_DEVIATIONS.map((deviation, index) => [`${deviation.hand}|${deviation.dealer}`, index]));
  const fab4EvOrder = new Map(FAB_4_DEVIATIONS.map((deviation, index) => [`${deviation.hand}|${deviation.dealer}`, index]));
  const evPriority = (deviation: FullHiLoDeviation) => {
    const key = `${deviation.hand}|${deviation.dealer}`;
    const i18Rank = i18EvOrder.get(key);
    if (i18Rank !== undefined) return { order: i18Rank, label: `I18 #${i18Rank + 1}` };
    const fab4Rank = fab4EvOrder.get(key);
    if (fab4Rank !== undefined) return { order: 100 + fab4Rank, label: `Fab 4 #${fab4Rank + 1}` };
    return { order: 1000, label: "Extended" };
  };
  const rows = [...selectedRows]
    .filter((d) =>
      `${d.hand} ${d.dealer} ${DEVIATION_ACTION_NAMES[d.normalAction]} ${DEVIATION_ACTION_NAMES[d.deviationAction]}`
        .toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "ev"
        ? evPriority(a).order - evPriority(b).order || a.hand.localeCompare(b.hand) || a.dealer.localeCompare(b.dealer)
        : sort === "index"
        ? a.index - b.index
        : sort === "hand"
          ? a.hand.localeCompare(b.hand)
          : a.dealer.localeCompare(b.dealer),
    );
  useEffect(() => {
    if (!search.trim()) return;
    const timer = window.setTimeout(() => analytics.track("search_performed", {
      surface: "deviation_reference",
      result_count: rows.length,
      zero_results: rows.length === 0,
      query_length: search.trim().length,
    }), 500);
    return () => clearTimeout(timer);
  }, [rows.length, search]);
  useEffect(() => {
    searchState.current = { queryLength: search.trim().length, resultCount: rows.length };
  }, [rows.length, search]);
  useEffect(() => () => {
    const latest = searchState.current;
    if (latest.queryLength) analytics.track("search_abandoned", {
      surface: "deviation_reference",
      query_length: latest.queryLength,
      result_count: latest.resultCount,
    });
  }, []);
  useEffect(() => setVisibleMobileRows(20), [search, set, sort]);
  const threshold = (deviation: FullHiLoDeviation) => {
    const value = deviation.index > 0 ? `+${deviation.index}` : String(deviation.index);
    return `TC ${deviation.direction === "atOrBelow" ? "≤" : "≥"} ${value}`;
  };
  const context = (deviation: FullHiLoDeviation) => {
    const available = [
      deviation.doubleAllowed && "Double",
      deviation.splitAllowed && "Split",
      deviation.surrenderAllowed && "Surrender",
    ].filter(Boolean);
    return available.length ? available.join(" · ") : "Base play";
  };
  return (
    <>
      <h1 className="text-3xl font-semibold">Index Deviations</h1>
      <p data-mobile-compact-description className="mt-2 text-zinc-400">
        A complete total-dependent Hi-Lo catalog, with quick views for the
        Illustrious 18 and Fab 4.
      </p>
      <Panel className="mt-7">
        <div className="mb-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4 text-sm text-zinc-300">
          <p>
            The full view keeps action-availability contexts separate, because
            the correct index can change when doubling, splitting, or surrender
            is legal. Exact indices also vary by rules, decks, and true-count
            method.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Full table: {FULL_HI_LO_DEVIATIONS.length} generated transitions ·{" "}
            <a className="text-emerald-300 hover:underline" href="https://github.com/possibly-wrong/blackjack/blob/a1f7dbb74266fb39296292bdff568b076120a61c/indices/indices_hi_lo.txt" target="_blank" rel="noreferrer">source table</a>
            {" "}·{" "}
            <a className="text-emerald-300 hover:underline" href="https://www.qfit.com/cvdatav2a.htm" target="_blank" rel="noreferrer">why rule-specific generation matters</a>
          </p>
        </div>
        <fieldset className="mb-5">
          <legend className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-zinc-500">Deviation set</legend>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["all", "All deviations", allRows.length],
              ["i18", "Illustrious 18", ILLUSTRIOUS_18_DEVIATIONS.length],
              ["fab4", "Fab 4", FAB_4_DEVIATIONS.length],
            ] as const).map(([value, label, count]) => (
              <label key={value} className={`pressable flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2 text-center ${set === value ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200" : "border-white/[.08] bg-black/20 text-zinc-400"}`}>
                <input type="radio" name="deviation-set" value={value} checked={set === value} onChange={() => { setSet(value); analytics.track("filter_applied", { surface: "deviation_reference", filter: "set", value }); }} className="accent-emerald-400" />
                <span className="min-w-0 text-xs font-medium sm:text-sm">{value === "all" ? "All" : label}</span>
                <span className="hidden rounded-full bg-black/20 px-2 py-0.5 text-xs sm:inline">{count}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            placeholder="Search hand or dealer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 flex-1 rounded-lg bg-black/20 px-3 ring-1 ring-white/10"
          />
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); analytics.track("sort_changed", { surface: "deviation_reference", sort: e.target.value }); }}
            className="min-h-11 rounded-lg bg-black/20 px-3 ring-1 ring-white/10"
          >
            <option value="index">Sort: Index</option>
            <option value="ev">Sort: EV importance</option>
            <option value="hand">Sort: Hand</option>
            <option value="dealer">Sort: Dealer</option>
          </select>
        </div>
        {sort === "ev" && (
          <p className="mb-4 rounded-xl bg-white/[.035] px-3 py-2 text-xs leading-5 text-zinc-500">
            EV importance uses the published profitability order within the Illustrious 18 and Fab 4. Extended indices follow those sets; their exact relative EV requires a simulation for the selected rules, penetration, spread, and count method.
          </p>
        )}
        <p className="mb-4 text-xs text-zinc-500">Showing {rows.length} of {selectedRows.length} entries</p>
        <div className="space-y-2 md:hidden">
          {rows.slice(0, visibleMobileRows).map((deviation) => (
            <article key={deviation.id} className="rounded-xl border border-white/[.06] bg-black/20 p-3">
              <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                <div><p className="text-[.65rem] uppercase tracking-wide text-zinc-500">{deviation.hand} vs dealer {deviation.dealer}</p><p className="mt-1 text-sm"><span className="text-zinc-400">{DEVIATION_ACTION_NAMES[deviation.normalAction]}</span><span className="mx-2 text-zinc-600">→</span><b className="text-emerald-300">{DEVIATION_ACTION_NAMES[deviation.deviationAction]}</b></p></div>
                <b className="whitespace-nowrap rounded-lg bg-emerald-400/10 px-2.5 py-1 text-sm text-emerald-300">{threshold(deviation)}</b>
              </div>
              <p className="mt-2 text-[.7rem] text-zinc-500">{context(deviation)} · {evPriority(deviation).label}</p>
            </article>
          ))}
          {visibleMobileRows < rows.length && <Button className="mt-3 w-full" onClick={() => setVisibleMobileRows((count) => Math.min(rows.length, count + 20))}>Show next {Math.min(20, rows.length - visibleMobileRows)} deviations</Button>}
        </div>
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="text-zinc-500">
            <tr>
              {[
                "Player Hand",
                "Dealer Card",
                "Index",
                "Basic Strategy",
                "Deviation",
                "EV Priority",
                "Context",
              ].map((x) => (
                <th className="pb-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr className="border-t border-white/[.06]" key={d.id}>
                <td className="py-4">{d.hand}</td>
                <td>{d.dealer}</td>
                <td className="text-emerald-400">
                  {threshold(d)}
                </td>
                <td>{DEVIATION_ACTION_NAMES[d.normalAction]}</td>
                <td>{DEVIATION_ACTION_NAMES[d.deviationAction]}</td>
                <td className="text-xs text-zinc-400">{evPriority(d).label}</td>
                <td className="text-xs text-zinc-500">{context(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="py-10 text-center text-sm text-zinc-500">No deviations match that search.</p>}
      </Panel>
    </>
  );
}
