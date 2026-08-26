"use client";

import { useState } from "react";
import { DDMTableGame } from "@/components/DDMTableGame";
import { DDMEvCalculator } from "@/components/DDMEvCalculator";
import { GhostButton, Metric, Panel } from "@/components/ui";
import {
  ACTION_NAMES,
  BETTING_RAMP,
  formatUpcard,
  STRATEGY_TABLES,
  TOP_DEVIATIONS,
  UPCARDS,
  type DDMAction,
} from "@/lib/ddm/engine";

type Tab = "game" | "calculator" | "strategy" | "deviations" | "edge";

const tabLabels: Record<Tab, string> = {
  game: "Play Game",
  calculator: "EV Calculator",
  strategy: "Strategy",
  deviations: "Deviations",
  edge: "Edge & Spread",
};

function StrategyCell({ action }: { action: DDMAction }) {
  const tone = action === "D" ? "bg-amber-400/15 text-amber-200" : action === "S" ? "bg-sky-400/15 text-sky-200" : "bg-emerald-400/10 text-emerald-200";
  return <td className={`min-w-12 border border-white/[.06] px-3 py-2 text-center font-bold ${tone}`} title={ACTION_NAMES[action]}>{action}</td>;
}

function StrategyTable({ title, rows }: { title: string; rows: Record<number, string> }) {
  return (
    <Panel>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead><tr><th className="px-3 py-2 text-left text-zinc-500">Player</th>{UPCARDS.map((upcard) => <th key={upcard} className="px-3 py-2 text-center text-zinc-500">{formatUpcard(upcard)}</th>)}</tr></thead>
          <tbody>{Object.entries(rows).map(([row, actions]) => <tr key={row}><th className="border border-white/[.06] px-3 py-2 text-left">{row}</th>{actions.split("").map((action, index) => <StrategyCell key={`${row}-${UPCARDS[index]}`} action={action as DDMAction} />)}</tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function StrategyReference() {
  return (
    <div className="mt-5 space-y-4">
      <Panel className="border border-amber-400/15 bg-amber-400/[.025]">
        <h2 className="text-lg font-semibold">How to read the charts</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400"><b className="text-emerald-200">H</b> hit · <b className="text-sky-200">S</b> stand · <b className="text-amber-200">D</b> double. Use the first-card chart before the first draw, then hard or soft total after every additional card. A lone ace always doubles and receives exactly one final card under the strict ace rule.</p>
      </Panel>
      <StrategyTable title="First non-ace card" rows={STRATEGY_TABLES.first} />
      <StrategyTable title="Continued hard totals" rows={STRATEGY_TABLES.hard} />
      <StrategyTable title="Continued soft totals" rows={STRATEGY_TABLES.soft} />
    </div>
  );
}

function DeviationsReference() {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-400">Selected by whole-round EV gain</p><h2 className="mt-2 text-xl font-semibold">Top 18 Hi-Lo departures</h2></div><span className="text-xs text-zinc-500">TC is floored</span></div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-zinc-500"><tr><th className="pb-3">#</th><th className="pb-3">State</th><th className="pb-3">Index</th><th className="pb-3">Change</th></tr></thead>
            <tbody>{TOP_DEVIATIONS.map((item, index) => (
              <tr key={`${item.plane}-${item.row}-${item.upcard}`} className="border-t border-white/[.06]">
                <td className="py-3 text-zinc-600">{index + 1}</td>
                <td className="py-3">{item.plane === "first" ? "First card" : "Hard"} {item.row} vs {formatUpcard(item.upcard)}</td>
                <td className="py-3 font-semibold text-amber-200">TC {item.direction === 1 ? "≥" : "≤"} {item.threshold >= 0 ? "+" : ""}{item.threshold}</td>
                <td className="py-3">{ACTION_NAMES[item.baseAction]} → <b className="text-emerald-300">{ACTION_NAMES[item.action]}</b></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel className="border border-emerald-400/20">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Insurance</p>
          <p className="mt-3 text-3xl font-semibold">Take at TC +4</p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">Insurance supplied most of the measured index gain. The coach grades the decision before checking the dealer hole card.</p>
        </Panel>
        <Panel>
          <h2 className="font-semibold">Important distinction</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">“First 9” means your original one-card 9. “Hard 9” is a multi-card total. Those are different decision states because a one-card hand can draw into a two-card blackjack.</p>
        </Panel>
      </div>
    </div>
  );
}

function EdgeAndSpread() {
  const eors = [
    ["A", "−0.24360%"], ["2", "+0.17863%"], ["3", "+0.16890%"], ["4", "+0.20040%"], ["5", "+0.21609%"],
    ["6", "+0.20536%"], ["7", "+0.10304%"], ["8", "+0.02333%"], ["9", "−0.05991%"], ["T", "−0.19806%"],
  ];
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Hi-Lo betting correlation" value="0.9779" sub="Exact fresh-shoe EOR vector" />
        <Metric label="Exact chart house edge" value="0.8860%" sub="CSM / fresh composition" />
        <Metric label="Indexed ramp EV" value="+0.073899" sub="Units per round · one-deck cut" />
        <Metric label="Indexed N0" value="12,923" sub="1B-round benchmark" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="text-xl font-semibold">Recommended 1–16 ramp</h2>
          <div className="mt-4 space-y-2">{BETTING_RAMP.map((row) => <div key={row.label} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3 text-sm"><span className="text-zinc-400">{row.label}</span><b>{row.units} unit{row.units === 1 ? "" : "s"}</b></div>)}</div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Benchmark: Version 1, six decks, H17, one deck cut off, one occupied spot, exact deck estimation, insurance +4, and the 18 departures. At 100 rounds/hour it produced 7.390 units/hour with 84.006 units/hour SD.</p>
        </Panel>
        <Panel>
          <h2 className="text-xl font-semibold">Bankroll and penetration</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">The benchmark bankroll for 5% lifetime risk of ruin is about <b className="text-white">1,430 base units</b>. A $10 unit therefore implies roughly $14,300. The spread was approximately break-even with only two decks dealt; the attractive result needs much deeper penetration.</p>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">5 decks dealt</p><p className="mt-2 text-lg font-semibold">+0.073899</p><p className="text-xs text-zinc-600">EV / round</p></div><div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">3 decks dealt</p><p className="mt-2 text-lg font-semibold">+0.014826</p><p className="text-xs text-zinc-600">EV / round</p></div></div>
          <p className="mt-4 text-xs leading-5 text-amber-200/80">A continuous shuffler has no usable pre-deal count variation and remains a house game. Casino conditions, limits, speed, and tolerance of this spread are not modeled.</p>
        </Panel>
      </div>
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-400">Exact effects of removal</p><h2 className="mt-2 text-xl font-semibold">Why Hi-Lo is the practical choice</h2></div><span className="text-xs text-zinc-500">Positive = removal helps player</span></div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">{eors.map(([rank, eor]) => <div key={rank} className="rounded-xl bg-black/20 p-3 text-center"><b>{rank}</b><span className={`mt-1 block text-xs ${eor.startsWith("+") ? "text-emerald-300" : "text-red-300"}`}>{eor}</span></div>)}</div>
        <p className="mt-5 text-sm leading-6 text-zinc-400">Rounding these EORs to the simplest balanced level-1 tags produces Hi-Lo exactly. The custom level-6 DDM count raises betting correlation from 0.9779 to 0.9981, but reduced sampled N0 only 5.2% in matched five-billion-round no-index tests. Hi-Lo keeps nearly all the betting power at far lower mental cost.</p>
      </Panel>
    </div>
  );
}

export function DDMLab() {
  const [tab, setTab] = useState<Tab>("game");
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Countable casino game · exact strategy research</p><h1 className="mt-2 text-3xl font-semibold">Double Down Madness</h1><p data-mobile-compact-description className="mt-2 max-w-3xl text-zinc-400">Play the unusual one-card blackjack game through a persistent six-deck shoe while the coach monitors Hi-Lo, your 1–16 spread, insurance, strategy, and deviations.</p></div>
        <a className="min-h-11 text-sm text-emerald-400 hover:underline" href="https://wizardofodds.com/games/blackjack/double-down-madness/" target="_blank" rel="noreferrer">Wizard rules source ↗</a>
      </div>
      <div className="mobile-scroll-rail sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto border-y border-white/[.06] bg-[#0c100d]/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:mt-6 sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0" role="tablist">
        {(Object.keys(tabLabels) as Tab[]).map((item) => <GhostButton key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 whitespace-nowrap ${tab === item ? "border-emerald-400/60 bg-emerald-500/15" : ""}`}>{tabLabels[item]}</GhostButton>)}
      </div>
      {tab === "game" ? <DDMTableGame /> : tab === "calculator" ? <DDMEvCalculator /> : tab === "strategy" ? <StrategyReference /> : tab === "deviations" ? <DeviationsReference /> : <EdgeAndSpread />}
    </>
  );
}
