"use client";

import Link from "next/link";
import { CertificationStatus } from "./CertificationStatus";

type Drill = { name: string; href: string; icon: string; description: string; featured?: boolean };

const LANES: Array<{ title: string; description: string; icon: string; drills: Drill[] }> = [
  { title: "Count with confidence", description: "Build speed first, then make the count usable at the table.", icon: "fa-calculator", drills: [
    { name: "Running Count", href: "/training/running-count", icon: "fa-bolt", description: "Keep the Hi-Lo running count through a stream of cards." },
    { name: "True Count", href: "/training/true-count", icon: "fa-divide", description: "Convert the running count with the decks remaining." },
    { name: "Deck Estimation", href: "/training/deck-estimation", icon: "fa-ruler", description: "Estimate penetration before you divide." },
    { name: "Counting Benchmark", href: "/training/benchmark", icon: "fa-medal", description: "Measure speed and accuracy under a consistent test." },
  ] },
  { title: "Make the right play", description: "Learn the decision, then pressure-test it hand by hand.", icon: "fa-table-cells", drills: [
    { name: "Basic Strategy", href: "/training/basic-strategy", icon: "fa-layer-group", description: "Turn every standard blackjack decision into reflex." },
    { name: "Index Deviations", href: "/training/deviations", icon: "fa-code-branch", description: "Know when the true count changes the basic play." },
    { name: "H17 Chart", href: "/training/h17-chart", icon: "fa-table-cells", description: "Recall the full H17 chart against the clock." },
  ] },
  { title: "Put it together", description: "Practice the complete sequence instead of an isolated skill.", icon: "fa-shoe-prints", drills: [
    { name: "Full Shoe", href: "/training/full-shoe", icon: "fa-shoe-prints", description: "Count, bet, play basic strategy, and use indices in one live shoe.", featured: true },
    { name: "Test Out", href: "/training/test-out", icon: "fa-award", description: "A timed exam across every skill, scored section by section." },
    { name: "Daily Checklist", href: "/training/checklist", icon: "fa-list-check", description: "Follow a focused routine and keep your momentum." },
  ] },
];

function DrillCard({ drill }: { drill: Drill }) {
  return <Link href={drill.href} className={`pressable group flex min-h-36 flex-col rounded-2xl border p-4 transition-colors sm:p-5 ${drill.featured ? "border-emerald-400/35 bg-emerald-400/[.08] hover:bg-emerald-400/[.13]" : "surface hover:border-[var(--ink-muted)]"}`}>
    <span className={`grid size-10 place-items-center rounded-xl ${drill.featured ? "bg-emerald-300 text-emerald-950" : "border border-[var(--rule)] bg-[var(--paper)] text-[var(--count-cold)]"}`}><i className={`fa-solid ${drill.icon}`} aria-hidden="true" /></span>
    <h3 className="mt-4 font-display text-lg font-semibold text-[var(--ink)]">{drill.name}</h3>
    <p className="mt-1 text-sm leading-5 text-[var(--ink-muted)]">{drill.description}</p>
    <span className="mt-auto pt-4 text-sm font-semibold text-emerald-400">Open drill <i className="fa-solid fa-arrow-right ml-1 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
  </Link>;
}

export default function PracticeHub() {
  return <div className="mx-auto max-w-[90rem]">
    <div className="grid gap-5 rounded-[1.75rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,.16),transparent_42%),var(--paper-raised)] p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
      <div><p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-emerald-400">Training room</p><h1 className="font-display mt-2 text-3xl font-semibold tracking-[-.03em] sm:text-4xl">Practice one skill at a time.</h1><p className="mt-3 max-w-2xl text-[var(--ink-muted)]">Pick the skill you want to sharpen, then move to a full shoe when you are ready to combine them. Charts live in Reference; drills are for recall.</p></div>
      <Link href="/training/full-shoe" className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 font-semibold text-emerald-950 hover:bg-emerald-200"><i className="fa-solid fa-play" aria-hidden="true" />Start a full shoe</Link>
    </div>
    <div className="mt-7 space-y-8">{LANES.map((lane) => <section key={lane.title} aria-labelledby={lane.title.replaceAll(" ", "-").toLowerCase()}>
      <div className="mb-3 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border border-[var(--rule)] text-[var(--count-cold)]"><i className={`fa-solid ${lane.icon}`} aria-hidden="true" /></span><div><h2 id={lane.title.replaceAll(" ", "-").toLowerCase()} className="font-display text-xl font-semibold">{lane.title}</h2><p className="text-sm text-[var(--ink-muted)]">{lane.description}</p></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{lane.drills.map((drill) => <DrillCard key={drill.href} drill={drill} />)}</div>
    </section>)}</div>
    <CertificationStatus />
  </div>;
}
