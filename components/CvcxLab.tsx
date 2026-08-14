"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CvcxScenario,
  analyzeCvcx,
  createOptimalRamp,
  goalBeforeRuinProbability,
  resultPercentile,
  riskSizedUnit,
} from "@/lib/blackjack/cvcx";
import {
  DEFAULT_ADVANTAGE_RULES,
  RampPoint,
  RAMPS,
  unitsAt,
} from "@/lib/blackjack/advantage";
import {
  COEFFICIENT_METADATA,
  GAME_OPTIONS,
} from "@/lib/blackjack/coefficients";
import { Button, GhostButton, Metric, NumberField, Panel, Select } from "./ui";

type View = "viewer" | "ramp" | "risk" | "compare";
const money = (value: number, digits = 0) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)
    : "Not available";
const percent = (value: number, digits = 2, signed = false) =>
  `${signed && value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
const compact = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
const expandPreset = (name: string) =>
  Array.from({ length: 17 }, (_, index) => {
    const trueCount = index - 8;
    return { trueCount, units: unitsAt(trueCount, RAMPS[name]) };
  });

const views: Array<[View, string, string]> = [
  ["viewer", "Viewer", "fa-gauge-high"],
  ["ramp", "Bet ramp", "fa-sliders"],
  ["risk", "Risk & goals", "fa-shield-halved"],
  ["compare", "Compare", "fa-chart-column"],
];

type Tutorial = {
  eyebrow: string;
  title: string;
  summary: string;
  steps: string[];
  terms: Array<[string, string]>;
  caution: string;
};

const tutorials: Record<View, Tutorial> = {
  viewer: {
    eyebrow: "Tutorial 1 of 4",
    title: "Read the Viewer",
    summary:
      "The Viewer is your executive summary. It converts the selected game, bankroll, pace, and bet schedule into long-run performance and a trip projection.",
    steps: [
      "Choose the deck count and the closest available penetration. Penetration is how much of the shoe is dealt before the shuffle.",
      "Enter your actual bankroll, base betting unit, observed rounds per hour, and planned hours.",
      "Select a target lifetime risk of ruin and whether you play every count or wait for a Wong-in count.",
      "Read hourly EV together with risk and N₀. A high win rate is not attractive if the bankroll risk or time needed to overcome variance is unacceptable.",
      "Compare the custom and optimized rows. Use the optimized schedule as a benchmark, then make realistic chip-sized adjustments in Bet ramp.",
    ],
    terms: [
      ["EV", "Expected value: the mathematical average win. Hourly EV is EV per observed round multiplied by rounds per hour."],
      ["Player edge", "Expected profit divided by average initial action. It describes efficiency, not how many dollars you will win in one session."],
      ["Variance / σ", "Variance measures result dispersion; σ is standard deviation. About 68% of terminal results fall within one σ in the normal approximation."],
      ["RoR", "Risk of ruin: the modeled probability of losing the entire stated bankroll while continuing with the same fixed-dollar bets."],
      ["c-SCORE", "A bankroll-independent game-quality measure equal to 1,000,000 ÷ N₀. Higher is better for the same playing assumptions."],
      ["DI", "Desirability Index: the square root of c-SCORE. It expresses expectation relative to volatility."],
      ["N₀", "The number of rounds at which accumulated expected value equals one standard deviation. Lower is better."],
      ["Average bet", "Frequency-weighted initial wager, including $0 during skipped counts when Wonging."],
    ],
    caution:
      "EV is a long-run average, not a session forecast. The green path is the center of a wide distribution; it does not promise smooth bankroll growth.",
  },
  ramp: {
    eyebrow: "Tutorial 2 of 4",
    title: "Build a Bet Ramp",
    summary:
      "A bet ramp assigns a wager to every true-count bucket. Its job is to put more money out when the simulated edge is stronger without exceeding your bankroll or practical spread limits.",
    steps: [
      "Pick a familiar preset to establish a baseline, or set the largest spread you can realistically use.",
      "Choose a Wong-in threshold in Simulation controls. Counts below it receive a $0 wager but still consume observed time.",
      "Generate an optimized ramp. The tool weights positive-edge counts by conditional Kelly value, caps the maximum, and sizes the base to your target RoR.",
      "Edit individual dollar bets to match available chips, table limits, and a spread you can execute consistently.",
      "Watch EV, RoR, c-SCORE, and the count chart after every change. Small cosmetic changes can have large risk effects at the top of the ramp.",
    ],
    terms: [
      ["Running count", "The sum of Hi-Lo tags seen so far: +1 for 2–6, 0 for 7–9, and −1 for tens and aces."],
      ["True count (TC)", "Running count divided by estimated decks remaining, floored in this simulation. It normalizes the count for shoe depth."],
      ["Base bet / unit", "The dollar value represented by one unit. A 1–12 spread with a $15 unit ranges from $15 to $180."],
      ["Bet spread", "Maximum wager divided by minimum non-zero wager. A $10–$120 schedule is a 1–12 spread."],
      ["Frequency", "The share of observed rounds that begins in a true-count bucket."],
      ["Conditional advantage", "The expected return for a round beginning at that true count under the fixed strategy and rules."],
      ["Wonging", "Observing without betting at weak counts and entering at a chosen count. Play rate falls because skipped rounds remain part of the clock."],
      ["Kelly weighting", "Sizing bets in proportion to edge divided by conditional variance to target bankroll growth. Fractional Kelly means taking less risk."],
    ],
    caution:
      "The mathematical optimum is not automatically casino-practical. Table limits, heat, chip granularity, backoffs, and your ability to execute the ramp still matter.",
  },
  risk: {
    eyebrow: "Tutorial 3 of 4",
    title: "Understand Risk & Goals",
    summary:
      "This tab answers different risk questions using the active game and ramp. Keep lifetime ruin, trip ruin, goal probability, and ordinary session variance separate.",
    steps: [
      "Set the bankroll to money genuinely reserved for blackjack—not your session buy-in or total personal savings.",
      "Use Hours for the trip, season, or career segment you want to examine. Rounds per hour converts that horizon into observed opportunities.",
      "Enter a profit goal to estimate the chance of reaching that goal before losing the bankroll with no time limit.",
      "Enter a real trip result to place it in the modeled terminal-result distribution. This helps distinguish an unusual result from an impossible one.",
      "Use required bankroll to resize the same fixed-dollar ramp. Changing the bankroll alone does not change EV; it changes risk capacity.",
    ],
    terms: [
      ["Lifetime RoR", "Probability of eventual ruin with no time limit, constant game conditions, and unchanged fixed-dollar wagers."],
      ["Trip RoR", "Probability the bankroll boundary is touched during the selected finite number of rounds—not merely the chance of finishing down."],
      ["Required bankroll", "Bankroll that gives the chosen target lifetime RoR for the active fixed-dollar ramp."],
      ["Goal before ruin", "Probability of reaching bankroll plus the profit goal before hitting zero, with no deadline."],
      ["Chance of profit", "Probability the terminal result after the selected horizon is above $0. It is different from avoiding ruin during the trip."],
      ["Percentile", "Share of modeled terminal results at or below the entered actual result. A 95th-percentile win is unusually strong, not evidence that EV changed."],
      ["68/90/95% range", "Intervals centered on EV and extending by 1, 1.645, or 1.96 standard deviations under a normal terminal approximation."],
      ["Fixed-dollar model", "Bets do not shrink after losses or grow after wins. Recalculated or proportional betting would have a different risk path."],
    ],
    caution:
      "These are diffusion and normal approximations. They do not include expenses, changing games, bankroll resizing, table departure, heat, or correlated team bankrolls.",
  },
  compare: {
    eyebrow: "Tutorial 4 of 4",
    title: "Compare Games Fairly",
    summary:
      "Comparison holds bankroll, pace, base bet, maximum spread, Wong-in point, and strategy constant while changing deck count and penetration.",
    steps: [
      "Set realistic bankroll, spread, pace, and Wonging assumptions before ranking games.",
      "Use c-SCORE or N₀ to compare inherent quality. They are scale-independent and are usually cleaner than comparing raw dollars per hour.",
      "Check play rate when Wonging. A high edge with very few playable rounds may produce less hourly EV than expected in a slow casino.",
      "Check average bet and RoR before choosing the highest-dollar result. The same base unit can create different risk across count distributions.",
      "Select the closest audited penetration. A quarter-deck penetration difference can materially change high-count frequency and game value.",
    ],
    terms: [
      ["Penetration", "Cards or decks dealt before the shuffle, divided by total shoe size. Deeper penetration generally creates more extreme and valuable counts."],
      ["Cutoff", "Cards left undealt behind the cut card. It is the inverse presentation of penetration: 1.5 decks cut off in 6D means 4.5 decks dealt."],
      ["Play rate", "Percentage of observed rounds actually played after applying the Wong-in threshold."],
      ["Observed rounds", "All table rounds that pass while you count, including $0 rounds. This is the denominator for hourly results here."],
      ["Apples-to-apples", "Holding all non-game assumptions constant so the ranking reflects penetration and deck effects rather than a larger bankroll or bet."],
      ["Audited profile", "A stored set of per-count frequencies, advantages, deviations, samples, and errors produced by the offline simulator."],
      ["Rank", "Order by c-SCORE in the table. Rank is conditional on the current spread, Wonging policy, and supported fixed rules."],
    ],
    caution:
      "A table with better mathematical penetration can still be worse in practice if it has fewer rounds per hour, restrictive limits, poor conditions, or greater backoff risk.",
  },
};

function TutorialDialog({
  topic,
  onClose,
  onNext,
}: {
  topic: View;
  onClose: () => void;
  onNext: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const tutorial = tutorials[topic];
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          "button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/75 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cvcx-tutorial-title" tabIndex={-1} className="surface max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-t-[1.75rem] p-5 outline-none sm:rounded-[1.75rem] sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-white/[.07] pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-400">{tutorial.eyebrow}</p><h2 id="cvcx-tutorial-title" className="mt-2 text-2xl font-semibold">{tutorial.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{tutorial.summary}</p></div>
          <button type="button" onClick={onClose} aria-label="Close tutorial" className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[.09] bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <div className="mt-6 grid gap-7 lg:grid-cols-[.85fr_1.15fr]">
          <section><h3 className="font-semibold">Recommended workflow</h3><ol className="mt-4 space-y-3">{tutorial.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-zinc-400"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-xs font-bold text-emerald-300">{index + 1}</span><span>{step}</span></li>)}</ol><div className="mt-5 rounded-2xl border border-amber-300/10 bg-amber-300/[.06] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-amber-300">Keep in mind</p><p className="mt-2 text-sm leading-6 text-amber-100/75">{tutorial.caution}</p></div></section>
          <section><h3 className="font-semibold">Terminology</h3><dl className="mt-4 divide-y divide-white/[.06] rounded-2xl bg-black/20 px-4">{tutorial.terms.map(([term, definition]) => <div key={term} className="py-3"><dt className="text-sm font-semibold text-zinc-100">{term}</dt><dd className="mt-1 text-sm leading-6 text-zinc-500">{definition}</dd></div>)}</dl></section>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.07] pt-5"><p className="text-xs text-zinc-500">Your current game inputs stay unchanged while you read.</p><div className="flex gap-2"><GhostButton onClick={onClose}>Close</GhostButton><Button onClick={onNext}>{topic === "compare" ? "Back to Viewer" : "Next tutorial"} <span className="ml-2">→</span></Button></div></div>
      </div>
    </div>
  );
}

export function CvcxLab() {
  const [view, setView] = useState<View>("viewer"),
    [helpTopic, setHelpTopic] = useState<View | null>(null),
    [bankroll, setBankroll] = useState(25000),
    [baseBet, setBaseBet] = useState(15),
    [handsPerHour, setHandsPerHour] = useState(100),
    [hours, setHours] = useState(100),
    [targetRisk, setTargetRisk] = useState(0.05),
    [maxSpread, setMaxSpread] = useState(12),
    [wongInAt, setWongInAt] = useState<number | null>(null),
    [decks, setDecks] = useState<6 | 8>(6),
    [dealt, setDealt] = useState(4.5),
    [rampName, setRampName] = useState("1-12"),
    [ramp, setRamp] = useState<RampPoint[]>(() => expandPreset("1-12")),
    [goal, setGoal] = useState(5000),
    [actualResult, setActualResult] = useState(0),
    [simplify, setSimplify] = useState(true);

  const rules = useMemo(
      () => ({
        ...DEFAULT_ADVANTAGE_RULES,
        decks,
        penetration: dealt / decks,
      }),
      [decks, dealt],
    ),
    scenario: CvcxScenario = useMemo(
      () => ({
        bankroll,
        minimumBet: baseBet,
        handsPerHour,
        hours,
        targetRisk,
        maxSpread,
        wongInAt,
        rules,
      }),
      [bankroll, baseBet, handsPerHour, hours, targetRisk, maxSpread, wongInAt, rules],
    ),
    optimalRamp = useMemo(
      () => createOptimalRamp(rules, maxSpread, wongInAt, simplify),
      [rules, maxSpread, wongInAt, simplify],
    ),
    custom = useMemo(
      () => analyzeCvcx(scenario, ramp, baseBet),
      [scenario, ramp, baseBet],
    ),
    optimalUnit = useMemo(
      () => riskSizedUnit(scenario, optimalRamp),
      [scenario, optimalRamp],
    ),
    optimized = useMemo(
      () =>
        analyzeCvcx(
          scenario,
          optimalRamp,
          Number.isFinite(optimalUnit) ? optimalUnit : baseBet,
        ),
      [scenario, optimalRamp, optimalUnit, baseBet],
    );

  const setPreset = (name: string) => {
    setRampName(name);
    setWongInAt(null);
    setRamp(expandPreset(name));
  };
  const useOptimal = () => {
    setRampName("Optimized");
    setRamp(optimalRamp);
    if (Number.isFinite(optimalUnit) && optimalUnit > 0)
      setBaseBet(Math.max(1, Math.round(optimalUnit)));
  };
  const updateDollarBet = (trueCount: number, bet: number) => {
    setRampName("Custom");
    setRamp((current) =>
      current.map((point) =>
        point.trueCount === trueCount
          ? { ...point, units: baseBet > 0 ? bet / baseBet : 0 }
          : point,
      ),
    );
  };

  const projection = useMemo(
      () =>
        Array.from({ length: 21 }, (_, index) => {
          const elapsed = (hours * index) / 20;
          const rounds = elapsed * handsPerHour;
          const mean = custom.evPerRound * rounds;
          const sd = custom.sdPerRound * Math.sqrt(rounds);
          return {
            hours: Math.round(elapsed * 10) / 10,
            expected: mean,
            band: [mean - 1.645 * sd, mean + 1.645 * sd],
          };
        }),
      [hours, handsPerHour, custom.evPerRound, custom.sdPerRound],
    ),
    countChart = custom.rows.map((row) => ({
      count: row.label,
      advantage: row.advantage * 100,
      bet: row.bet,
      frequency: row.frequency * 100,
    })),
    goalChance = goalBeforeRuinProbability(
      bankroll,
      goal,
      custom.evPerRound,
      custom.sdPerRound ** 2,
    ),
    actualPercentile = resultPercentile(
      actualResult,
      custom.tripEv,
      custom.standardDeviation,
    );

  const comparisons = useMemo(
    () =>
      ([6, 8] as const).flatMap((comparisonDecks) =>
        GAME_OPTIONS[comparisonDecks].map((option) => {
          const comparisonRules = {
            ...rules,
            decks: comparisonDecks,
            penetration: option.dealt / comparisonDecks,
          };
          const comparisonRamp = createOptimalRamp(
            comparisonRules,
            maxSpread,
            wongInAt,
            simplify,
          );
          const comparisonScenario = {
            ...scenario,
            rules: comparisonRules,
          };
          const result = analyzeCvcx(
            comparisonScenario,
            comparisonRamp,
            baseBet,
          );
          return {
            name: `${comparisonDecks}D · ${option.dealt} dealt`,
            decks: comparisonDecks,
            penetration: option.dealt / comparisonDecks,
            ...result,
          };
        }),
      ),
    [rules, maxSpread, wongInAt, simplify, scenario, baseBet],
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
            Professional game analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Counter’s Edge Lab</h1>
          <p className="mt-2 max-w-4xl text-zinc-400">
            A CVCX-style workspace for comparing games, shaping a bet ramp,
            sizing a bankroll, and understanding long-run and trip risk.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-1.5 text-xs font-medium text-emerald-300">
          {decks}D · {dealt} dealt · Hi-Lo
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/[.07] bg-black/20 p-1.5 sm:grid-cols-4">
        {views.map(([id, label, icon]) => (
          <div key={id} className={`grid grid-cols-[1fr_2.75rem] rounded-xl ${view === id ? "bg-white/[.1] text-white shadow-sm" : "text-zinc-500"}`}>
            <button
              type="button"
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
              className="pressable min-h-11 rounded-l-xl px-2 text-left text-sm font-medium hover:text-zinc-200 sm:text-center"
            >
              <i className={`fa-solid ${icon} mr-2 text-xs`} aria-hidden="true" />
              {label}
            </button>
            <button
              type="button"
              aria-label={`Open ${label} tutorial`}
              title={`${label} tutorial and terminology`}
              onClick={() => {
                setView(id);
                setHelpTopic(id);
              }}
              className="pressable grid min-h-11 place-items-center rounded-r-xl border-l border-white/[.06] text-xs text-zinc-400 hover:bg-white/[.06] hover:text-emerald-300"
            >
              <i className="fa-solid fa-question" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <Panel className="mb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Simulation controls</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Every result updates instantly from the selected audited profile.
            </p>
          </div>
          <span className="rounded-full bg-white/[.05] px-3 py-1 text-xs text-zinc-400">
            H17 · DAS · RSA · LS · peek · 3:2 · one spot
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Select
            label="Decks"
            value={decks}
            onChange={(event) => {
              const next = Number(event.target.value) as 6 | 8;
              setDecks(next);
              setDealt(next === 6 ? 4.5 : 6);
            }}
          >
            <option value={6}>6 decks</option>
            <option value={8}>8 decks</option>
          </Select>
          <Select label="Penetration" value={dealt} onChange={(event) => setDealt(+event.target.value)}>
            {GAME_OPTIONS[decks].map((option) => (
              <option key={option.dealt} value={option.dealt}>{option.label}</option>
            ))}
          </Select>
          <NumberField label="Bankroll" value={bankroll} min={1} prefix="$" onValueChange={setBankroll} />
          <NumberField label="Base bet" value={baseBet} min={0.01} prefix="$" onValueChange={setBaseBet} />
          <NumberField label="Rounds / hour" value={handsPerHour} min={1} onValueChange={setHandsPerHour} />
          <NumberField label="Hours" value={hours} min={0.1} step={1} onValueChange={setHours} />
          <Select label="Target RoR" value={targetRisk} onChange={(event) => setTargetRisk(+event.target.value)}>
            <option value={0.01}>1%</option><option value={0.025}>2.5%</option>
            <option value={0.05}>5%</option><option value={0.1}>10%</option>
            <option value={0.135}>13.5% (Kelly)</option><option value={0.25}>25%</option>
          </Select>
          <Select label="Wong in" value={wongInAt ?? "play-all"} onChange={(event) => setWongInAt(event.target.value === "play-all" ? null : +event.target.value)}>
            <option value="play-all">Play all</option>
            <option value={0}>TC 0+</option><option value={1}>TC +1+</option>
            <option value={2}>TC +2+</option><option value={3}>TC +3+</option>
          </Select>
        </div>
      </Panel>

      {view === "viewer" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Metric label="Hourly EV" value={money(custom.hourlyEv, 2)} sub={`${percent(custom.playerEdge, 3, true)} player edge`} />
            <Metric label="Lifetime RoR" value={percent(custom.riskOfRuin)} sub={`${percent(custom.tripRiskOfRuin)} over this trip`} />
            <Metric label="c-SCORE" value={custom.cScore.toFixed(2)} sub={`DI ${custom.desirabilityIndex.toFixed(2)}`} />
            <Metric label="N₀" value={`${compact(custom.nZeroRounds)} rounds`} sub={`${compact(custom.nZeroHours)} observed hr`} />
            <Metric label="Average bet" value={money(custom.averageBet, 2)} sub={`${percent(custom.playedFrequency, 1)} rounds played`} />
            <Metric label="Trip EV" value={money(custom.tripEv, 0)} sub={`${percent(custom.chanceOfProfit)} chance of profit`} />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <Panel>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold">Expected bankroll path</h2><p className="mt-1 text-sm text-zinc-500">90% terminal-result band; it is not a stop-loss boundary.</p></div>
                <span className="text-sm text-zinc-400">σ / hour {money(custom.sdPerHour, 0)}</span>
              </div>
              <div className="h-72 w-full" aria-label="Expected result projection chart">
                <ResponsiveContainer>
                  <AreaChart data={projection} margin={{ left: 8, right: 12 }}>
                    <defs><linearGradient id="resultBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a8ee72" stopOpacity={0.2}/><stop offset="1" stopColor="#a8ee72" stopOpacity={0.02}/></linearGradient></defs>
                    <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis dataKey="hours" stroke="#71717a" tickLine={false} axisLine={false} tickFormatter={(value) => `${value}h`} />
                    <YAxis stroke="#71717a" tickLine={false} axisLine={false} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} width={48} />
                    <Tooltip contentStyle={{ background: "#151916", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} formatter={(value) => money(Number(value), 0)} labelFormatter={(value) => `${value} hours`} />
                    <Area type="monotone" dataKey="band" name="90% range" stroke="rgba(168,238,114,.22)" fill="url(#resultBand)" />
                    <Line type="monotone" dataKey="expected" stroke="#a8ee72" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel>
              <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Optimal vs. custom</h2><p className="mt-1 text-sm text-zinc-500">Risk-sized Kelly-weight ramp.</p></div><GhostButton onClick={useOptimal} className="px-3 text-xs">Use optimal</GhostButton></div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[400px] text-right text-sm">
                  <thead className="text-zinc-500"><tr><th className="pb-3 text-left">Schedule</th><th className="pb-3">Base</th><th className="pb-3">$/hr</th><th className="pb-3">RoR</th><th className="pb-3">SCORE</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-white/[.06]"><td className="py-4 text-left font-medium">{rampName}</td><td>{money(baseBet, 0)}</td><td>{money(custom.hourlyEv, 0)}</td><td>{percent(custom.riskOfRuin)}</td><td>{custom.cScore.toFixed(1)}</td></tr>
                    <tr className="border-t border-white/[.06] text-emerald-300"><td className="py-4 text-left font-medium">Optimized</td><td>{money(optimalUnit, 0)}</td><td>{money(optimized.hourlyEv, 0)}</td><td>{percent(optimized.riskOfRuin)}</td><td>{optimized.cScore.toFixed(1)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">The optimized row sizes positive-edge bets by conditional Kelly weight, caps them at the selected spread, and scales the unit to the target lifetime RoR.</p>
            </Panel>
          </div>
        </>
      )}

      {view === "ramp" && (
        <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
          <Panel>
            <h2 className="font-semibold">Ramp designer</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">Start with a common spread or generate a risk-sized Kelly-weight ramp. Edit any dollar bet afterward.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Select label="Preset" value={Object.hasOwn(RAMPS, rampName) ? rampName : "custom"} onChange={(event) => event.target.value !== "custom" && setPreset(event.target.value)}>
                {Object.keys(RAMPS).map((name) => <option key={name} value={name}>{name} spread</option>)}
                {!Object.hasOwn(RAMPS, rampName) && <option value="custom">{rampName}</option>}
              </Select>
              <NumberField label="Maximum spread" value={maxSpread} min={1} max={100} onValueChange={setMaxSpread} />
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm text-zinc-300"><input type="checkbox" checked={simplify} onChange={(event) => setSimplify(event.target.checked)} className="accent-emerald-400" />Simplify to half units</label>
              <Button onClick={useOptimal}>Generate optimized ramp</Button>
            </div>
            <div className="mt-5 rounded-xl bg-emerald-400/[.07] p-4 text-sm leading-6 text-emerald-200"><b>{money(optimalUnit, 2)}</b> risk-sized base bet for a {percent(targetRisk)} lifetime RoR target.</div>
          </Panel>
          <Panel className="overflow-x-auto">
            <div className="mb-4"><h2 className="font-semibold">Bets by true count</h2><p className="mt-1 text-sm text-zinc-500">Zero-dollar buckets are observed but not played.</p></div>
            <table className="w-full min-w-[740px] text-right text-sm">
              <thead className="text-zinc-500"><tr><th className="pb-3 text-left">TC</th><th className="pb-3">Frequency</th><th className="pb-3">Advantage</th><th className="pb-3">Units</th><th className="pb-3">Dollar bet</th><th className="pb-3">EV contribution</th></tr></thead>
              <tbody>{custom.rows.map((row) => <tr key={row.trueCount} className="border-t border-white/[.06]"><td className="py-2.5 text-left font-semibold">{row.label}</td><td>{percent(row.frequency, 2)}</td><td className={row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}>{percent(row.advantage, 3, true)}</td><td>{row.units.toFixed(2)}</td><td className="py-2"><NumberField ariaLabel={`Bet at true count ${row.label}`} value={Math.round(row.bet * 100) / 100} min={0} prefix="$" className="ml-auto w-32" onValueChange={(value) => updateDollarBet(row.trueCount, value)} /></td><td>{money(row.frequency * row.advantage * row.bet, 3)}</td></tr>)}</tbody>
            </table>
          </Panel>
          <Panel className="xl:col-span-2">
            <h2 className="mb-4 font-semibold">Count economics</h2>
            <div className="h-72"><ResponsiveContainer><ComposedChart data={countChart}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="count" stroke="#71717a" tickLine={false} axisLine={false}/><YAxis yAxisId="edge" stroke="#71717a" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false}/><YAxis yAxisId="bet" orientation="right" stroke="#71717a" tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#151916", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }}/><Legend/><Bar yAxisId="bet" dataKey="bet" name="Bet" fill="#3f6f4a" radius={[4,4,0,0]}/><Line yAxisId="edge" dataKey="advantage" name="Advantage %" stroke="#a8ee72" strokeWidth={2} dot={false}/></ComposedChart></ResponsiveContainer></div>
          </Panel>
        </div>
      )}

      {view === "risk" && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Panel>
            <h2 className="font-semibold">Goal & results calculator</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">Stress-test the active game and ramp without changing its simulation inputs.</p>
            <div className="mt-5 grid gap-4">
              <NumberField label="Profit goal" value={goal} min={0} prefix="$" onValueChange={setGoal}/>
              <NumberField label="Actual trip result" value={actualResult} prefix="$" onValueChange={setActualResult}/>
              <div className="rounded-xl bg-black/20 p-4 text-sm leading-6 text-zinc-400">Trip horizon: <b className="text-zinc-100">{hours.toLocaleString()} hours</b><br/>Observed rounds: <b className="text-zinc-100">{compact(hours * handsPerHour)}</b></div>
            </div>
          </Panel>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Required bankroll" value={money(custom.requiredBankroll, 0)} sub={`for ${percent(targetRisk)} lifetime RoR`} />
              <Metric label="Trip ruin risk" value={percent(custom.tripRiskOfRuin, 3)} sub={`${compact(hours * handsPerHour)} observed rounds`} />
              <Metric label="Reach goal first" value={percent(goalChance)} sub={`before ruin, no time limit`} />
              <Metric label="Actual percentile" value={percent(actualPercentile, 1)} sub={actualResult >= custom.tripEv ? "above expected result" : "below expected result"} />
            </div>
            <Panel>
              <h2 className="font-semibold">Range of probable trip results</h2>
              <p className="mt-1 text-sm text-zinc-500">Terminal normal approximation around {money(custom.tripEv, 0)} expected value.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[["68% range", 1], ["90% range", 1.645], ["95% range", 1.96]].map(([label, z]) => <div key={String(label)} className="rounded-2xl bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 font-semibold">{money(custom.tripEv - Number(z) * custom.standardDeviation, 0)}</p><p className="text-zinc-500">to</p><p className="font-semibold">{money(custom.tripEv + Number(z) * custom.standardDeviation, 0)}</p></div>)}
              </div>
            </Panel>
            <Panel>
              <h2 className="font-semibold">What the numbers say</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
                <li>• Chance of finishing this horizon ahead: <b className="text-zinc-100">{percent(custom.chanceOfProfit)}</b>.</li>
                <li>• One standard deviation is <b className="text-zinc-100">{money(custom.standardDeviation, 0)}</b>; short-term results can swamp the {money(custom.tripEv, 0)} expectation.</li>
                <li>• An actual result of {money(actualResult, 0)} is at the <b className="text-zinc-100">{percent(actualPercentile, 1)}</b> percentile under this model.</li>
              </ul>
            </Panel>
          </div>
        </div>
      )}

      {view === "compare" && (
        <div className="space-y-5">
          <Panel>
            <div className="mb-5"><h2 className="font-semibold">Penetration comparison</h2><p className="mt-1 text-sm text-zinc-500">Same bankroll, spread, wonging point, pace, and base bet; each game receives its own Kelly-weight ramp.</p></div>
            <div className="h-72"><ResponsiveContainer><BarChart data={comparisons}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="name" stroke="#71717a" tickLine={false} axisLine={false} fontSize={11}/><YAxis stroke="#71717a" tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#151916", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }}/><Bar dataKey="cScore" name="c-SCORE" radius={[5,5,0,0]}>{comparisons.map((row) => <Cell key={row.name} fill={row.decks === decks && Math.abs(row.penetration - dealt / decks) < .001 ? "#a8ee72" : "#355d40"}/>)}</Bar></BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-right text-sm">
              <thead className="text-zinc-500"><tr><th className="pb-3 text-left">Game</th><th className="pb-3">Penetration</th><th className="pb-3">Play rate</th><th className="pb-3">Average bet</th><th className="pb-3">$/hour</th><th className="pb-3">RoR</th><th className="pb-3">N₀</th><th className="pb-3">c-SCORE</th></tr></thead>
              <tbody>{[...comparisons].sort((a,b) => b.cScore - a.cScore).map((row, index) => <tr key={row.name} className="border-t border-white/[.06]"><td className="py-3 text-left"><span className="mr-2 text-xs text-zinc-600">#{index + 1}</span><b>{row.name}</b></td><td>{percent(row.penetration, 1)}</td><td>{percent(row.playedFrequency, 1)}</td><td>{money(row.averageBet, 2)}</td><td className="text-emerald-300">{money(row.hourlyEv, 2)}</td><td>{percent(row.riskOfRuin)}</td><td>{compact(row.nZeroRounds)}</td><td className="font-semibold">{row.cScore.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </Panel>
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Scope: this is a post-simulation analyzer for the nine included 6D/8D H17 Hi-Lo profiles, not a general rules simulator. EV and variance use {COEFFICIENT_METADATA.totalRounds.toLocaleString()} audited resolved rounds. Wonging treats skipped rounds as observed opportunities. Risk, goals, and result ranges use continuous-diffusion or normal approximations and do not model heat, backoffs, travel time, bankroll resizing, or correlated two-hand play.
      </p>
      {helpTopic && (
        <TutorialDialog
          topic={helpTopic}
          onClose={() => setHelpTopic(null)}
          onNext={() => {
            const index = views.findIndex(([id]) => id === helpTopic);
            const next = views[(index + 1) % views.length][0];
            setView(next);
            setHelpTopic(next);
          }}
        />
      )}
    </>
  );
}
