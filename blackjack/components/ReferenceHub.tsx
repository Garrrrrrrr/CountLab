"use client";

import Link from "next/link";
import { Panel } from "@/components/ui";

const REFERENCES = [
  { name: "Basic strategy", href: "/reference/basic-strategy", icon: "fa-table-cells", description: "A rules-aware chart for hard totals, soft totals, and pairs.", action: "View basic strategy" },
  { name: "Index deviations", href: "/reference/deviations", icon: "fa-code-branch", description: "The same chart, with the Hi-Lo departures and their true-count indices shown directly in every relevant cell.", action: "View index deviations" },
] as const;

export default function ReferenceHub() {
  return <div className="mx-auto max-w-[90rem]">
    <div className="rounded-[1.75rem] border border-[var(--rule)] bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,.14),transparent_42%),var(--paper-raised)] p-5 sm:p-7"><p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--count-cold)]">Study desk</p><h1 className="font-display mt-2 text-3xl font-semibold tracking-[-.03em] sm:text-4xl">Reference, without the scavenger hunt.</h1><p className="mt-3 max-w-2xl text-[var(--ink-muted)]">Open the chart you need from here. Both basic strategy and index deviations are first-class destinations, not hidden behind the search menu.</p></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{REFERENCES.map((reference) => <Link key={reference.href} href={reference.href} className="pressable surface group rounded-[1.5rem] p-5 hover:border-[var(--ink-muted)] sm:p-6"><span className="grid size-11 place-items-center rounded-xl border border-[var(--rule)] bg-[var(--paper)] text-[var(--count-cold)]"><i className={`fa-solid ${reference.icon}`} aria-hidden="true" /></span><h2 className="font-display mt-5 text-2xl font-semibold">{reference.name}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{reference.description}</p><span className="mt-6 inline-block text-sm font-semibold text-emerald-400">{reference.action} <i className="fa-solid fa-arrow-right ml-1 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span></Link>)}</div>
    <section className="mt-7" aria-labelledby="hilo-system"><div className="mb-3"><p className="font-data text-xs font-semibold uppercase tracking-[.16em] text-[var(--ink-muted)]">Hi-Lo essentials</p><h2 id="hilo-system" className="font-display mt-1 text-xl font-semibold">The count underneath the charts</h2></div><div className="grid gap-3 md:grid-cols-3">{[["+1", "2 · 3 · 4 · 5 · 6", "Low cards"], ["0", "7 · 8 · 9", "Neutral cards"], ["−1", "10 · J · Q · K · A", "High cards"]].map(([value, cards, label]) => <Panel key={value} className="text-center"><p className={`font-data text-4xl font-bold ${value === "+1" ? "text-emerald-400" : value === "−1" ? "text-red-400" : "text-[var(--ink)]"}`}>{value}</p><p className="mt-4 font-data text-lg tracking-wide">{cards}</p><p className="mt-2 text-sm text-[var(--ink-muted)]">{label}</p></Panel>)}</div><p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--ink-muted)]">Keep a running count of exposed cards, estimate decks remaining, then divide to get the true count. Use an index only when that true count crosses the listed threshold.</p></section>
  </div>;
}
