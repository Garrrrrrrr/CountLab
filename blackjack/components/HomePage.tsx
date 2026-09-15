"use client";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthProvider";

export function HomePage() {
  const { user, continueAsGuest } = useAuth();
  return <div className="mx-auto max-w-5xl">
    <section className="surface rounded-3xl p-6 sm:p-12">
      <p className="font-data text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">CountLab · Blackjack practice and analysis</p>
      <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold sm:text-6xl">Build the skills.<br />Understand the numbers.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--ink-muted)]">Practice card counting, learn strategy, and explore how your game and bet spread affect expected results and bankroll risk.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/training/running-count?session=starter" onClick={() => { if (!user) continueAsGuest(); }} className="inline-flex min-h-12 items-center rounded-xl bg-[var(--ink)] px-5 font-semibold text-[var(--paper)]">Try a counting drill →</Link>
        <Link href="/reference" className="inline-flex min-h-12 items-center rounded-xl border border-[var(--rule)] px-5 font-semibold">Explore strategy charts</Link>
      </div>
      <p className="mt-4 text-sm text-[var(--ink-muted)]">Free to try. Guest progress stays on this device; an account adds backup and sync.</p>
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="What you can do">
      {[
        ["01", "Practice", "/practice", "Start with one skill. Work through running count, true count, and strategy, then combine them in a full shoe."],
        ["02", "Analyze", "/analyze", "Build a game and bet ramp, examine variance, compare scenarios, and plan a trip with explicit assumptions."],
        ["03", "Play", "/play", "Study Double Down Madness, Ultimate Texas Hold'em, and Chase the Flush through tables and hand analyzers."],
      ].map(([number, title, href, description]) => <Link key={href} href={href} className="surface rounded-2xl p-6"><span className="font-data text-sm text-[var(--accent)]">{number}</span><h2 className="mt-3 text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{description}</p></Link>)}
    </section>
    <section className="mt-6 rounded-2xl border border-[var(--rule)] p-6"><h2 className="text-xl font-semibold">A first drill: Hi-Lo card values</h2><div className="mt-4 grid grid-cols-3 gap-4 text-center">{[["2–6", "+1"], ["7–9", "0"], ["10–A", "−1"]].map(([cards, count]) => <div key={cards}><p className="text-[var(--ink-muted)]">{cards}</p><p className="mt-2 font-data text-3xl font-semibold">{count}</p></div>)}</div><p className="mt-5 text-sm text-[var(--ink-muted)]">Add each card’s value as it appears. The running-count drill lets you practice this one step at a time.</p></section>
  </div>;
}
