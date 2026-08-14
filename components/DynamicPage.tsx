/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, GhostButton, Metric, Panel, Select } from "@/components/ui";
import {
  DeviationDrill,
  MissingCardDrill,
  StrategyDrill,
} from "@/components/Drills";
import {
  CountingBenchmark,
  DeckEstimationDrill,
  RunningCountDrill,
  TrueCountDrill,
} from "@/components/CountingDrills";
import { DEVIATION_ACTION_NAMES } from "@/lib/blackjack/deviations";
import {
  FAB_4_DEVIATIONS,
  FULL_HI_LO_DEVIATIONS,
  FullHiLoDeviation,
  ILLUSTRIOUS_18_DEVIATIONS,
} from "@/lib/blackjack/fullHiLoIndices";
import {
  DEFAULT_SETTINGS,
  Session,
  Settings,
  storage,
} from "@/lib/statistics/storage";
import { Action, BlackjackRules, Card, DEFAULT_RULES, Rank } from "@/lib/blackjack/types";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import { countingMastery } from "@/lib/blackjack/countingTraining";
import { CvcxLab } from "@/components/CvcxLab";
import { SessionSimulator } from "@/components/SessionSimulator";
import { ChaseFlushLab } from "@/components/ChaseFlushLab";
import { UTHLab } from "@/components/UTHLab";
const actionNames: Record<Action, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
  R: "Surrender",
};
function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  const totals = useMemo(() => {
    const q = sessions.reduce((a, s) => a + s.questions, 0),
      c = sessions.reduce((a, s) => a + s.correct, 0);
    return {
      q,
      avg: q ? Math.round((c / q) * 100) : 0,
      best: Math.max(0, ...sessions.map((s) => s.bestStreak)),
    };
  }, [sessions]);
  const drill = (name: string) => {
    const s = sessions.filter((x) => x.drill === name),
      q = s.reduce((a, x) => a + x.questions, 0);
    return q ? Math.round((s.reduce((a, x) => a + x.correct, 0) / q) * 100) : 0;
  };
  const drillLinks: Record<string, string> = {
    "Running Count": "/training/running-count",
    "True Count": "/training/true-count",
    "Basic Strategy": "/training/basic-strategy",
    Deviations: "/training/deviations",
    "Full Shoe": "/training/full-shoe",
    "Missing Card": "/training/missing-card",
    "Deck Estimation": "/training/deck-estimation",
    "Counting Benchmark": "/training/benchmark",
  };
  const practiced = Object.keys(drillLinks)
    .map((name) => ({
      name,
      accuracy: drill(name),
      attempts: sessions
        .filter((session) => session.drill === name)
        .reduce((sum, session) => sum + session.questions, 0),
    }))
    .filter((item) => item.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
  const focus = practiced[0];
  const primaryHref = focus ? drillLinks[focus.name] : "/training/full-shoe";
  const primaryLabel = focus ? `Practice ${focus.name}` : "Start a full shoe";
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
            Training overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-zinc-400">
            Build speed, accuracy, and confidence, one shoe at a time.
          </p>
        </div>
        <Link href={primaryHref}>
          <Button>
            {primaryLabel} <span className="ml-2">→</span>
          </Button>
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Sessions completed" value={sessions.length} />
        <Metric label="Questions answered" value={totals.q} />
        <Metric label="Overall accuracy" value={`${totals.avg}%`} />
        <Metric label="Best streak" value={totals.best} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Panel className="border border-emerald-400/15 bg-emerald-400/[.035]">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-400">Recommended next</p>
          <h2 className="mt-3 text-xl font-semibold">{focus ? `Strengthen ${focus.name}` : "Learn the complete workflow"}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {focus
              ? `${focus.accuracy}% accuracy across ${focus.attempts} answers makes this your clearest improvement opportunity.`
              : "Practice counting, betting, strategy, and deviations together in a realistic shoe."}
          </p>
          <Link href={primaryHref}><Button className="mt-5">{primaryLabel}</Button></Link>
        </Panel>
        <Panel>
          <h2 className="text-lg font-semibold">Analysis workspace</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Build a game, size the bankroll and ramp, then stress-test session variance without re-entering the same concepts across separate calculators.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/cvcx"><GhostButton>Build a game</GhostButton></Link>
            <Link href="/simulation"><GhostButton>Simulate sessions</GhostButton></Link>
          </div>
        </Panel>
      </div>
      <Panel className="mt-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent training</h2>
          <Link href="/statistics" className="text-sm text-emerald-400">
            View statistics
          </Link>
        </div>
        {sessions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  {[
                    "Drill",
                    "Questions",
                    "Accuracy",
                    "Average response",
                    "Date",
                  ].map((x) => (
                    <th className="pb-3 font-medium" key={x}>
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="border-t border-white/[.06]">
                    <td className="py-4 font-medium">{s.drill}</td>
                    <td>{s.questions}</td>
                    <td className="text-emerald-400">{s.accuracy}%</td>
                    <td>{(s.averageResponseTime / 1000).toFixed(1)}s</td>
                    <td className="text-zinc-500">
                      {new Date(s.date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-zinc-500">
            Your completed sessions will appear here.
          </div>
        )}
      </Panel>
    </>
  );
}
function HiLoReference() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Hi-Lo System</h1>
      <p className="mt-2 text-zinc-400">
        A balanced, level-one counting system.
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {[
          ["+1", "2  3  4  5  6", "Low cards"],
          ["0", "7  8  9", "Neutral cards"],
          ["−1", "10  J  Q  K  A", "High cards"],
        ].map(([v, r, l]) => (
          <Panel key={v} className="text-center">
            <span
              className={`text-4xl font-bold ${v === "+1" ? "text-emerald-400" : v === "−1" ? "text-red-400" : "text-zinc-300"}`}
            >
              {v}
            </span>
            <p className="my-5 text-2xl tracking-widest">{r}</p>
            <small className="text-zinc-500">{l}</small>
          </Panel>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {[
          [
            "Running Count",
            "Add each exposed card’s Hi-Lo value. RC = sum of all exposed values.",
          ],
          [
            "True Count",
            "Divide running count by estimated decks remaining. Apply the selected rounding rule.",
          ],
          [
            "Deck Estimation",
            "Estimate how many 52-card decks remain in the shoe, including fractional decks.",
          ],
          [
            "Index Deviations",
            "Change a basic-strategy play only when the true count crosses its published index.",
          ],
        ].map(([a, b]) => (
          <Panel key={a}>
            <h2 className="font-semibold">{a}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{b}</p>
          </Panel>
        ))}
      </div>
    </>
  );
}
const hardRows = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const dealers = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
function LegacyStrategyReference() {
  const decision = (t: number, d: string): Action =>
    t >= 17
      ? "S"
      : t >= 13
        ? Number(d) <= 6
          ? "S"
          : "H"
        : t === 12
          ? ["4", "5", "6"].includes(d)
            ? "S"
            : "H"
          : t === 11
            ? d === "A"
              ? "H"
              : "D"
            : t === 10
              ? Number(d) <= 9
                ? "D"
                : "H"
              : t === 9
                ? ["3", "4", "5", "6"].includes(d)
                  ? "D"
                  : "H"
                : "H";
  return (
    <>
      <h1 className="text-3xl font-semibold">Basic Strategy Reference</h1>
      <p className="mt-2 text-zinc-400">
        6-deck · H17 · DAS · RSA · Late surrender. Use the legend below for
        each action.
      </p>
      <Panel className="mt-7 overflow-x-auto">
        <p className="mb-3 text-xs text-zinc-500 md:hidden">Swipe horizontally to compare every dealer upcard.</p>
        <table className="w-full min-w-[700px] text-center text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#171c18] p-2 text-left text-zinc-500">Hard total</th>
              {dealers.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hardRows.map((t) => (
              <tr className="border-t border-white/[.05]" key={t}>
                <th className="sticky left-0 z-10 bg-[#171c18] p-3 text-left">{t}</th>
                {dealers.map((d) => {
                  const a = decision(t, d);
                  return (
                    <td key={d}>
                      <span
                        title={actionNames[a]}
                        className={`inline-grid h-8 w-8 place-items-center rounded ${a === "H" ? "bg-sky-500/20 text-sky-300" : a === "S" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}
                      >
                        {a}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex gap-4 text-xs text-zinc-400">
          {Object.entries(actionNames).map(([a, n]) => (
            <span key={a}>
              <b className="text-white">{a}</b> = {n}
            </span>
          ))}
        </div>
      </Panel>
    </>
  );
}
const strategyDealers: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "A",
];
const strategyCard = (rank: Rank, suit: Card["suit"] = "spades"): Card => ({
  rank,
  suit,
});
const hardStrategyHands: Array<{ label: string; cards: Card[] }> = [
  { label: "5", cards: [strategyCard("2"), strategyCard("3", "hearts")] },
  { label: "6", cards: [strategyCard("2"), strategyCard("4")] },
  { label: "7", cards: [strategyCard("3"), strategyCard("4")] },
  { label: "8", cards: [strategyCard("3"), strategyCard("5")] },
  { label: "9", cards: [strategyCard("4"), strategyCard("5")] },
  { label: "10", cards: [strategyCard("4"), strategyCard("6")] },
  { label: "11", cards: [strategyCard("5"), strategyCard("6")] },
  { label: "12", cards: [strategyCard("5"), strategyCard("7")] },
  { label: "13", cards: [strategyCard("6"), strategyCard("7")] },
  { label: "14", cards: [strategyCard("6"), strategyCard("8")] },
  { label: "15", cards: [strategyCard("7"), strategyCard("8")] },
  { label: "16", cards: [strategyCard("6"), strategyCard("10")] },
  { label: "17", cards: [strategyCard("7"), strategyCard("10")] },
  { label: "18", cards: [strategyCard("8"), strategyCard("10")] },
  { label: "19", cards: [strategyCard("9"), strategyCard("10")] },
  { label: "20", cards: [strategyCard("10"), strategyCard("K")] },
];
const softStrategyHands = (
  ["2", "3", "4", "5", "6", "7", "8", "9"] as Rank[]
).map((rank) => ({
  label: `A,${rank}`,
  cards: [strategyCard("A"), strategyCard(rank, "hearts")],
}));
const pairStrategyHands = (
  ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"] as Rank[]
).map((rank) => ({
  label: `${rank},${rank}`,
  cards: [strategyCard(rank), strategyCard(rank, "hearts")],
}));
const actionStyle: Record<Action, string> = {
  H: "bg-sky-500/20 text-sky-300",
  S: "bg-emerald-500/20 text-emerald-300",
  D: "bg-amber-500/20 text-amber-300",
  P: "bg-violet-500/20 text-violet-300",
  R: "bg-red-500/20 text-red-300",
};
function StrategyTable({
  title,
  hands,
  rules,
}: {
  title: string;
  hands: Array<{ label: string; cards: Card[] }>;
  rules: BlackjackRules;
}) {
  return (
    <Panel className="overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-zinc-500 md:hidden">Swipe horizontally to compare every dealer upcard.</p>
      <table className="w-full min-w-[700px] text-center text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[#171c18] p-2 text-left text-zinc-500">Player</th>
            {strategyDealers.map((dealer) => (
              <th className="p-2" key={dealer}>
                {dealer}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => (
            <tr className="border-t border-white/[.05]" key={hand.label}>
              <th className="sticky left-0 z-10 bg-[#171c18] p-3 text-left">{hand.label}</th>
              {strategyDealers.map((dealer) => {
                const action = getBasicStrategyDecision({
                  playerCards: hand.cards,
                  dealerUpcard: strategyCard(dealer),
                  rules,
                }).action;
                return (
                  <td className="p-1" key={dealer}>
                    <span
                      title={actionNames[action]}
                      className={`inline-grid h-8 w-8 place-items-center rounded font-semibold ${actionStyle[action]}`}
                    >
                      {action}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
function StrategyReference() {
  const [rules, setRules] = useState<BlackjackRules>(DEFAULT_RULES);
  useEffect(() => {
    const load = () => {
      const settings = storage.settings();
      setRules({
        decks: settings.decks,
        dealerHitsSoft17: settings.dealerHitsSoft17,
        doubleAfterSplit: settings.doubleAfterSplit,
        resplitAces: settings.resplitAces,
        lateSurrender: settings.lateSurrender,
        doubleRule: "any",
      });
    };
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  return (
    <>
      <h1 className="text-3xl font-semibold">Basic Strategy Reference</h1>
      <p className="mt-2 text-zinc-400">
        {rules.decks}-deck · {rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.resplitAces ? "RSA" : "No RSA"} · {rules.lateSurrender ? "Late surrender" : "No surrender"}. Every cell uses the same
        decision engine as the trainer.
      </p>
      <div className="mt-5 flex flex-wrap gap-3 text-xs">
        {(["H", "S", "D", "P", "R"] as Action[]).map((action) => (
          <span
            key={action}
            className={`rounded px-2 py-1 ${actionStyle[action]}`}
          >
            <b>{action}</b> = {actionNames[action]}
          </span>
        ))}
      </div>
      <div className="mt-7 space-y-5">
        <StrategyTable title="Hard totals" hands={hardStrategyHands} rules={rules} />
        <StrategyTable title="Soft totals" hands={softStrategyHands} rules={rules} />
        <StrategyTable title="Pairs & splits" hands={pairStrategyHands} rules={rules} />
      </div>
    </>
  );
}
function DeviationReference() {
  const [sort, setSort] = useState("index"),
    [search, setSearch] = useState(""),
    [set, setSet] = useState<"all" | "i18" | "fab4">("all");
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
      <p className="mt-2 text-zinc-400">
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
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["all", "All deviations", allRows.length],
              ["i18", "Illustrious 18", ILLUSTRIOUS_18_DEVIATIONS.length],
              ["fab4", "Fab 4", FAB_4_DEVIATIONS.length],
            ] as const).map(([value, label, count]) => (
              <label key={value} className={`pressable flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${set === value ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200" : "border-white/[.08] bg-black/20 text-zinc-400"}`}>
                <input type="radio" name="deviation-set" value={value} checked={set === value} onChange={() => setSet(value)} className="accent-emerald-400" />
                <span className="flex-1 font-medium">{label}</span>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{count}</span>
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
            onChange={(e) => setSort(e.target.value)}
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
        <div className="space-y-3 md:hidden">
          {rows.map((deviation) => (
            <article key={deviation.id} className="rounded-2xl bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs text-zinc-500">Player hand</p><b className="mt-1 block text-lg">{deviation.hand}</b></div>
                <div className="text-right"><p className="text-xs text-zinc-500">Dealer</p><b className="mt-1 block text-lg">{deviation.dealer}</b></div>
              </div>
              <div className="mt-4 rounded-xl bg-white/[.04] p-3">
                <p className="text-xs text-zinc-500">Deviation point</p>
                <b className="text-xl text-emerald-400">{threshold(deviation)}</b>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-zinc-500">Basic strategy</dt><dd className="mt-1 font-medium">{DEVIATION_ACTION_NAMES[deviation.normalAction]}</dd></div>
                <div className="text-right"><dt className="text-xs text-zinc-500">Deviation</dt><dd className="mt-1 font-medium text-emerald-300">{DEVIATION_ACTION_NAMES[deviation.deviationAction]}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-zinc-500">Context: {context(deviation)}</p>
              <p className="mt-1 text-xs text-zinc-500">EV priority: {evPriority(deviation).label}</p>
            </article>
          ))}
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
function Statistics() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.sessions());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  const chart = [...sessions]
    .reverse()
    .slice(-20)
    .map((s, i) => ({
      name: i + 1,
      accuracy: s.accuracy,
      response: Math.round(s.averageResponseTime / 100) / 10,
    }));
  const byDrill = Object.entries(
    sessions.reduce<Record<string, { total: number; correct: number }>>(
      (a, s) => {
        a[s.drill] ??= { total: 0, correct: 0 };
        a[s.drill].total += s.questions;
        a[s.drill].correct += s.correct;
        return a;
      },
      {},
    ),
  ).map(([name, v]) => ({
    name,
    accuracy: Math.round((v.correct / v.total) * 100),
  }));
  const byCategory = Object.entries(
    sessions.reduce<Record<string, { total: number; correct: number }>>(
      (all, session) => {
        for (const [category, result] of Object.entries(session.categories ?? {})) {
          const key = `${session.drill}: ${category}`;
          all[key] ??= { total: 0, correct: 0 };
          all[key].total += result.total;
          all[key].correct += result.correct;
        }
        return all;
      },
      {},
    ),
  )
    .map(([name, result]) => ({
      name,
      accuracy: Math.round((result.correct / result.total) * 100),
      total: result.total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const accuracySince = (days: number) => {
    const cutoff = Date.now() - days * 86400000;
    const recent = sessions.filter((session) => new Date(session.date).getTime() >= cutoff);
    const total = recent.reduce((sum, session) => sum + session.questions, 0);
    return total ? Math.round(recent.reduce((sum, session) => sum + session.correct, 0) / total * 100) : 0;
  };
  const counting = sessions.filter((session) => ["Running Count", "True Count", "Deck Estimation", "Full Shoe"].includes(session.drill));
  const numericMetric = (key: string) => counting.map((session) => Number(session.metrics?.[key])).filter(Number.isFinite);
  const cardSpeeds = numericMetric("cardsPerSecond"), deckErrors = numericMetric("meanAbsoluteDeckError"), mastery = countingMastery(sessions);
  const perfectShoes = counting.filter((session) => session.drill === "Full Shoe" && session.accuracy === 100).length;
  const errorCounts = Object.entries(counting.flatMap((session) => session.mistakes).reduce<Record<string, number>>((all, mistake) => {
    const key = mistake.category ?? "uncategorized";
    all[key] = (all[key] ?? 0) + 1;
    return all;
  }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h1 className="text-3xl font-semibold">Statistics</h1>
      <p className="mt-2 text-zinc-400">
        Persistent performance history across every training mode.
      </p>
      {sessions.length === 0 ? (
        <Panel className="mt-7 py-16 text-center">
          <p className="text-zinc-400">
            Complete a drill to start building your history.
          </p>
          <Link href="/training/running-count">
            <Button className="mt-5">Start a drill</Button>
          </Link>
        </Panel>
      ) : (
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-5">
            <Metric label="7-day accuracy" value={`${accuracySince(7)}%`} />
            <Metric label="30-day accuracy" value={`${accuracySince(30)}%`} />
            <Metric label="Best card speed" value={`${Math.max(0, ...cardSpeeds).toFixed(1)}/s`} />
            <Metric label="Latest deck MAE" value={`${(deckErrors[0] ?? 0).toFixed(2)} decks`} />
            <Metric label="Counting mastery" value={`${mastery.score}%`} sub={`${perfectShoes} perfect shoes`} />
          </div>
          <Panel>
            <h2 className="mb-5 font-semibold">Accuracy over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis domain={[0, 100]} stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#b5ed5c"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-5 font-semibold">Response time over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="response"
                    stroke="#38bdf8"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="lg:col-span-2">
            <h2 className="mb-5 font-semibold">Performance by drill</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDrill}>
                  <CartesianGrid stroke="#ffffff0d" />
                  <XAxis dataKey="name" stroke="#71717a" />
                  <YAxis domain={[0, 100]} stroke="#71717a" />
                  <Tooltip
                    contentStyle={{
                      background: "#111",
                      border: "1px solid #333",
                    }}
                  />
                  <Bar
                    dataKey="accuracy"
                    fill="#1e8f62"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          {byCategory.length > 0 && (
            <Panel className="lg:col-span-2">
              <h2 className="font-semibold">Accuracy by decision category</h2>
              <p className="mb-5 mt-1 text-sm text-zinc-500">
                Lowest-performing categories appear first.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {byCategory.map((row) => (
                  <div key={row.name} className="rounded-xl bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{row.name}</span>
                      <b>{row.accuracy}%</b>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-emerald-500" style={{ width: `${row.accuracy}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">{row.total} answers</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {errorCounts.length > 0 && <Panel className="lg:col-span-2"><h2 className="font-semibold">Counting error diagnosis</h2><p className="mb-4 mt-1 text-sm text-zinc-500">Use the most frequent error as the focus for the next spaced-practice session.</p><div className="flex flex-wrap gap-2">{errorCounts.map(([name, count]) => <span key={name} className="rounded-full bg-black/25 px-3 py-2 text-sm"><b className="text-amber-300">{count}</b> {name}</span>)}</div></Panel>}
          <section className="sr-only" aria-label="Statistics text summary">
            <h2>Performance summary</h2>
            <ul>
              {byDrill.map((row) => (
                <li key={row.name}>{row.name}: {row.accuracy}% accuracy</li>
              ))}
              {byCategory.map((row) => (
                <li key={row.name}>{row.name}: {row.accuracy}% across {row.total} answers</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS),
    [saved, setSaved] = useState(false),
    [dataMessage, setDataMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => setS(storage.settings()), []);
  const update = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };
  const preset = s.decks === 6 && s.dealerHitsSoft17 && s.doubleAfterSplit && s.resplitAces && s.lateSurrender
    ? "6d-h17"
    : s.decks === 6 && !s.dealerHitsSoft17 && s.doubleAfterSplit && s.resplitAces && s.lateSurrender
      ? "6d-s17"
      : s.decks === 8 && s.dealerHitsSoft17 && s.doubleAfterSplit && !s.resplitAces && !s.lateSurrender
        ? "8d-h17"
        : "custom";
  return (
    <>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-zinc-400">
        Defaults are saved locally on this device.
      </p>
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-5 font-semibold">Table rules</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Rule preset"
              className="sm:col-span-2"
              value={preset}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "custom") return;
                setS((current) => ({
                  ...current,
                  decks: value === "8d-h17" ? 8 : 6,
                  dealerHitsSoft17: value !== "6d-s17",
                  doubleAfterSplit: true,
                  resplitAces: value !== "8d-h17",
                  lateSurrender: value !== "8d-h17",
                }));
                setSaved(false);
              }}
            >
              <option value="6d-h17">6-deck H17 liberal</option>
              <option value="6d-s17">6-deck S17 liberal</option>
              <option value="8d-h17">8-deck H17 common</option>
              <option value="custom">Custom</option>
            </Select>
            <Select
              label="Default decks"
              value={s.decks}
              onChange={(e) => update("decks", +e.target.value)}
            >
              {[1, 2, 4, 6, 8].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Select
              label="Dealer"
              value={s.dealerHitsSoft17 ? "h17" : "s17"}
              onChange={(e) => update("dealerHitsSoft17", e.target.value === "h17")}
            >
              <option value="h17">Hit soft 17</option>
              <option value="s17">Stand soft 17</option>
            </Select>
            <Select
              label="True-count rounding"
              value={s.rounding}
              onChange={(e) =>
                update("rounding", e.target.value as Settings["rounding"])
              }
            >
              <option value="floor">Floor</option>
              <option value="truncate">Truncate</option>
              <option value="nearest">Nearest integer</option>
            </Select>
            <Select
              label="Animation speed"
              value={s.speed}
              onChange={(e) => update("speed", +e.target.value)}
            >
              {[1500, 1000, 750, 500, 300].map((x) => (
                <option key={x} value={x}>
                  {x} ms
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            {([
              ["doubleAfterSplit", "Double after split"],
              ["resplitAces", "Resplit aces"],
              ["lateSurrender", "Late surrender"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-lg bg-black/20 p-3">
                <input
                  type="checkbox"
                  checked={s[key]}
                  onChange={(e) => update(key, e.target.checked)}
                  className="h-5 w-5 accent-emerald-500"
                />
                {label}
              </label>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 font-semibold">Counting defaults</h2>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <b>Hi-Lo ✓</b>
            <p className="text-sm text-zinc-400">Balanced level-one system</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select label="Running-count preset" value={s.countingPreset} onChange={(e) => update("countingPreset", e.target.value as Settings["countingPreset"])}>
              <option value="one-deck-speed">One-deck speed</option>
              <option value="two-card-cancellation">Two-card cancellation</option>
              <option value="six-deck-casino">Six-deck casino</option>
              <option value="recovery">Interruption recovery</option>
            </Select>
            <Select label="Feedback timing" value={s.countingFeedback} onChange={(e) => update("countingFeedback", e.target.value as Settings["countingFeedback"])}>
              <option value="immediate">Immediate</option><option value="end">End of session</option>
            </Select>
            <Select label="Questions per session" value={s.countingSessionQuestions} onChange={(e) => update("countingSessionQuestions", +e.target.value as Settings["countingSessionQuestions"])}>
              {[5, 10, 20].map((value) => <option key={value}>{value}</option>)}
            </Select>
            <Select label="Default penetration" value={s.penetration} onChange={(e) => update("penetration", +e.target.value)}>
              {[0.5, 0.6, 0.7, 0.75, 0.8, 0.85].map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
            </Select>
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Floor rounds toward negative infinity: -1.2 becomes -2. Truncate rounds toward zero: -1.2 becomes -1. Pick the method that matches the indices you train.</p>
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">Experience</h2>
          {[
            ["sound", "Sound effects"],
            ["animations", "Card animations"],
            ["shortcuts", "Keyboard shortcuts"],
          ].map(([k, l]) => (
            <label
              key={k}
              className="flex items-center justify-between border-b border-white/[.06] py-3"
            >
              <span>{l}</span>
              <input
                type="checkbox"
                checked={Boolean(s[k as keyof Settings])}
                onChange={(e) =>
                  update(
                    k as "sound" | "animations" | "shortcuts",
                    e.target.checked,
                  )
                }
                className="h-5 w-5 accent-emerald-500"
              />
            </label>
          ))}
          <Button
            className="mt-5"
            onClick={() => {
              storage.saveSettings(s);
              setSaved(true);
            }}
          >
            {saved ? "Saved ✓" : "Save settings"}
          </Button>
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="font-semibold">Training data</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Download a portable JSON backup or restore one on this device.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <GhostButton
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([storage.exportData()], { type: "application/json" }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `countlab-backup-${new Date().toISOString().slice(0, 10)}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
                setDataMessage("Backup downloaded.");
              }}
            >
              Export history
            </GhostButton>
            <GhostButton onClick={() => importInput.current?.click()}>
              Import history
            </GhostButton>
            <input
              ref={importInput}
              className="hidden"
              type="file"
              accept="application/json,.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  storage.importData(await file.text());
                  setS(storage.settings());
                  setDataMessage(`Imported ${storage.sessions().length} sessions.`);
                } catch (error) {
                  setDataMessage(error instanceof Error ? error.message : "Import failed");
                }
                event.target.value = "";
              }}
            />
          </div>
          {dataMessage && (
            <p aria-live="polite" className="mt-3 text-sm text-emerald-300">
              {dataMessage}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
function NotFound() {
  return (
    <Panel className="py-20 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link href="/dashboard">
        <Button className="mt-5">Back to dashboard</Button>
      </Link>
    </Panel>
  );
}
export default function DynamicPage() {
  const p = useParams<{ slug?: string[] }>(),
    path = (p.slug || ["dashboard"]).join("/");
  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    cvcx: <CvcxLab />,
    simulation: <SessionSimulator />,
    analysis: <CvcxLab />,
    bankroll: <CvcxLab />,
    "chase-flush": <ChaseFlushLab />,
    "ultimate-texas-holdem": <UTHLab />,
    "training/running-count": <RunningCountDrill />,
    "training/true-count": <TrueCountDrill />,
    "training/basic-strategy": <StrategyDrill />,
    "training/deviations": <DeviationDrill />,
    "training/full-shoe": null,
    "training/missing-card": <MissingCardDrill />,
    "training/deck-estimation": <DeckEstimationDrill />,
    "training/benchmark": <CountingBenchmark />,
    reference: <HiLoReference />,
    "reference/basic-strategy": <StrategyReference />,
    "reference/deviations": <DeviationReference />,
    statistics: <Statistics />,
    settings: <SettingsPage />,
  };
  return pages[path] || <NotFound />;
}
