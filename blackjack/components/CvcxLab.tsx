"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
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
  finiteHorizonRisk,
  goalByHorizonProbability,
  goalBeforeRuinProbability,
  roundsToGoalProbability,
  resultPercentile,
  riskSizedUnit,
} from "@/lib/blackjack/cvcx";
import {
  DEFAULT_ADVANTAGE_RULES,
  HandCountPoint,
  RampPoint,
  RAMPS,
  unitsAt,
} from "@/lib/blackjack/advantage";
import {
  COEFFICIENT_METADATA,
  GAME_OPTIONS,
} from "@/lib/blackjack/coefficients";
import {
  DEVIATION_SKILL,
  isEstimated,
  sumRuleAdjustment,
} from "@/lib/blackjack/ruleAdjustments";
import { cvcxLibrary, CvcxTemplate, CvcxTemplateConfig } from "@/lib/blackjack/cvcxLibrary";
import { simulationLibrary } from "@/lib/blackjack/simulationLibrary";
import type { SessionSimulationConfig } from "@/lib/blackjack/sessionSimulation";
import { Button, GhostButton, Metric, NumberField, Panel, Select, Switch } from "./ui";

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
  ["viewer", "1. Understand", "fa-gauge-high"],
  ["ramp", "2. Optimize", "fa-sliders"],
  ["risk", "3. Plan", "fa-shield-halved"],
  ["compare", "4. Compare", "fa-chart-column"],
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
      ["Average total action", "Frequency-weighted initial wager across every simultaneous player hand, including $0 during skipped counts when Wonging."],
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
  const router = useRouter();
  const [view, setView] = useState<View>("viewer"),
    [helpTopic, setHelpTopic] = useState<View | null>(null),
    [bankroll, setBankroll] = useState(25000),
    [baseBet, setBaseBet] = useState(15),
    [playerHands, setPlayerHands] = useState(1),
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
    [chipIncrement, setChipIncrement] = useState(0.5),
    [extraHandsAt, setExtraHandsAt] = useState<number | null>(null),
    [highCountHands, setHighCountHands] = useState(2),
    [goalProbability, setGoalProbability] = useState(0.75),
    [dealerHitsSoft17, setDealerHitsSoft17] = useState(true),
    [doubleAfterSplit, setDoubleAfterSplit] = useState(true),
    [resplitAces, setResplitAces] = useState(true),
    [lateSurrender, setLateSurrender] = useState(true),
    [europeanNoHoleCard, setEuropeanNoHoleCard] = useState(false),
    [blackjackPayout, setBlackjackPayout] = useState<1.5 | 1.2>(1.5),
    [deviationSkillLevel, setDeviationSkillLevel] = useState<keyof typeof DEVIATION_SKILL>("perfect"),
    [cvcxTemplateName, setCvcxTemplateName] = useState(""),
    [cvcxTemplates, setCvcxTemplates] = useState<CvcxTemplate[]>([]),
    [cvcxNotice, setCvcxNotice] = useState<string>(),
    [handsOverride, setHandsOverride] = useState<Record<number, number>>({}),
    [tripBankrollAmount, setTripBankrollAmount] = useState(1000),
    [tripHoursPlayed, setTripHoursPlayed] = useState(10);

  useEffect(() => {
    const refresh = () => setCvcxTemplates(cvcxLibrary.templates());
    refresh();
    track("cvcx_tab_changed", { tab: "viewer" });
    addEventListener(cvcxLibrary.event, refresh);
    return () => removeEventListener(cvcxLibrary.event, refresh);
  }, []);

  const ruleFlags = useMemo(
      () => ({
        dealerStandsSoft17: !dealerHitsSoft17,
        noDoubleAfterSplit: !doubleAfterSplit,
        noResplitAces: !resplitAces,
        noLateSurrender: !lateSurrender,
        europeanNoHoleCard,
        blackjackPays6to5: blackjackPayout === 1.2,
      }),
      [dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, europeanNoHoleCard, blackjackPayout],
    ),
    ruleAdjustment = useMemo(() => sumRuleAdjustment(ruleFlags), [ruleFlags]),
    deviationSkill = DEVIATION_SKILL[deviationSkillLevel],
    estimated = isEstimated(ruleFlags, deviationSkill);

  const handsByTrueCount = useMemo(
    () =>
      extraHandsAt === null
        ? undefined
        : [
            { trueCount: -8, hands: playerHands },
            { trueCount: extraHandsAt, hands: highCountHands },
          ],
    [extraHandsAt, highCountHands, playerHands],
  );

  const rules = useMemo(
      () => ({
        ...DEFAULT_ADVANTAGE_RULES,
        decks,
        penetration: dealt / decks,
        dealerHitsSoft17,
        doubleAfterSplit,
        resplitAces,
        lateSurrender,
        blackjackPayout,
      }),
      [decks, dealt, dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, blackjackPayout],
    ),
    scenario: CvcxScenario = useMemo(
      () => ({
        bankroll,
        minimumBet: baseBet,
        playerHands,
        handsByTrueCount,
        handsPerHour,
        hours,
        targetRisk,
        maxSpread,
        wongInAt,
        rules,
        ruleAdjustment,
        deviationSkill,
      }),
      [bankroll, baseBet, playerHands, handsByTrueCount, handsPerHour, hours, targetRisk, maxSpread, wongInAt, rules, ruleAdjustment, deviationSkill],
    ),
    optimalRamp = useMemo(
      () => createOptimalRamp(rules, maxSpread, wongInAt, chipIncrement, ruleAdjustment, deviationSkill),
      [rules, maxSpread, wongInAt, chipIncrement, ruleAdjustment, deviationSkill],
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

  // Viewer-tab bet spread: an the reference product-style per-count "Hands" toggle
  // (1X/2X), independent of the shared playerHands/extraHandsAt controls
  // used by the other tabs. Every row supplies its own schedule breakpoint,
  // which the step-function handsAt() model already supports natively.
  const effectiveHands = (trueCount: number) => handsOverride[trueCount] ?? (trueCount >= 2 ? 2 : 1);
  const viewerHandsSchedule: HandCountPoint[] = useMemo(
      () => custom.rows.map((row) => ({ trueCount: row.trueCount, hands: effectiveHands(row.trueCount) })),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [custom.rows, handsOverride],
    ),
    viewerResult = useMemo(
      () => analyzeCvcx({ ...scenario, handsByTrueCount: viewerHandsSchedule }, ramp, baseBet),
      [scenario, viewerHandsSchedule, ramp, baseBet],
    ),
    maxFrequency = Math.max(...custom.rows.map((row) => row.frequency)),
    tripBankrollRisk = finiteHorizonRisk(
      tripBankrollAmount,
      viewerResult.evPerRound,
      viewerResult.sdPerRound ** 2,
      tripHoursPlayed * handsPerHour,
    );

  const setPreset = (name: string) => {
    setRampName(name);
    setWongInAt(null);
    setRamp(expandPreset(name));
    track("cvcx_preset_selected", { preset: name });
  };
  const useOptimal = () => {
    setRampName("Optimized");
    setRamp(optimalRamp);
    if (Number.isFinite(optimalUnit) && optimalUnit > 0)
      setBaseBet(Math.max(1, Math.round(optimalUnit)));
    track("cvcx_calculation_run", { decks: rules.decks, penetration: rules.penetration, bankroll, baseBet, spread: rampName, handsPerHour });
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
  const scaleRamp = (factor: number) => {
    setRampName("Custom");
    setRamp((current) => current.map((point) => ({ ...point, units: Math.max(0, point.units * factor) })));
  };
  const setAllHands = (value: number) =>
    setHandsOverride(Object.fromEntries(custom.rows.map((row) => [row.trueCount, value])));
  const resetBetSpread = () => {
    setPreset(Object.hasOwn(RAMPS, rampName) ? rampName : "1-8");
    setHandsOverride({});
    track("cvcx_reset", { stage: "bet_spread" });
  };

  const currentCvcxConfig = (): CvcxTemplateConfig => ({
    decks, dealt, bankroll, baseBet, playerHands, handsPerHour, hours, targetRisk, maxSpread, wongInAt,
    rampName, ramp, chipIncrement, extraHandsAt, highCountHands,
    dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, europeanNoHoleCard, blackjackPayout, deviationSkillLevel,
  });
  const saveCvcxTemplate = () => {
    const saved = cvcxLibrary.saveTemplate(currentCvcxConfig(), cvcxTemplateName);
    setCvcxTemplateName(saved.name);
    setCvcxNotice(`Saved “${saved.name}”.`);
    track("cvcx_template_saved", { name: saved.name });
  };
  const loadCvcxTemplate = (template: CvcxTemplate) => {
    track("cvcx_template_loaded", { name: template.name });
    const config = template.config;
    setDecks(config.decks);
    setDealt(config.dealt);
    setBankroll(config.bankroll);
    setBaseBet(config.baseBet);
    setPlayerHands(config.playerHands);
    setHandsPerHour(config.handsPerHour);
    setHours(config.hours);
    setTargetRisk(config.targetRisk);
    setMaxSpread(config.maxSpread);
    setWongInAt(config.wongInAt);
    setRampName(config.rampName);
    setRamp(config.ramp);
    setChipIncrement(config.chipIncrement);
    setExtraHandsAt(config.extraHandsAt);
    setHighCountHands(config.highCountHands);
    setDealerHitsSoft17(config.dealerHitsSoft17);
    setDoubleAfterSplit(config.doubleAfterSplit);
    setResplitAces(config.resplitAces);
    setLateSurrender(config.lateSurrender);
    setEuropeanNoHoleCard(config.europeanNoHoleCard);
    setBlackjackPayout(config.blackjackPayout);
    setDeviationSkillLevel(config.deviationSkillLevel);
    setCvcxTemplateName(template.name);
    setCvcxNotice(`Loaded “${template.name}”.`);
  };
  const testInSessionSimulator = () => {
    const sessionConfig: SessionSimulationConfig = {
      bankroll,
      bettingUnit: baseBet,
      playerHands,
      rounds: 100_000,
      paths: 50,
      roundsPerHour: handsPerHour,
      seed: `cvcx-${Date.now()}`,
      rules,
      ramp,
    };
    simulationLibrary.saveTemplate(sessionConfig, cvcxTemplateName || `${rules.decks}D · ${Math.round(rules.penetration * 100)}% from Lab`);
    track("cvcx_tested_in_simulator", { decks: rules.decks, bankroll, baseBet });
    router.push("/simulation");
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
      totalBet: row.totalBet,
      frequency: row.frequency * 100,
    })),
    goalChance = goalBeforeRuinProbability(
      bankroll,
      goal,
      custom.evPerRound,
      custom.sdPerRound ** 2,
    ),
    goalByTrip = goalByHorizonProbability(
      goal,
      custom.evPerRound,
      custom.sdPerRound ** 2,
      hours * handsPerHour,
    ),
    goalRounds = roundsToGoalProbability(
      goal,
      goalProbability,
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
            chipIncrement,
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
    [rules, maxSpread, wongInAt, chipIncrement, scenario, baseBet],
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
            Professional game analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Game &amp; Bankroll Lab</h1>
          <p className="mt-2 max-w-4xl text-zinc-400">
            A CVCX-style workspace for comparing games, shaping a bet ramp,
            sizing a bankroll, and understanding long-run and trip risk.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-1.5 text-xs font-medium text-emerald-300">
          {decks}D · {dealt} dealt · Hi-Lo
        </div>
      </div>

      <details className="surface group mb-5 rounded-2xl border border-white/[.07]">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-300/10 text-sky-300"><i className="fa-solid fa-floppy-disk" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Templates</h2><p className="truncate text-xs text-zinc-500">{cvcxTemplates.length} saved scenario{cvcxTemplates.length === 1 ? "" : "s"}</p></div>
          <i className="fa-solid fa-chevron-down text-xs text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-white/[.06] p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={cvcxTemplateName} onChange={(event) => setCvcxTemplateName(event.target.value)} placeholder="Scenario name" className="field min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
            <GhostButton onClick={saveCvcxTemplate}><i className="fa-solid fa-floppy-disk mr-2" aria-hidden="true" />Save Template</GhostButton>
          </div>
          {cvcxNotice && <p role="status" className="mt-2 text-xs text-emerald-300">{cvcxNotice}</p>}
          <div className="mt-3 space-y-2">
            {cvcxTemplates.length === 0 && <p className="rounded-xl border border-dashed border-white/[.08] p-3 text-xs text-zinc-600">No saved scenarios yet.</p>}
            {cvcxTemplates.map((template) => (
              <div key={template.id} className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-black/10 p-2.5">
                <button type="button" onClick={() => loadCvcxTemplate(template)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-zinc-200">{template.name}</span>
                  <span className="text-xs text-zinc-600">{template.config.decks}D · {Math.round((template.config.dealt / template.config.decks) * 100)}% · 1–{Math.max(...template.config.ramp.map((point) => point.units))}</span>
                </button>
                <span className="text-xs font-semibold text-emerald-300">Load Template</span>
                <button type="button" aria-label={`Delete ${template.name}`} onClick={() => { if (confirm(`Delete scenario “${template.name}”?`)) { cvcxLibrary.deleteTemplate(template.id); track("cvcx_template_deleted", { name: template.name }); } }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/10 hover:text-red-300">
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/[.07] bg-black/20 p-1.5 sm:grid-cols-4">
        {views.map(([id, label, icon]) => (
          <div key={id} className={`grid grid-cols-[1fr_2.75rem] rounded-xl ${view === id ? "bg-white/[.1] text-white shadow-sm" : "text-zinc-500"}`}>
            <button
              type="button"
              aria-current={view === id ? "page" : undefined}
              onClick={() => { setView(id); track("cvcx_tab_changed", { tab: id }); }}
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

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-400">Your game</p>
          <p className="mt-2 font-semibold">{decks} decks, {percent(dealt / decks, 0)} dealt</p>
          <p className="mt-1 text-sm text-zinc-400">{wongInAt === null ? "Play every count" : `Enter at TC +${wongInAt}`} · {compact(handsPerHour)} rounds/hr</p>
        </div>
        <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-zinc-500">Your bet plan</p>
          <p className="mt-2 font-semibold">{money(baseBet, 0)} unit · 1–{maxSpread} spread</p>
          <p className="mt-1 text-sm text-zinc-400">{extraHandsAt === null ? `${playerHands} hand${playerHands === 1 ? "" : "s"} at every count` : `${playerHands} → ${highCountHands} hands at TC +${extraHandsAt}`}</p>
        </div>
        <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-zinc-500">Plain-English result</p>
          <p className="mt-2 font-semibold text-emerald-300">About {money(custom.hourlyEv, 0)}/hr long run</p>
          <p className="mt-1 text-sm text-zinc-400">{percent(custom.riskOfRuin)} lifetime ruin risk at fixed bets</p>
        </div>
      </div>

      <Panel className="mb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Build your scenario</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Change the game, bankroll, pace, or playing policy. Results update instantly.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${estimated ? "border border-amber-300/20 bg-amber-300/[.08] text-amber-300" : "bg-white/[.05] text-zinc-400"}`}>
            {estimated && <i className="fa-solid fa-triangle-exclamation mr-1.5" aria-hidden="true" />}
            {dealerHitsSoft17 ? "H17" : "S17"} · {doubleAfterSplit ? "DAS" : "no DAS"} · {resplitAces ? "RSA" : "no RSA"} · {lateSurrender ? "LS" : "no LS"} · {europeanNoHoleCard ? "ENHC" : "peek"} · {blackjackPayout === 1.5 ? "3:2" : "6:5"} · {playerHands} hand{playerHands === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
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
          <NumberField label="Base bet" value={baseBet} min={1} step={1} prefix="$" onValueChange={setBaseBet} />
        </div>
        <details className="mt-5 border-t border-white/[.07] pt-4" open>
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-white/[.04] px-4 text-sm font-medium text-zinc-200">
            <span><i className="fa-solid fa-table-cells mr-2 text-emerald-400" aria-hidden="true" />Table rules</span>
            <span className="text-xs text-zinc-500">departing from the audited baseline is estimated</span>
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Switch label="Dealer hits soft 17" checked={dealerHitsSoft17} onChange={setDealerHitsSoft17} />
            <Switch label="Double after split" checked={doubleAfterSplit} onChange={setDoubleAfterSplit} />
            <Switch label="Resplit aces" checked={resplitAces} onChange={setResplitAces} />
            <Switch label="Late surrender" checked={lateSurrender} onChange={setLateSurrender} />
            <Select label="Strategy" value={europeanNoHoleCard ? "enhc" : "peek"} onChange={(event) => setEuropeanNoHoleCard(event.target.value === "enhc")}>
              <option value="peek">American hole card</option>
              <option value="enhc">European no hole card</option>
            </Select>
            <Select label="Blackjack payout" value={blackjackPayout} onChange={(event) => setBlackjackPayout(+event.target.value as 1.5 | 1.2)}>
              <option value={1.5}>3:2</option>
              <option value={1.2}>6:5</option>
            </Select>
            <Select label="Deviations" value={deviationSkillLevel} onChange={(event) => setDeviationSkillLevel(event.target.value as keyof typeof DEVIATION_SKILL)}>
              <option value="beginner">Beginner (70%)</option>
              <option value="intermediate">Intermediate (82%)</option>
              <option value="pro">Pro (92%)</option>
              <option value="perfect">Perfect (100%)</option>
            </Select>
          </div>
          {estimated && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100/80">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-300" aria-hidden="true" />
              The audited simulation only covers H17 · DAS · RSA · LS · American peek · 3:2 · perfect deviation play. These results include an estimated adjustment ({(ruleAdjustment * 100).toFixed(2)}
              {ruleAdjustment >= 0 ? "pp" : "pp"} rule delta{deviationSkill < 1 ? `, ${Math.round(deviationSkill * 100)}% deviation skill` : ""}) rather than a resimulated audit.
            </p>
          )}
        </details>
        <details className="mt-4 border-t border-white/[.07] pt-4">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl bg-white/[.04] px-4 text-sm font-medium text-zinc-200">
            <span><i className="fa-solid fa-sliders mr-2 text-emerald-400" aria-hidden="true" />Advanced playing and risk controls</span>
            <span className="text-xs text-zinc-500">hands, pace, RoR, Wonging, rounding</span>
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Player hands" value={playerHands} onChange={(event) => setPlayerHands(+event.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} hand{value === 1 ? "" : "s"}</option>)}
          </Select>
          <Select label="Add hands at" value={extraHandsAt ?? "never"} onChange={(event) => setExtraHandsAt(event.target.value === "never" ? null : +event.target.value)}>
            <option value="never">Never</option><option value={1}>TC +1</option><option value={2}>TC +2</option><option value={3}>TC +3</option><option value={4}>TC +4</option>
          </Select>
          <Select label="High-count hands" value={highCountHands} disabled={extraHandsAt === null} onChange={(event) => setHighCountHands(+event.target.value)}>
            {[2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value} hands</option>)}
          </Select>
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
          <Select label="Optimal bet rounding" value={chipIncrement} onChange={(event) => setChipIncrement(+event.target.value)}>
            <option value={0}>Exact units</option><option value={0.25}>Quarter units</option><option value={0.5}>Half units</option><option value={1}>Whole units</option>
          </Select>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">Changing hands by count mirrors CVCX-style hand spreading. The model supports up to seven simultaneous hands; shared dealer-result covariance is not available in the source profiles.</p>
        </details>
      </Panel>

      {view === "viewer" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Expected value" value={`${money(viewerResult.hourlyEv, 2)}/hr`} sub={`${percent(viewerResult.playerEdge, 3, true)} player edge${estimated ? " · est." : ""}`} />
            <Metric label="1 standard deviation" value={`± ${money(viewerResult.sdPerHour, 2)}`} sub="per hour" />
            <Metric label="Risk of ruin" value={percent(viewerResult.riskOfRuin)} sub={`${percent(viewerResult.tripRiskOfRuin)} over this trip${estimated ? " · est." : ""}`} />
            <Metric label="Hours 'til N₀" value={compact(viewerResult.nZeroHours)} sub={`${compact(viewerResult.nZeroRounds)} rounds${estimated ? " · est." : ""}`} />
          </div>

          <Panel className="mt-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">Bet spread</h2><p className="mt-1 text-sm text-zinc-500">Set the dollar bet and hand count for every true count. Zero-dollar buckets are observed but not played.</p></div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => setAllHands(1)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">All 1X</button>
                <button type="button" onClick={() => setAllHands(2)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">All 2X</button>
                <button type="button" onClick={() => scaleRamp(0)} className="rounded-lg border border-red-400/20 bg-red-400/[.06] px-3 py-1.5 font-semibold text-red-300 hover:bg-red-400/[.12]">Zero all</button>
                <button type="button" onClick={resetBetSpread} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">Reset</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-zinc-500"><tr><th className="pb-3 text-left">Index</th><th className="pb-3 text-left">Value</th><th className="pb-3 text-left">Hands</th></tr></thead>
                <tbody>
                  {custom.rows.map((row) => (
                    <tr key={row.trueCount} className="border-t border-white/[.06]">
                      <td className={`py-2.5 font-bold ${row.trueCount < 0 ? "text-red-400" : row.trueCount > 0 ? "text-emerald-300" : "text-zinc-300"}`}>{row.label}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <NumberField ariaLabel={`Bet at true count ${row.label}`} value={Math.round(row.bet * 100) / 100} min={0} prefix="$" className="w-32" onValueChange={(value) => updateDollarBet(row.trueCount, value)} />
                          <button
                            type="button"
                            aria-label={`Zero bet at true count ${row.label}`}
                            disabled={row.bet === 0}
                            onClick={() => updateDollarBet(row.trueCount, 0)}
                            className="min-h-9 rounded-lg border border-red-400/20 bg-red-400/[.06] px-2.5 text-xs font-semibold text-red-300 hover:bg-red-400/[.12] disabled:cursor-default disabled:opacity-35"
                          >
                            Zero
                          </button>
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="inline-flex gap-1">
                          <button type="button" aria-pressed={effectiveHands(row.trueCount) === 1} onClick={() => setHandsOverride((current) => ({ ...current, [row.trueCount]: 1 }))} className={`rounded-md border px-2 py-1 text-xs font-semibold ${effectiveHands(row.trueCount) === 1 ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-200" : "border-white/[.08] text-zinc-500 hover:bg-white/[.05]"}`}>1X</button>
                          <button type="button" aria-pressed={effectiveHands(row.trueCount) === 2} onClick={() => setHandsOverride((current) => ({ ...current, [row.trueCount]: 2 }))} className={`rounded-md border px-2 py-1 text-xs font-semibold ${effectiveHands(row.trueCount) === 2 ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-200" : "border-white/[.08] text-zinc-500 hover:bg-white/[.05]"}`}>2X</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel>
              <h2 className="font-semibold">True count distribution</h2>
              <p className="mt-1 text-sm text-zinc-500">How often each count occurs, and the player edge at that count.</p>
              <div className="mt-4 space-y-2">
                {custom.rows.map((row) => (
                  <div key={row.trueCount} className="grid grid-cols-[3rem_1fr_5rem] items-center gap-3 text-sm">
                    <span className={`font-bold ${row.trueCount < 0 ? "text-red-400" : row.trueCount > 0 ? "text-emerald-300" : "text-zinc-300"}`}>{row.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-sky-400/70" style={{ width: `${maxFrequency > 0 ? (row.frequency / maxFrequency) * 100 : 0}%` }} /></div>
                      <span className="w-14 shrink-0 text-right text-xs text-zinc-500">{percent(row.frequency, 2)}</span>
                    </div>
                    <span
                      className={`rounded-lg px-2 py-1 text-right text-xs font-semibold ${row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}`}
                      style={{ background: `${row.advantage >= 0 ? "rgba(16,185,129," : "rgba(239,68,68,"}${Math.min(0.35, Math.abs(row.advantage) * 12)})` }}
                    >
                      {percent(row.advantage, 3, true)}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <h2 className="font-semibold">Trip bankroll risk</h2>
              <p className="mt-1 text-sm text-zinc-500">A smaller, separate stake for a single trip, checked against this bet spread.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <NumberField label="Trip bankroll" value={tripBankrollAmount} min={0} prefix="$" onValueChange={setTripBankrollAmount} />
                <NumberField label="Hours played" value={tripHoursPlayed} min={0.1} step={1} onValueChange={setTripHoursPlayed} />
              </div>
              <div className="mt-4 rounded-xl bg-black/20 p-4 text-sm leading-6 text-zinc-400">
                The risk of losing a trip bankroll of <b className="text-zinc-100">{money(tripBankrollAmount, 0)}</b> in <b className="text-zinc-100">{tripHoursPlayed}</b> hour{tripHoursPlayed === 1 ? "" : "s"} of play under the conditions selected is:
              </div>
              <p className="mt-3 text-3xl font-semibold text-sky-300">{percent(tripBankrollRisk, 2)}</p>
            </Panel>
          </div>

          <Panel className="mt-5">
            <h2 className="font-semibold">Summary statistics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><p className="text-xs uppercase tracking-wide text-zinc-500">Average bet</p><p className="mt-1 text-xl font-semibold">{money(viewerResult.averageBet, 2)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-zinc-500">Player edge</p><p className="mt-1 text-xl font-semibold text-emerald-300">{percent(viewerResult.playerEdge, 3, true)}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-zinc-500">EV per hand</p><p className="mt-1 text-xl font-semibold text-emerald-300">{money(viewerResult.evPerRound, 2)}</p></div>
            </div>
          </Panel>

          <div className="mb-2 mt-8 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500">Deeper detail</p><h2 className="mt-1 text-lg font-semibold">Bankroll path &amp; optimized comparison</h2></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="c-SCORE" value={custom.cScore.toFixed(2)} sub={`DI ${custom.desirabilityIndex.toFixed(2)}${estimated ? " · est." : ""}`} />
            <Metric label="Average total action" value={money(custom.averageBet, 2)} sub={`${percent(custom.playedFrequency, 1)} rounds played · ${playerHands} hand${playerHands === 1 ? "" : "s"}`} />
            <Metric label="Trip EV" value={money(custom.tripEv, 0)} sub={`${percent(custom.chanceOfProfit)} chance of profit`} />
            <Metric label="Risk-adjusted EV" value={money(custom.certaintyEquivalentHourly, 2)} sub={`${percent(custom.certaintyEquivalentRatio, 0)} CE / win rate`} />
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
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Optimal vs. custom</h2><p className="mt-1 text-sm text-zinc-500">Risk-sized Kelly-weight ramp.</p></div><div className="flex gap-2"><GhostButton onClick={useOptimal} className="px-3 text-xs">Use optimal</GhostButton><GhostButton onClick={testInSessionSimulator} className="px-3 text-xs"><i className="fa-solid fa-dice mr-2" aria-hidden="true" />Test in Session Simulator</GhostButton></div></div>
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
              <Select label="Bet rounding" value={chipIncrement} onChange={(event) => setChipIncrement(+event.target.value)}>
                <option value={0}>Exact units</option><option value={0.25}>Quarter units</option><option value={0.5}>Half units</option><option value={1}>Whole units</option>
              </Select>
              <Button onClick={useOptimal}>Generate optimized ramp</Button>
            </div>
            <div className="mt-5 rounded-xl bg-emerald-400/[.07] p-4 text-sm leading-6 text-emerald-200"><b>{money(optimalUnit, 2)}</b> risk-sized base bet per hand for {playerHands} simultaneous hand{playerHands === 1 ? "" : "s"} at a {percent(targetRisk)} lifetime RoR target.</div>
          </Panel>
          <Panel className="overflow-x-auto">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">Bets by true count</h2><p className="mt-1 text-sm text-zinc-500">Zero-dollar buckets are observed but not played.</p></div>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => scaleRamp(0.5)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">½X</button>
                <button type="button" onClick={() => scaleRamp(2)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">2X</button>
                <button type="button" onClick={() => setPreset(Object.hasOwn(RAMPS, rampName) ? rampName : "1-8")} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">Reset to defaults</button>
              </div>
            </div>
            <table className="w-full min-w-[940px] text-right text-sm">
              <thead className="text-zinc-500"><tr><th className="pb-3 text-left">TC</th><th className="pb-3">Frequency</th><th className="pb-3">Advantage</th><th className="pb-3">Hands</th><th className="pb-3">Units</th><th className="pb-3">Bet / hand</th><th className="pb-3">Quick set</th><th className="pb-3">Total action</th><th className="pb-3">EV contribution</th></tr></thead>
              <tbody>{custom.rows.map((row) => <tr key={row.trueCount} className="border-t border-white/[.06]"><td className="py-2.5 text-left font-semibold">{row.label}</td><td>{percent(row.frequency, 2)}</td><td className={row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}>{percent(row.advantage, 3, true)}</td><td>{row.playerHands}</td><td>{row.units.toFixed(2)}</td><td className="py-2"><NumberField ariaLabel={`Bet per hand at true count ${row.label}`} value={Math.round(row.bet * 100) / 100} min={0} prefix="$" className="ml-auto w-32" onValueChange={(value) => updateDollarBet(row.trueCount, value)} /></td><td className="whitespace-nowrap py-2"><button type="button" aria-label={`Zero bet at true count ${row.label}`} disabled={row.bet === 0} onClick={() => updateDollarBet(row.trueCount, 0)} className="rounded-md border border-red-400/20 bg-red-400/[.06] px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-400/[.12] disabled:cursor-default disabled:opacity-35">Zero</button><button type="button" onClick={() => updateDollarBet(row.trueCount, baseBet)} className="ml-1.5 rounded-md border border-white/[.08] px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/[.05]">1X</button><button type="button" onClick={() => updateDollarBet(row.trueCount, baseBet * 2)} className="ml-1.5 rounded-md border border-white/[.08] px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-white/[.05]">2X</button></td><td>{money(row.totalBet, 0)}</td><td>{money(row.frequency * row.advantage * row.totalBet, 3)}</td></tr>)}</tbody>
            </table>
          </Panel>
          <Panel className="xl:col-span-2">
            <h2 className="mb-4 font-semibold">Count economics</h2>
            <div className="h-72"><ResponsiveContainer><ComposedChart data={countChart}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="count" stroke="#71717a" tickLine={false} axisLine={false}/><YAxis yAxisId="edge" stroke="#71717a" tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false}/><YAxis yAxisId="bet" orientation="right" stroke="#71717a" tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#151916", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }}/><Legend/><Bar yAxisId="bet" dataKey="totalBet" name="Total action" fill="#3f6f4a" radius={[4,4,0,0]}/><Line yAxisId="edge" dataKey="advantage" name="Advantage %" stroke="#a8ee72" strokeWidth={2} dot={false}/></ComposedChart></ResponsiveContainer></div>
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
              <Select label="Goal confidence" value={goalProbability} onChange={(event) => setGoalProbability(+event.target.value)}>
                <option value={0.6}>60%</option><option value={0.75}>75%</option><option value={0.8}>80%</option><option value={0.9}>90%</option><option value={0.95}>95%</option>
              </Select>
              <NumberField label="Actual trip result" value={actualResult} prefix="$" onValueChange={setActualResult}/>
              <div className="rounded-xl bg-black/20 p-4 text-sm leading-6 text-zinc-400">Trip horizon: <b className="text-zinc-100">{hours.toLocaleString()} hours</b><br/>Observed rounds: <b className="text-zinc-100">{compact(hours * handsPerHour)}</b></div>
            </div>
          </Panel>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric label="Required bankroll" value={money(custom.requiredBankroll, 0)} sub={`for ${percent(targetRisk)} lifetime RoR`} />
              <Metric label="Trip ruin risk" value={percent(custom.tripRiskOfRuin, 3)} sub={`${compact(hours * handsPerHour)} observed rounds`} />
              <Metric label="Reach goal first" value={percent(goalChance)} sub={`before ruin, no time limit`} />
              <Metric label="Goal by this trip" value={percent(goalByTrip)} sub="terminal normal estimate" />
              <Metric label="Time to goal" value={Number.isFinite(goalRounds) ? `${compact(goalRounds / handsPerHour)} hr` : "Not available"} sub={`for ${percent(goalProbability, 0)} terminal confidence`} />
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
              <thead className="text-zinc-500"><tr><th className="pb-3 text-left">Game</th><th className="pb-3">Penetration</th><th className="pb-3">Play rate</th><th className="pb-3">Average action</th><th className="pb-3">$/hour</th><th className="pb-3">RoR</th><th className="pb-3">N₀</th><th className="pb-3">c-SCORE</th></tr></thead>
              <tbody>{[...comparisons].sort((a,b) => b.cScore - a.cScore).map((row, index) => <tr key={row.name} className="border-t border-white/[.06]"><td className="py-3 text-left"><span className="mr-2 text-xs text-zinc-600">#{index + 1}</span><b>{row.name}</b></td><td>{percent(row.penetration, 1)}</td><td>{percent(row.playedFrequency, 1)}</td><td>{money(row.averageBet, 2)}</td><td className="text-emerald-300">{money(row.hourlyEv, 2)}</td><td>{percent(row.riskOfRuin)}</td><td>{compact(row.nZeroRounds)}</td><td className="font-semibold">{row.cScore.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </Panel>
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-zinc-500">
        Scope: this is a post-simulation analyzer for the nine included 6D/8D H17 Hi-Lo profiles, not a general rules simulator. EV and variance use {COEFFICIENT_METADATA.totalRounds.toLocaleString()} audited resolved rounds at the audited baseline (H17 · DAS · RSA · LS · American peek · 3:2 · perfect deviation play). Multiple-hand results retain shared true-count-state variance and treat hand outcomes as conditionally independent; dealer-result covariance is unavailable. Wonging treats skipped rounds as observed opportunities. Risk, goals, and result ranges use continuous-diffusion or normal approximations and do not model heat, backoffs, travel time, or bankroll resizing.
        {estimated && " Table rules and deviation skill currently set away from that baseline apply a flat literature-estimated edge adjustment rather than a resimulated audit — treat those numbers as directional, not audited."}
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
