"use client";

import { useMemo, useState } from "react";
import type { SimulatedShoe } from "@/lib/blackjack/shoeSimulation";
import { Button, Metric, Panel } from "./ui";
import { track } from "@/lib/analytics/track";

const money = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;

type SortMode = "profit" | "loss" | "maxTc";

export function ShoeExplorer({ shoes, onSelectShoe }: { shoes: SimulatedShoe[]; onSelectShoe: (index: number) => void }) {
  const [sortMode, setSortMode] = useState<SortMode>("profit");

  const totalProfit = shoes.reduce((sum, shoe) => sum + shoe.totalProfit, 0);
  const winningShoes = shoes.filter((shoe) => shoe.totalProfit > 0).length;

  const sorted = useMemo(() => {
    const withIndex = shoes.map((shoe, index) => ({ shoe, index }));
    if (sortMode === "profit") return withIndex.sort((a, b) => b.shoe.totalProfit - a.shoe.totalProfit);
    if (sortMode === "loss") return withIndex.sort((a, b) => a.shoe.totalProfit - b.shoe.totalProfit);
    return withIndex.sort((a, b) => b.shoe.tcMax - a.shoe.tcMax);
  }, [shoes, sortMode]);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Shoe Explorer</h2>
          <p className="mt-1 text-xs text-zinc-500">Every shoe played during this run, with drill-down to every hand.</p>
        </div>
        <div className="flex gap-2 text-xs">
          {(["profit", "loss", "maxTc"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`min-h-11 rounded-lg border px-3 py-1.5 font-semibold ${sortMode === mode ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300" : "border-white/[.08] text-zinc-400 hover:bg-white/[.05]"}`}
            >
              {mode === "profit" ? "Profit" : mode === "loss" ? "Loss" : "Max TC"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total shoes" value={shoes.length} />
        <Metric label="Total profit" value={money(totalProfit)} />
        <Metric label="Avg profit / shoe" value={money(shoes.length ? totalProfit / shoes.length : 0)} />
        <Metric label="Win rate" value={percent(shoes.length ? winningShoes / shoes.length : 0)} />
      </div>

      <div className="mt-5 grid gap-3 sm:hidden">
        {sorted.map(({ shoe, index }) => <button key={shoe.shoeNumber} type="button" onClick={() => { track("shoe_viewed", { shoeNumber: shoe.shoeNumber, totalProfit: shoe.totalProfit, totalHands: shoe.totalHands }); onSelectShoe(index); }} className="rounded-xl border border-white/[.07] bg-black/20 p-4 text-left hover:bg-white/[.05]">
          <div className="flex items-center justify-between gap-3"><b>#{shoe.shoeNumber}</b><span className={shoe.totalProfit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>{shoe.totalProfit >= 0 ? "+" : ""}{money(shoe.totalProfit, 2)}</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500"><span>{shoe.totalHands} hands</span><span>TC {shoe.tcMin.toFixed(1)}</span><span>TC {shoe.tcMax.toFixed(1)}</span></div>
          <span className="mt-3 block text-sm font-semibold text-emerald-300">View hands <i className="fa-solid fa-arrow-right ml-1" aria-hidden="true" /></span>
        </button>)}
      </div>
      <div className="mt-5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="pb-3">Shoe</th>
              <th>Hands</th>
              <th>Profit</th>
              <th>TC Min</th>
              <th>TC Max</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ shoe, index }) => (
              <tr key={shoe.shoeNumber} className="border-t border-white/[.06]">
                <td className="py-3 font-medium">#{shoe.shoeNumber}</td>
                <td>{shoe.totalHands}</td>
                <td className={shoe.totalProfit >= 0 ? "text-emerald-300" : "text-red-300"}>{shoe.totalProfit >= 0 ? "+" : ""}{money(shoe.totalProfit, 2)}</td>
                <td>{shoe.tcMin.toFixed(1)}</td>
                <td>{shoe.tcMax.toFixed(1)}</td>
                <td className="py-2 text-right">
                  <Button className="px-3 py-1.5 text-xs" onClick={() => { track("shoe_viewed", { shoeNumber: shoe.shoeNumber, totalProfit: shoe.totalProfit, totalHands: shoe.totalHands }); onSelectShoe(index); }}>View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
