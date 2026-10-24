"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Camera, Check, Grid3x3, RotateCcw, ShieldCheck, SquareFunction, Target } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { CardRow } from "@/components/blackjack/PlayingCard";
import { TrayPhoto } from "@/components/blackjack/TrayPhoto";
import { ACTION_FILL } from "@/components/blackjack/actions";
import { hiLoValue } from "@/lib/blackjack/hiLo";
import { RANKS, SUITS, type Card } from "@/lib/blackjack/types";
import { trayPhotoFor } from "@/lib/blackjack/deckPhotos";
import { DEFAULT_TABLE_RULES, buildChart, cellKey, indexTag, signedCount, type Dealer } from "@/lib/strategy";

const randomCard = (): Card => ({ rank: RANKS[Math.floor(Math.random() * RANKS.length)], suit: SUITS[Math.floor(Math.random() * SUITS.length)] });

/** Six cards and three answers: the running count in ten seconds. */
function CountDemo() {
  const [round, setRound] = useState(0);
  const cards = useMemo(() => (round === 0
    ? [{ rank: "K", suit: "spades" }, { rank: "5", suit: "hearts" }, { rank: "3", suit: "clubs" }, { rank: "9", suit: "diamonds" }, { rank: "6", suit: "spades" }, { rank: "A", suit: "hearts" }] as Card[]
    : Array.from({ length: 6 }, randomCard)), [round]);
  const answer = cards.reduce((sum, card) => sum + hiLoValue(card), 0);
  const options = useMemo(() => {
    const set = new Set([answer]);
    for (const delta of [-2, 1, 2, -1, 3]) { if (set.size === 3) break; set.add(answer + delta); }
    return [...set].sort((a, b) => a - b);
  }, [answer]);
  const [picked, setPicked] = useState<number | null>(null);
  const deal = () => { setRound((value) => value + 1); setPicked(null); };
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-felt p-5 text-white shadow-2 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white/80">Try it: what&rsquo;s the running count?</p>
        <span className="rounded-full bg-black/25 px-2.5 py-1 font-mono text-[0.6875rem] text-white/70">Hi-Lo</span>
      </div>
      <CardRow key={round} cards={cards} size="lg" overlap={0.5} className="mt-5 justify-center [--card-w:58px] sm:[--card-w:76px]" animate label="Six dealt cards" />
      <div className="mt-6 grid grid-cols-3 gap-2" role="group" aria-label="Pick the running count">
        {options.map((option) => {
          const state = picked === null ? "idle" : option === answer ? "right" : option === picked ? "wrong" : "idle";
          return (
            <button key={option} type="button" disabled={picked !== null} onClick={() => setPicked(option)}
              className={cx("h-12 rounded-xl font-mono text-lg font-semibold transition",
                state === "right" ? "bg-pos text-white" : state === "wrong" ? "bg-neg text-white" : "bg-white/10 hover:bg-white/20 disabled:opacity-60")}>
              {signedCount(option)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 min-h-[3.25rem]" aria-live="polite">
        {picked !== null && (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-5 text-white/80">
              <span className="font-semibold text-white">{picked === answer ? "Right." : `It's ${signedCount(answer)}.`}</span>{" "}
              2–6 count +1, 7–9 count 0, tens and aces count −1.
            </p>
            <button type="button" onClick={deal} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-semibold hover:bg-white/25">
              <RotateCcw size={15} aria-hidden /> Deal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A corner of the real chart, drawn by the same engine as the charts page. */
function ChartPreview() {
  const chart = useMemo(() => buildChart(DEFAULT_TABLE_RULES), []);
  const rows = ["16", "15", "12"];
  const dealers: Dealer[] = ["4", "5", "6", "9", "10", "A"];
  return (
    <div className="grid grid-cols-[1.75rem_repeat(6,minmax(0,1fr))] gap-1" aria-hidden>
      <span />
      {dealers.map((dealer) => <span key={dealer} className="text-center text-[0.6875rem] font-semibold text-ink-3">{dealer}</span>)}
      {rows.map((row) => (
        <div key={row} className="contents">
          <span className="self-center font-mono text-[0.6875rem] font-semibold text-ink-3">{row}</span>
          {dealers.map((dealer) => {
            const cell = chart.tables.hard.cells.get(cellKey({ section: "hard", row, dealer }))!;
            return (
              <span key={dealer} className={cx("relative flex h-8 items-start justify-center overflow-hidden rounded-md pt-1 text-xs font-bold", ACTION_FILL[cell.basic.action])}>
                {cell.basic.action}
                {cell.index && <span className={cx("absolute inset-x-0 bottom-0 text-center text-[0.5625rem] leading-3", ACTION_FILL[cell.index.play])}>{indexTag(cell.index).split(" ")[1]}</span>}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  { href: "/train", icon: Target, title: "Train", body: "Running count, deck estimation and true count with real tray photos; basic strategy, index plays and chart recall; then a full shoe, coached or as a graded checkout." },
  { href: "/charts", icon: Grid3x3, title: "Charts", body: "Basic strategy and every Hi-Lo index for your exact rules: 1–8 decks, H17 or S17, double after split, late, early-vs-10 or no surrender." },
  { href: "/calculator", icon: SquareFunction, title: "Calculator", body: "Expected win per hour, swings, risk of ruin and the bankroll your bet ramp needs, from audited simulation data." },
  { href: "/journal", icon: BookOpen, title: "Journal", body: "Log sessions and bankroll moves in seconds, then see how your results compare with what the game should pay." },
];

const STEPS = [
  { title: "Count", body: "Keep the running count through single cards, pairs and full rounds." },
  { title: "Convert", body: "Read the discard tray, estimate decks left and divide for the true count." },
  { title: "Play", body: "Make basic strategy automatic, then learn where the count changes it." },
  { title: "Prove it", body: "Run a full shoe as a silent checkout, graded at the end like a test." },
];

export function HomePage() {
  const photo = trayPhotoFor(2.5);
  return (
    <div className="space-y-16 pb-6 sm:space-y-24">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:pt-6">
        <div>
          <p className="eyebrow text-brand-text">Hi-Lo trainer · strategy charts · bankroll tools</p>
          <h1 className="mt-3 text-[2.375rem] leading-[1.05] tracking-tight sm:text-6xl">Train the count.<br />Trust the chart.</h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-7 text-ink-2">
            Drills built on real discard-tray photos, strategy and index charts for your exact table rules, a bankroll calculator and a session journal. Free, and made for your phone.
          </p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <ButtonLink href="/train" size="lg" trailing={<ArrowRight size={18} aria-hidden />}>Start training</ButtonLink>
            <ButtonLink href="/charts" size="lg" variant="secondary">Open the charts</ButtonLink>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-3"><Check size={16} className="text-pos" aria-hidden /> No sign-up needed. An account only adds backup and sync.</p>
        </div>
        <CountDemo />
      </section>

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="text-2xl sm:text-3xl">Everything a counter needs, in one place</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ href, icon: Icon, title, body }) => (
            <li key={href}>
              <Link href={href} className="card group flex h-full flex-col p-5 transition hover:border-line-strong">
                <span className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand-text"><Icon size={20} aria-hidden /></span>
                  <span className="text-lg font-semibold">{title}</span>
                  <ArrowRight size={18} className="ml-auto text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                </span>
                <span className="mt-3 text-[0.9375rem] leading-6 text-ink-2">{body}</span>
                {title === "Charts" && <span className="mt-4 block max-w-xs"><ChartPreview /></span>}
                {title === "Train" && photo && (
                  <span className="mt-4 flex items-center gap-3">
                    <TrayPhoto photo={photo} width={64} zoomable={false} label="Example discard tray" />
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink-3"><Camera size={15} aria-hidden /> 71 real photos, from half a deck to seven and a half</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="path-heading">
        <h2 id="path-heading" className="text-2xl sm:text-3xl">A path from first count to casino-ready</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-bg">{index + 1}</span>
              <p className="mt-3 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card grid gap-6 overflow-hidden p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-pos/15 text-pos"><ShieldCheck size={28} aria-hidden /></span>
        <div>
          <h2 className="text-xl sm:text-2xl">Charts you can check</h2>
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-7 text-ink-2">
            Basic strategy is checked cell by cell against an exact finite-deck calculation for 1, 2, 4, 6 and 8 decks under every rule combination. Every index number is Stanford Wong&rsquo;s, from <i>Professional Blackjack</i>: his one-deck and multiple-deck tables, his surrender, insurance and no-hole-card tables, each cell naming the table it comes from. The drills and the full shoe grade against the same engine, so nothing on the site disagrees.
          </p>
          <Link href="/charts" className="mt-3 inline-flex items-center gap-1.5 font-semibold text-brand-text">See the chart for your rules <ArrowRight size={16} aria-hidden /></Link>
        </div>
      </section>

      <section className="text-center">
        <h2 className="text-2xl sm:text-3xl">Ten minutes a day is enough to start.</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-2">Begin with the running count. The rest of the path opens up from there.</p>
        <div className="mt-6 flex justify-center"><ButtonLink href="/train/running-count" size="lg" trailing={<ArrowRight size={18} aria-hidden />}>Start with the running count</ButtonLink></div>
      </section>
    </div>
  );
}
