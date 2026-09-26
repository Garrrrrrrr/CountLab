"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { storage } from "@/lib/statistics/storage";
import { PlayingCard } from "./PlayingCard";
import { BrandMark } from "./Brand";
import { hiLoValue, signed } from "@/lib/blackjack/hiLo";
import { RANKS, SUITS, type Card } from "@/lib/blackjack/types";
import { chartCell, CHART_DEALERS, type StrategyChartRules } from "@/lib/blackjack/strategyChart";
import { ACTION_LABEL, ACTION_STYLE } from "@/lib/blackjack/actionStyles";
import { H17_PRO_COEFFICIENTS, H17_PRO_METADATA } from "@/lib/blackjack/h17ProCoefficients";
import { TOOL_ROUTES } from "@/lib/routes";

/** A small deterministic shuffle, so the prerendered demo and the hydrated one agree. */
function shuffledDeck(seed: number): Card[] {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

const tagTone = (value: number) => value > 0 ? "bg-emerald-300 text-emerald-950" : value < 0 ? "bg-rose-300 text-rose-950" : "bg-white/20 text-white";

function CountDemo() {
  const [seed, setSeed] = useState(2026);
  const deck = useMemo(() => shuffledDeck(seed), [seed]);
  const [dealt, setDealt] = useState(4);
  const [hidden, setHidden] = useState(false);
  const seen = deck.slice(0, dealt);
  const count = seen.reduce((sum, card) => sum + hiLoValue(card), 0);
  const recent = seen.slice(-5);
  const last = seen.at(-1);
  const deal = () => setDealt((value) => Math.min(deck.length, value + 1));
  const reset = () => { setSeed((value) => value + 1); setDealt(1); };
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-emerald-950/30 bg-[radial-gradient(ellipse_at_50%_-10%,#23905f_0%,#0d5537_45%,#083a26_100%)] p-5 text-white shadow-[0_30px_80px_-20px_rgba(6,40,26,.55)] sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.02)_0_1px,transparent_1px_4px)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="font-data text-[.7rem] font-semibold uppercase tracking-[.2em] text-emerald-100/80">Count along · Hi-Lo</p>
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 font-data text-[.7rem] text-emerald-50/80">{dealt} / 52 cards</span>
        </div>
        <ol aria-label="Most recent cards" className="mt-6 flex min-h-[7.5rem] items-end gap-2 sm:gap-3">
          {recent.map((card, index) => {
            const value = hiLoValue(card);
            const newest = index === recent.length - 1;
            return (
              <li key={`${seed}-${dealt - recent.length + index}`} className={`flex flex-col items-center gap-2 ${newest ? "" : "opacity-80"}`}>
                <div className={newest ? "motion-safe:animate-[deal_.35s_ease-out]" : ""}><PlayingCard card={card} size="sm" /></div>
                <span aria-hidden={hidden} className={`min-w-9 rounded-full px-2 py-0.5 text-center font-data text-xs font-bold transition-opacity ${hidden ? "opacity-0" : ""} ${tagTone(value)}`}>{signed(value)}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.14em] text-emerald-100/70">Running count</p>
            <p className="mt-1 font-data text-5xl font-semibold tabular-nums tracking-tight" aria-live="polite" aria-atomic="true">
              {hidden ? <span className="text-emerald-100/40" aria-label="Hidden">?</span> : signed(count)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setHidden((value) => !value)} className="pressable min-h-11 rounded-xl border border-white/20 bg-black/15 px-4 text-sm font-semibold hover:bg-black/25">{hidden ? "Reveal count" : "Quiz me"}</button>
            {dealt < deck.length
              ? <button type="button" onClick={deal} className="pressable min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">Deal next card</button>
              : <button type="button" onClick={reset} className="pressable min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">Shuffle up</button>}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{last ? `Dealt ${last.rank} of ${last.suit}.${hidden ? "" : ` Running count ${signed(count)}.`}` : ""}</p>
        <p className="mt-4 text-xs leading-5 text-emerald-50/70">{hidden ? "Keep the count in your head, deal a few cards, then reveal it to check." : "Low cards (2–6) add one, high cards (10–A) subtract one, 7–9 are neutral. A full deck always counts back to zero."}</p>
      </div>
    </div>
  );
}

const CHART_RULES: StrategyChartRules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late", doubleRule: "any", europeanNoHoleCard: false };
const PREVIEW_ROWS = ["16", "15", "13", "12", "11", "10"] as const;

function ChartPreview() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-center text-xs">
        <caption className="sr-only">Basic strategy preview for hard totals, six decks, dealer hits soft 17</caption>
        <thead>
          <tr><th scope="col" className="w-10 text-left font-semibold text-[var(--ink-muted)]">Hand</th>{CHART_DEALERS.map((dealer) => <th key={dealer} scope="col" className="font-semibold text-[var(--ink-muted)]">{dealer}</th>)}</tr>
        </thead>
        <tbody>
          {PREVIEW_ROWS.map((row) => (
            <tr key={row}>
              <th scope="row" className="text-left font-semibold">{row}</th>
              {CHART_DEALERS.map((dealer) => {
                const cell = chartCell(CHART_RULES, "hard", row, dealer, { canSurrender: false });
                return <td key={dealer} aria-label={`${row} against ${dealer}: ${ACTION_LABEL[cell.action]}`} className={`h-7 rounded border font-bold ${ACTION_STYLE[cell.action]}`}>{cell.action}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PATH = [
  { step: "01", title: "Learn the count", body: "Keep the running count through realistic card groups, then convert it to a true count.", links: [["Running Count", "/training/running-count?session=starter"], ["True Count", "/training/true-count"], ["Deck Estimation", "/training/deck-estimation"]] },
  { step: "02", title: "Make the right play", body: "Turn basic strategy into reflex, then learn when the count changes the decision.", links: [["Basic Strategy", "/training/basic-strategy"], ["Deviations", "/training/deviations"], ["H17 Chart", "/training/h17-chart"]] },
  { step: "03", title: "Put it together", body: "Count, bet, and play a whole shoe with coaching, then prove it in a timed exam.", links: [["Full Shoe", "/training/full-shoe"], ["Test Out", "/training/test-out"]] },
  { step: "04", title: "Size your bets", body: "Build a bet ramp for a real game and see its edge, variance, and risk of ruin.", links: [["Game & Bankroll Lab", "/cvcx"], ["Bet Spread Recommender", "/bet-spread-recommender"], ["Session Simulator", "/simulation"]] },
] as const;

const GAMES = [
  { name: "Double Down Madness", href: "/double-down-madness", icon: "fa-bolt", tone: "text-[var(--warning)] bg-amber-400/10", body: "One-card blackjack with repeated doubles, played through a live six-deck shoe with Hi-Lo coaching." },
  { name: "Ultimate Texas Hold'em", href: "/ultimate-texas-holdem", icon: "fa-clover", tone: "text-[var(--accent)] bg-emerald-400/10", body: "Learn when to raise, check, or fold, and compare standard play with exposed-card analysis." },
  { name: "Chase the Flush", href: "/chase-flush", icon: "fa-diamond", tone: "text-[var(--info)] bg-sky-400/10", body: "Three betting stages, a chip-based table, and an exact analyzer for one exposed dealer card." },
] as const;

export function HomePage() {
  const { user, guest, continueAsGuest } = useAuth();
  const [returning, setReturning] = useState(false);
  useEffect(() => { setReturning(storage.sessions().length > 0); }, []);
  const enter = () => { if (!user) continueAsGuest(); };
  const rounds = `${(H17_PRO_METADATA.totalRounds / 1e9).toFixed(1)}B`;
  const stats = [
    [rounds, "simulated rounds behind every EV and risk figure"],
    [String(Object.keys(H17_PRO_COEFFICIENTS).length), "audited deck and penetration profiles"],
    [String(TOOL_ROUTES.filter((route) => route[3] === "Practice").length), "focused drills, from first card to timed exam"],
    [String(GAMES.length), "casino table games with their own analyzers"],
  ] as const;
  return (
    <div className="mx-auto max-w-6xl">
      {(user || guest) && returning && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-400/[.07] px-4 py-3 text-sm">
          <p><b>Welcome back.</b> <span className="text-[var(--ink-muted)]">Your streak, accuracy, and next recommended drill are on the dashboard.</span></p>
          <Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg bg-[var(--ink)] px-4 font-semibold text-[var(--paper)]">Open dashboard →</Link>
        </div>
      )}
      <section className="grid items-center gap-10 py-4 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-10">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--paper-raised)] py-1 pl-1 pr-3 font-data text-[.68rem] font-semibold uppercase tracking-[.16em] text-[var(--accent)]"><BrandMark size="sm" />Hi-Lo · Strategy · Bankroll</p>
          <h1 className="mt-6 max-w-2xl font-display text-4xl font-semibold sm:text-6xl">Build the skills.<br /><span className="text-[var(--accent)]">Understand the numbers.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ink-muted)]">Practice card counting and blackjack decisions until they are automatic, then see how your game and bet spread shape expected results and bankroll risk.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/training/running-count?session=starter" onClick={enter} className="pressable inline-flex min-h-12 items-center rounded-xl bg-[var(--ink)] px-5 font-semibold text-[var(--paper)] shadow-lg hover:opacity-90">Try a counting drill →</Link>
            <Link href="/reference" className="pressable inline-flex min-h-12 items-center rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] px-5 font-semibold hover:border-[var(--ink-muted)]">Explore strategy charts</Link>
          </div>
          <p className="mt-4 text-sm text-[var(--ink-muted)]"><i className="fa-solid fa-circle-check mr-1.5 text-[var(--accent)]" aria-hidden="true" />Free, no sign-up. Guest progress stays on this device; an account adds backup and sync.</p>
        </div>
        <CountDemo />
      </section>

      <section aria-label="CountLab by the numbers" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)] lg:grid-cols-4">
        {stats.map(([value, label]) => <div key={label} className="bg-[var(--paper-raised)] p-5"><p className="font-data text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p><p className="mt-1 text-sm leading-5 text-[var(--ink-muted)]">{label}</p></div>)}
      </section>

      <section className="mt-20" aria-labelledby="path-heading">
        <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">A path, not a pile of tools</p>
        <h2 id="path-heading" className="mt-2 font-display text-3xl font-semibold tracking-[-.02em] sm:text-4xl">From the first card to a full shoe.</h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-muted)]">Each skill builds on the last. Start where you are; every drill keeps its own history so you can see what needs work.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PATH.map((stage) => (
            <li key={stage.step} className="surface flex flex-col rounded-2xl p-5">
              <span className="font-data text-sm font-semibold text-[var(--accent)]">{stage.step}</span>
              <h3 className="mt-3 text-lg font-semibold">{stage.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{stage.body}</p>
              <ul className="mt-auto flex flex-wrap gap-2 pt-5">
                {stage.links.map(([label, href]) => <li key={href}><Link href={href} onClick={enter} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 text-xs font-semibold hover:border-[var(--ink-muted)]">{label}</Link></li>)}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20 grid gap-6 lg:grid-cols-2" aria-label="Reference and analysis">
        <div className="surface flex min-w-0 flex-col rounded-3xl p-6 sm:p-8">
          <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Reference</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-.02em]">Strategy charts for your exact rules.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Change decks, soft 17, doubling, and surrender, and every cell updates. Index plays sit right on the grid. Free to read and print.</p>
          <div className="mt-6 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-3">
            <ChartPreview />
            <p className="mt-2 px-1 text-[.7rem] text-[var(--ink-muted)]">Hard totals · 6 decks · H17 · DAS</p>
          </div>
          <Link href="/reference" className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline">Open the full charts <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
        </div>
        <div className="surface flex min-w-0 flex-col rounded-3xl p-6 sm:p-8">
          <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Analysis</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-.02em]">Know what your spread is worth, and what it risks.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">Every figure comes from audited per-true-count simulation data, labelled with the exact rules it covers. Nothing is extrapolated to games the data does not describe.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["fa-chart-area", "Edge and hourly EV", "For any ramp, wong-in point, and penetration."],
              ["fa-scale-balanced", "Risk of ruin", "Lifetime and trip-length, with the bankroll it implies."],
              ["fa-wave-square", "Session simulation", "Card-by-card shoes or a fast approximation."],
              ["fa-book", "Session journal", "Compare real results with the EV you actually played."],
            ].map(([icon, title, body]) => <li key={title} className="flex gap-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-400/10 text-[var(--info)]"><i className={`fa-solid ${icon} text-xs`} aria-hidden="true" /></span><span><b className="block text-sm">{title}</b><span className="text-xs leading-5 text-[var(--ink-muted)]">{body}</span></span></li>)}
          </ul>
          <Link href="/analyze" className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm font-semibold text-[var(--accent)] hover:underline">See the analysis tools <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="games-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-data text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Beyond blackjack</p>
            <h2 id="games-heading" className="mt-2 font-display text-3xl font-semibold tracking-[-.02em]">Study the carnival games too.</h2>
          </div>
          <Link href="/play" className="text-sm font-semibold text-[var(--accent)] hover:underline">All games →</Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {GAMES.map((game) => (
            <Link key={game.href} href={game.href} onClick={enter} className="pressable surface group flex flex-col rounded-2xl p-5 hover:border-[var(--ink-muted)]">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${game.tone}`}><i className={`fa-solid ${game.icon}`} aria-hidden="true" /></span>
              <h3 className="mt-4 text-lg font-semibold">{game.name}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{game.body}</p>
              <span className="mt-auto pt-4 text-sm font-semibold text-[var(--accent)]">Take a seat <i className="fa-solid fa-arrow-right ml-1 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-20 overflow-hidden rounded-3xl bg-[var(--ink)] p-8 text-[var(--paper)] sm:p-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-semibold tracking-[-.02em]">Twenty cards, about two minutes.</h2>
            <p className="mt-3 leading-7 opacity-80">The starter drill walks you through your first running count with a checkpoint every five cards. No account, no setup.</p>
          </div>
          <Link href="/training/running-count?session=starter" onClick={enter} className="pressable inline-flex min-h-12 items-center rounded-xl bg-[var(--paper)] px-6 font-semibold text-[var(--ink)] hover:opacity-90">Start the starter drill</Link>
        </div>
      </section>
    </div>
  );
}
