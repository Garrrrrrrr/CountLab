"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, GhostButton, Metric, Panel, Select, Switch } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  DEFAULT_SETTINGS,
  Session,
  Settings,
  storage,
} from "@/lib/statistics/storage";
import { computeStreak, practiceHeatmap, unlockedMilestones } from "@/lib/statistics/streaks";
import { Action, BlackjackRules, Card, DEFAULT_RULES, Rank } from "@/lib/blackjack/types";
import { getBasicStrategyDecision } from "@/lib/blackjack/basicStrategy";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { analytics } from "@/lib/analytics";
import { LEGACY_REDIRECTS } from "@/lib/routes";

function PageLoading() {
  return (
    <Panel className="flex min-h-[50vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-medium text-emerald-100/70">
        <i className="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
        Loading…
      </div>
    </Panel>
  );
}
const dynamicPage = (loader: () => Promise<{ default: ComponentType }>) =>
  dynamic(loader, { loading: PageLoading });

const CvcxLab = dynamicPage(() => import("@/components/CvcxLab").then((m) => ({ default: m.CvcxLab })));
const BankrollRecommender = dynamicPage(() => import("@/components/BankrollRecommender").then((m) => ({ default: m.BankrollRecommender })));
const SessionSimulator = dynamicPage(() => import("@/components/SessionSimulator").then((m) => ({ default: m.SessionSimulator })));
const SessionJournal = dynamicPage(() => import("@/components/SessionJournal").then((m) => ({ default: m.SessionJournal })));
const ScenarioComparison = dynamicPage(() => import("@/components/ScenarioComparison").then((m) => ({ default: m.ScenarioComparison })));
const TripPlanner = dynamicPage(() => import("@/components/TripPlanner").then((m) => ({ default: m.TripPlanner })));
const ChaseFlushLab = dynamicPage(() => import("@/components/ChaseFlushLab").then((m) => ({ default: m.ChaseFlushLab })));
const UTHLab = dynamicPage(() => import("@/components/UTHLab").then((m) => ({ default: m.UTHLab })));
const RunningCountDrill = dynamicPage(() => import("@/components/CountingDrills").then((m) => ({ default: m.RunningCountDrill })));
const TrueCountDrill = dynamicPage(() => import("@/components/CountingDrills").then((m) => ({ default: m.TrueCountDrill })));
const DeckEstimationDrill = dynamicPage(() => import("@/components/CountingDrills").then((m) => ({ default: m.DeckEstimationDrill })));
const CountingBenchmark = dynamicPage(() => import("@/components/CountingDrills").then((m) => ({ default: m.CountingBenchmark })));
const ProficiencyTest = dynamicPage(() => import("@/components/CountingDrills").then((m) => ({ default: m.ProficiencyTest })));
const StrategyDrill = dynamicPage(() => import("@/components/Drills").then((m) => ({ default: m.StrategyDrill })));
const DeviationDrill = dynamicPage(() => import("@/components/Drills").then((m) => ({ default: m.DeviationDrill })));
const H17ChartDrill = dynamicPage(() => import("@/components/H17ChartDrill").then((m) => ({ default: m.H17ChartDrill })));
const StatisticsPage = dynamicPage(() => import("@/components/StatisticsPage"));
const DeviationReferencePage = dynamicPage(() => import("@/components/DeviationReferencePage"));
const TermsPage = dynamicPage(() => import("@/components/TermsPage"));
const PrivacyPage = dynamicPage(() => import("@/components/PrivacyPage"));
const AdminPage = dynamicPage(() => import("@/components/AdminPage"));
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
  const streak = useMemo(() => computeStreak(sessions), [sessions]);
  const heatmap = useMemo(() => practiceHeatmap(streak.practiceDays), [streak.practiceDays]);
  const milestones = useMemo(() => unlockedMilestones(sessions, streak), [sessions, streak]);
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
    "Deck Estimation": "/training/deck-estimation",
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
      {sessions.length > 0 && (
        <Panel className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {streak.currentStreakDays > 0 ? (
                  <><i className="fa-solid fa-fire mr-2 text-amber-300" aria-hidden="true" />{streak.currentStreakDays}-day streak</>
                ) : (
                  "Practice streak"
                )}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">Best run: {streak.bestStreakDays} day{streak.bestStreakDays === 1 ? "" : "s"} · {streak.practiceDaysThisWeek} day{streak.practiceDaysThisWeek === 1 ? "" : "s"} this week</p>
            </div>
            {milestones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {milestones.map((milestone) => <span key={milestone.id} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"><i className="fa-solid fa-medal mr-1.5" aria-hidden="true" />{milestone.label}</span>)}
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
            {heatmap.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day) => (
                  <div key={day.date} title={day.date} className={`h-3 w-3 rounded-sm ${day.practiced ? "bg-emerald-400" : "bg-white/[.06]"}`} />
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}
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
      <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-400">Casino games</p><h2 className="mt-2 text-xl font-semibold">Play, practice, or analyze</h2></div>
          <p className="text-sm text-zinc-500">Separate games with their own bankrolls, chips, rules, and solvers.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/ultimate-texas-holdem" className="pressable surface group rounded-[1.35rem] p-5 hover:border-emerald-400/25 sm:p-6">
            <div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><i className="fa-solid fa-clover" aria-hidden="true" /></span><i className="fa-solid fa-arrow-right text-zinc-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden="true" /></div>
            <h3 className="mt-5 text-lg font-semibold">Ultimate Texas Hold&apos;em</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Play a complete chip-based table, study basic strategy, or inspect exact late-stage decisions.</p>
            <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-[.12em] text-emerald-400">Open UTH table</span>
          </Link>
          <Link href="/chase-flush" className="pressable surface group rounded-[1.35rem] p-5 hover:border-emerald-400/25 sm:p-6">
            <div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-400/10 text-sky-300"><i className="fa-solid fa-diamond" aria-hidden="true" /></span><i className="fa-solid fa-arrow-right text-zinc-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" aria-hidden="true" /></div>
            <h3 className="mt-5 text-lg font-semibold">Chase the Flush</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Play staged 3x/2x/1x rounds with chips and exposed-card schedules, or open the exact solver.</p>
            <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-[.12em] text-emerald-400">Open Chase table</span>
          </Link>
        </div>
      </section>
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
function SettingsPage() {
  const { user, signOut, exitGuest, syncStatus } = useAuth();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS),
    [saved, setSaved] = useState(false),
    [dataMessage, setDataMessage] = useState(""),
    [analyticsEnabled, setAnalyticsEnabled] = useState(true),
    [analyticsDeleting, setAnalyticsDeleting] = useState(false),
    [analyticsMessage, setAnalyticsMessage] = useState(""),
    [confirmingAnalyticsDelete, setConfirmingAnalyticsDelete] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setS(storage.settings()); setAnalyticsEnabled(analytics.isEnabled()); }, []);
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
              <Switch key={key} label={label} checked={s[key]} onChange={(value) => update(key, value)} />
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
            <Switch key={k} label={l} checked={Boolean(s[k as keyof Settings])} onChange={(value) => update(k as "sound" | "animations" | "shortcuts", value)} className="border-b border-white/[.06] py-3" />
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
          <h2 className="font-semibold">Privacy</h2>
          <label className="mt-4 flex items-start justify-between gap-5 rounded-xl bg-black/20 p-4">
            <span><b className="block text-sm">Privacy-minimized product analytics</b><span className="mt-1 block text-xs leading-5 text-zinc-500">Helps improve drills and reliability. No email, notes, passwords, exact bankrolls, or advertising identifiers are collected.</span></span>
            <input type="checkbox" checked={analyticsEnabled} onChange={(event) => { const enabled = event.target.checked; setAnalyticsEnabled(enabled); analytics.setConsent(enabled, "settings"); }} className="mt-1 h-5 w-5 shrink-0 accent-emerald-500" />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href="/privacy" className="text-xs text-emerald-300 hover:underline">Review the analytics and retention policy</Link>
            <GhostButton className="px-3 py-1 text-xs" disabled={analyticsDeleting} onClick={() => setConfirmingAnalyticsDelete(true)}>{analyticsDeleting ? "Deleting…" : "Delete analytics history"}</GhostButton>
          </div>
          {analyticsMessage && <p aria-live="polite" className="mt-3 text-xs text-emerald-300">{analyticsMessage}</p>}
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="font-semibold">Training data</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Download a portable JSON backup or restore one on this device. It
            covers settings, drill history and progress, the session journal,
            saved scenarios and simulation runs, and venue presets.
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
                  const { namespaces } = storage.importData(await file.text());
                  setS(storage.settings());
                  setDataMessage(`Imported ${storage.sessions().length} sessions${namespaces ? ` and ${namespaces} saved collection${namespaces === 1 ? "" : "s"}` : ""}. Reload to pick up restored journal and scenario data.`);
                } catch (error) {
                  setDataMessage(error instanceof Error ? error.message : "Import failed");
                }
                event.target.value = "";
              }}
            />
            <GhostButton
              onClick={() => {
                const url = URL.createObjectURL(new Blob([storage.exportCsv()], { type: "text/csv" }));
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `countlab-training-${new Date().toISOString().slice(0, 10)}.csv`;
                anchor.click();
                URL.revokeObjectURL(url);
                setDataMessage("CSV downloaded.");
              }}
            >
              Export CSV
            </GhostButton>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">CSV export covers drill sessions only — a spreadsheet-friendly summary with no mistake or category detail — and is export-only. JSON stays the format to restore from.</p>
          {dataMessage && (
            <p aria-live="polite" className="mt-3 text-sm text-emerald-300">
              {dataMessage}
            </p>
          )}
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="font-semibold">Access</h2>
          <p className="mt-2 text-sm text-zinc-400">
            {user
              ? <>Signed in as <span className="text-zinc-300">{user.email}</span>. Your data syncs to this account.</>
              : "Browsing as a guest. Your data is saved on this device only — sign in to back it up and sync it across devices."}
          </p>
          {user && (
            <p className="mt-1 text-xs text-zinc-500">
              {syncStatus === "syncing" && <><i className="fa-solid fa-arrows-rotate mr-1.5 animate-spin" aria-hidden="true" />Syncing…</>}
              {syncStatus === "synced" && <><i className="fa-solid fa-check mr-1.5 text-emerald-400" aria-hidden="true" />Synced — journal, drills, and settings are up to date on this account.</>}
              {syncStatus === "error" && <span className="text-amber-300"><i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />Sync failed — check your connection and reload.</span>}
              {syncStatus === "idle" && "Not synced yet."}
            </p>
          )}
          {user ? (
            <GhostButton className="mt-4" onClick={() => signOut()}>
              <i className="fa-solid fa-arrow-right-from-bracket mr-2" />
              Sign out
            </GhostButton>
          ) : (
            <GhostButton className="mt-4" onClick={() => exitGuest()}>
              <i className="fa-solid fa-arrow-right-to-bracket mr-2" />
              Sign in
            </GhostButton>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            <Link href="/terms" className="hover:text-zinc-300">Terms of Service</Link>
            {" · "}
            <Link href="/privacy" className="hover:text-zinc-300">Privacy Policy</Link>
          </p>
        </Panel>
      </div>
      <ConfirmModal
        open={confirmingAnalyticsDelete}
        title="Delete analytics history?"
        description="This deletes this device's analytics history and, if signed in, analytics linked to your account. Training and journal data will not be deleted."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmingAnalyticsDelete(false)}
        onConfirm={async () => {
          setConfirmingAnalyticsDelete(false);
          setAnalyticsDeleting(true);
          const deleted = await analytics.deleteHistory();
          setAnalyticsDeleting(false);
          setAnalyticsMessage(deleted ? "Analytics history deleted. Future analytics will use a new random device ID." : "Analytics history could not be deleted. Try again later.");
        }}
      />
    </>
  );
}
/** Keeps an old bookmark working without publishing the same page at three URLs. */
function LegacyRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <Panel className="py-20 text-center">
      <p className="text-zinc-400">This page moved to the Game &amp; Bankroll Lab.</p>
      <Link href={to}>
        <Button className="mt-5">Continue</Button>
      </Link>
    </Panel>
  );
}
function NotFound() {
  useEffect(() => {
    analytics.track("client_error", { error_type: "RouteNotFound", message_normalized: "route not found", route: analytics.route, source: "dynamic_page" });
  }, []);
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
    journal: <SessionJournal />,
    compare: <ScenarioComparison />,
    "trip-planner": <TripPlanner />,
    "bet-spread-recommender": <BankrollRecommender />,
    "chase-flush": <ChaseFlushLab />,
    "ultimate-texas-holdem": <UTHLab />,
    "training/running-count": <RunningCountDrill />,
    "training/true-count": <TrueCountDrill />,
    "training/basic-strategy": <StrategyDrill />,
    "training/deviations": <DeviationDrill />,
    "training/h17-chart": <H17ChartDrill />,
    "training/full-shoe": null,
    "training/deck-estimation": <DeckEstimationDrill />,
    "training/benchmark": <CountingBenchmark />,
    "training/proficiency-test": <ProficiencyTest />,
    reference: <HiLoReference />,
    "reference/basic-strategy": <StrategyReference />,
    "reference/deviations": <DeviationReferencePage />,
    statistics: <StatisticsPage />,
    settings: <SettingsPage />,
    terms: <TermsPage />,
    privacy: <PrivacyPage />,
    admin: <AdminPage />,
  };
  const redirect = LEGACY_REDIRECTS[path];
  if (redirect) return <LegacyRedirect to={redirect} />;
  return pages[path] || <NotFound />;
}
