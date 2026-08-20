"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track";
import {
  CvcxScenario,
  analyzeCvcx,
  createOptimalRamp,
  riskSizedUnit,
} from "@/lib/blackjack/cvcx";
import {
  CountRow,
  DEFAULT_ADVANTAGE_RULES,
  HandCountPoint,
  RampPoint,
  RAMPS,
  unitsAt,
  zeroBetsBelow,
} from "@/lib/blackjack/advantage";
import { GAME_OPTIONS } from "@/lib/blackjack/coefficients";
import { AP_TOOLBOX_H17_PRO_METADATA } from "@/lib/blackjack/apToolboxH17ProCoefficients";
import { isEstimated, sumRuleAdjustment } from "@/lib/blackjack/ruleAdjustments";
import {
  cvcxLibrary,
  CvcxTemplate,
  CvcxTemplateConfig,
  templateHandSchedule,
} from "@/lib/blackjack/cvcxLibrary";
import { simulationLibrary } from "@/lib/blackjack/simulationLibrary";
import type { SessionSimulationConfig } from "@/lib/blackjack/sessionSimulation";
import { Button, GhostButton, NumberField, PinnedStat, Section, Select, Switch } from "./ui";
import { ConfirmModal } from "./ConfirmModal";
import { BetSpreadTable } from "./BetSpreadTable";
import { venuePresetLibrary, VenuePreset } from "@/lib/blackjack/venuePresets";

/** The seventeen true-count buckets the audited coefficients are keyed on. */
const TRUE_COUNTS = Array.from({ length: 17 }, (_, index) => index - 8);

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
  TRUE_COUNTS.map((trueCount) => ({
    trueCount,
    units: unitsAt(trueCount, RAMPS[name]),
  }));
/** Largest multiple of the base bet the ramp actually reaches. */
const rampSpread = (ramp: RampPoint[]) =>
  Math.max(0, ...ramp.map((point) => point.units));
const unitLabel = (value: number) =>
  value % 1 === 0 ? String(value) : value.toFixed(2);
/** The spread the player actually wagers, ignoring counts that are sat out. */
const playedSpreadLabel = (ramp: RampPoint[]) => {
  const played = ramp.map((point) => point.units).filter((units) => units > 0);
  if (played.length === 0) return "no bets";
  return `${unitLabel(Math.min(...played))}–${unitLabel(Math.max(...played))}`;
};

/** The bet ramp and hand schedule, plus every per-count number they produce. */
function BetSpreadBody({
  rows,
  rampName,
  maxSpread,
  chipIncrement,
  wongInAt,
  optimalUnit,
  onPreset,
  onMaxSpread,
  onChipIncrement,
  onWongIn,
  onGenerate,
  onBetChange,
  onHandsChange,
  onScale,
  onReset,
}: {
  rows: CountRow[];
  rampName: string;
  maxSpread: number;
  chipIncrement: number;
  wongInAt: number | null;
  optimalUnit: number;
  onPreset: (name: string) => void;
  onMaxSpread: (value: number) => void;
  onChipIncrement: (value: number) => void;
  onWongIn: (value: number | null) => void;
  onGenerate: () => void;
  onBetChange: (trueCount: number, bet: number) => void;
  onHandsChange: (trueCount: number, hands: number) => void;
  onScale: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-500">
          The wager and number of hands at every true count. Zero-dollar counts
          are watched but not played.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => onScale(0.5)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">½X</button>
          <button type="button" onClick={() => onScale(2)} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">2X</button>
          <button type="button" onClick={onReset} className="rounded-lg border border-white/[.08] px-3 py-1.5 font-semibold text-zinc-300 hover:bg-white/[.05]">Reset</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Select
          label="Preset"
          value={Object.hasOwn(RAMPS, rampName) ? rampName : "custom"}
          onChange={(event) =>
            event.target.value !== "custom" && onPreset(event.target.value)
          }
        >
          {Object.keys(RAMPS).map((name) => (
            <option key={name} value={name}>{name} spread</option>
          ))}
          {!Object.hasOwn(RAMPS, rampName) && (
            <option value="custom">{rampName}</option>
          )}
        </Select>
        <Select
          label="Enter the game at"
          value={wongInAt ?? "play-all"}
          onChange={(event) =>
            onWongIn(
              event.target.value === "play-all" ? null : +event.target.value,
            )
          }
        >
          <option value="play-all">Play every count</option>
          <option value={0}>TC 0+</option>
          <option value={1}>TC +1+</option>
          <option value={2}>TC +2+</option>
          <option value={3}>TC +3+</option>
        </Select>
        <NumberField
          label="Maximum spread"
          value={maxSpread}
          min={1}
          max={100}
          onValueChange={onMaxSpread}
        />
        <Select
          label="Bet rounding"
          value={chipIncrement}
          onChange={(event) => onChipIncrement(+event.target.value)}
        >
          <option value={0}>Exact units</option>
          <option value={0.25}>Quarter units</option>
          <option value={0.5}>Half units</option>
          <option value={1}>Whole units</option>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={onGenerate}>Generate optimal ramp</Button>
        <p className="text-sm text-zinc-500">
          Kelly-weighted, capped at the maximum spread, sized to a{" "}
          <b className="text-zinc-300">{money(optimalUnit, 2)}</b> base bet for
          the target risk of ruin.
        </p>
      </div>

      <div className="mt-5">
        <BetSpreadTable rows={rows} onBetChange={onBetChange} onHandsChange={onHandsChange} />
      </div>
    </>
  );
}

function TrueCountDistributionBody({
  rows,
  maxFrequency,
}: {
  rows: CountRow[];
  maxFrequency: number;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.trueCount}
          className="grid grid-cols-[3rem_1fr_5rem] items-center gap-3 text-sm"
        >
          <span
            className={`font-bold ${row.trueCount < 0 ? "text-red-400" : row.trueCount > 0 ? "text-emerald-300" : "text-zinc-300"}`}
          >
            {row.label}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[.06]">
              <div
                className="h-full rounded-full bg-sky-400/70"
                style={{
                  width: `${maxFrequency > 0 ? (row.frequency / maxFrequency) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xs text-zinc-500">
              {percent(row.frequency, 2)}
            </span>
          </div>
          <span
            className={`rounded-lg px-2 py-1 text-right text-xs font-semibold ${row.advantage >= 0 ? "text-emerald-300" : "text-red-300"}`}
            style={{
              background: `${row.advantage >= 0 ? "rgba(16,185,129," : "rgba(239,68,68,"}${Math.min(0.35, Math.abs(row.advantage) * 12)})`,
            }}
          >
            {percent(row.advantage, 3, true)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CvcxLab() {
  const router = useRouter();
  const [bankroll, setBankroll] = useState(25000),
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
    [chipIncrement, setChipIncrement] = useState(0.5),
    [handsByCount, setHandsByCount] = useState<Record<number, number>>({}),
    [dealerHitsSoft17, setDealerHitsSoft17] = useState(true),
    [doubleAfterSplit, setDoubleAfterSplit] = useState(true),
    [resplitAces, setResplitAces] = useState(true),
    [lateSurrender, setLateSurrender] = useState(true),
    [europeanNoHoleCard, setEuropeanNoHoleCard] = useState(false),
    [blackjackPayout, setBlackjackPayout] = useState<1.5 | 1.2>(1.5),
    [doubleRule, setDoubleRule] = useState<"any2" | "9to11" | "10to11">("any2"),
    [cvcxTemplateName, setCvcxTemplateName] = useState(""),
    [cvcxTemplates, setCvcxTemplates] = useState<CvcxTemplate[]>([]),
    [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<CvcxTemplate>(),
    [venuePresets, setVenuePresets] = useState<VenuePreset[]>([]),
    [venuePresetName, setVenuePresetName] = useState(""),
    [cvcxNotice, setCvcxNotice] = useState<string>();

  useEffect(() => {
    const refresh = () => setCvcxTemplates(cvcxLibrary.templates());
    refresh();
    addEventListener(cvcxLibrary.event, refresh);
    return () => removeEventListener(cvcxLibrary.event, refresh);
  }, []);
  useEffect(() => {
    const refresh = () => setVenuePresets(venuePresetLibrary.presets());
    refresh();
    addEventListener(venuePresetLibrary.event, refresh);
    return () => removeEventListener(venuePresetLibrary.event, refresh);
  }, []);

  const ruleFlags = useMemo(
      () => ({
        dealerStandsSoft17: !dealerHitsSoft17,
        noDoubleAfterSplit: !doubleAfterSplit,
        noResplitAces: !resplitAces,
        noLateSurrender: !lateSurrender,
        europeanNoHoleCard,
        blackjackPays6to5: blackjackPayout === 1.2,
        doubleOnly9to11: doubleRule === "9to11",
        doubleOnly10to11: doubleRule === "10to11",
      }),
      [dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, europeanNoHoleCard, blackjackPayout, doubleRule],
    ),
    ruleAdjustment = useMemo(() => sumRuleAdjustment(ruleFlags), [ruleFlags]),
    estimated = isEstimated(ruleFlags);

  // The bet-spread table is the only place hand counts are set, so this is the
  // whole schedule and every metric on the page is priced from it.
  const handsSchedule = useMemo<HandCountPoint[]>(
    () =>
      TRUE_COUNTS.map((trueCount) => ({
        trueCount,
        hands: handsByCount[trueCount] ?? 1,
      })),
    [handsByCount],
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
    // Wonging is a property of the game actually being played, so it applies to
    // the live ramp: skipped counts drop out of EV, variance, and "rounds
    // played" instead of only reshaping the generated ramp.
    activeRamp = useMemo(
      () => (wongInAt === null ? ramp : zeroBetsBelow(ramp, wongInAt)),
      [ramp, wongInAt],
    ),
    scenario: CvcxScenario = useMemo(
      () => ({
        bankroll,
        minimumBet: baseBet,
        playerHands: 1,
        handsByTrueCount: handsSchedule,
        handsPerHour,
        hours,
        targetRisk,
        maxSpread,
        wongInAt,
        rules,
        ruleAdjustment,
      }),
      [bankroll, baseBet, handsSchedule, handsPerHour, hours, targetRisk, maxSpread, wongInAt, rules, ruleAdjustment],
    ),
    result = useMemo(
      () => analyzeCvcx(scenario, activeRamp, baseBet),
      [scenario, activeRamp, baseBet],
    ),
    optimalRamp = useMemo(
      () => createOptimalRamp(rules, maxSpread, wongInAt, chipIncrement, ruleAdjustment),
      [rules, maxSpread, wongInAt, chipIncrement, ruleAdjustment],
    ),
    optimalUnit = useMemo(
      () => riskSizedUnit(scenario, optimalRamp),
      [scenario, optimalRamp],
    ),
    maxFrequency = Math.max(...result.rows.map((row) => row.frequency));
  const setPreset = (name: string) => {
    setRampName(name);
    setRamp(expandPreset(name));
    setMaxSpread(rampSpread(RAMPS[name]));
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
    setRamp((current) =>
      current.map((point) => ({ ...point, units: Math.max(0, point.units * factor) })),
    );
  };
  const resetBetSpread = () => {
    setPreset(Object.hasOwn(RAMPS, rampName) ? rampName : "1-8");
    setWongInAt(null);
    setHandsByCount({});
    track("cvcx_reset", { stage: "bet_spread" });
  };

  const currentCvcxConfig = (): CvcxTemplateConfig => ({
    decks, dealt, bankroll, baseBet, handsPerHour, hours, targetRisk, maxSpread, wongInAt,
    rampName, ramp, chipIncrement, hands: handsSchedule,
    dealerHitsSoft17, doubleAfterSplit, resplitAces, lateSurrender, europeanNoHoleCard, blackjackPayout, deviationSkillLevel: "beginner", doubleRule,
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
    setHandsPerHour(config.handsPerHour);
    setHours(config.hours);
    setTargetRisk(config.targetRisk);
    setMaxSpread(config.maxSpread);
    setWongInAt(config.wongInAt);
    setRampName(config.rampName);
    setRamp(config.ramp);
    setChipIncrement(config.chipIncrement);
    setHandsByCount(
      Object.fromEntries(
        templateHandSchedule(config).map((point) => [point.trueCount, point.hands]),
      ),
    );
    setDealerHitsSoft17(config.dealerHitsSoft17);
    setDoubleAfterSplit(config.doubleAfterSplit);
    setResplitAces(config.resplitAces);
    setLateSurrender(config.lateSurrender);
    setEuropeanNoHoleCard(config.europeanNoHoleCard);
    setBlackjackPayout(config.blackjackPayout);
    setDoubleRule(config.doubleRule ?? "any2");
    setCvcxTemplateName(template.name);
    setCvcxNotice(`Loaded “${template.name}”.`);
  };
  const loadVenuePreset = (id: string) => {
    const preset = venuePresets.find((item) => item.id === id);
    if (!preset) return;
    const nextDecks = preset.rules.decks === 8 ? 8 : 6;
    setDecks(nextDecks);
    setDealt(preset.rules.penetration * nextDecks);
    setDealerHitsSoft17(preset.rules.dealerHitsSoft17);
    setDoubleAfterSplit(preset.rules.doubleAfterSplit);
    setResplitAces(preset.rules.resplitAces);
    setLateSurrender(preset.rules.lateSurrender);
    setBlackjackPayout(preset.rules.blackjackPayout);
    setRamp(preset.ramp);
    setRampName("Custom");
    setMaxSpread(rampSpread(preset.ramp));
    setCvcxNotice(`Loaded venue “${preset.name}”.`);
  };
  const saveVenuePreset = () => {
    const name = venuePresetName.trim();
    if (!name) return;
    venuePresetLibrary.savePreset(name, rules, ramp);
    setVenuePresetName("");
    setCvcxNotice(`Saved venue “${name}”.`);
  };
  const testInSessionSimulator = () => {
    const sessionConfig: SessionSimulationConfig = {
      bankroll,
      bettingUnit: baseBet,
      playerHands: 1,
      rounds: 100_000,
      paths: 50,
      roundsPerHour: handsPerHour,
      seed: `cvcx-${Date.now()}`,
      rules,
      ramp: activeRamp,
    };
    simulationLibrary.saveTemplate(sessionConfig, cvcxTemplateName || `${rules.decks}D · ${Math.round(rules.penetration * 100)}% from Lab`);
    track("cvcx_tested_in_simulator", { decks: rules.decks, bankroll, baseBet });
    router.push("/simulation");
  };

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
            ruleAdjustment,
          );
          return {
            name: `${comparisonDecks}D · ${option.dealt} dealt`,
            decks: comparisonDecks,
            penetration: option.dealt / comparisonDecks,
            ...analyzeCvcx({ ...scenario, rules: comparisonRules }, comparisonRamp, baseBet),
          };
        }),
      ),
    [rules, maxSpread, wongInAt, chipIncrement, ruleAdjustment, scenario, baseBet],
  );

  const estimateSuffix = estimated ? " · est." : "";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-400">
            Professional game analysis
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Game &amp; Bankroll Lab</h1>
          <p className="mt-2 max-w-4xl text-zinc-400">
            Size a bankroll and a bet ramp against a specific game, and see the
            edge, the swing, and the risk it carries.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[.07] px-3 py-1.5 text-xs font-medium text-emerald-300">
          {decks}D · {dealt} dealt · Hi-Lo
        </div>
      </div>

      {/* Pinned directly under the app header so the four numbers everything
          else exists to produce stay readable while the reader works down the
          page. z-20 keeps it below the z-30 header it tucks under. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 border-y border-white/[.07] bg-[#0c100d]/95 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <PinnedStat
            label="Expected value"
            value={`${money(result.hourlyEv, 2)}/hr`}
            sub={`${percent(result.playerEdge, 3, true)} edge${estimateSuffix}`}
          />
          <PinnedStat
            label="1 standard deviation"
            value={`± ${money(result.sdPerHour, 2)}`}
            sub="per hour"
          />
          <PinnedStat
            label="Risk of ruin"
            value={percent(result.riskOfRuin)}
            sub={`${percent(result.tripRiskOfRuin)} in ${compact(hours)} hr${estimateSuffix}`}
          />
          <PinnedStat
            label="Required bankroll"
            value={money(result.requiredBankroll, 0)}
            sub={`for ${percent(targetRisk)} lifetime ruin`}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Section
          title="Scenario summary"
          summary={`${decks}D ${percent(dealt / decks, 0)} · ${money(baseBet, 0)} unit · ${playedSpreadLabel(activeRamp)} spread`}
          icon="fa-circle-info"
          tone="accent"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-400">Your game</p>
              <p className="mt-2 font-semibold">{decks} decks, {percent(dealt / decks, 0)} dealt</p>
              <p className="mt-1 text-sm text-zinc-400">
                {wongInAt === null ? "Play every count" : `Enter at TC +${wongInAt}`} · {compact(handsPerHour)} rounds/hr · {percent(result.playedFrequency, 0)} of rounds played
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-zinc-500">Your bet plan</p>
              <p className="mt-2 font-semibold">{money(baseBet, 0)} unit · {playedSpreadLabel(activeRamp)} spread</p>
              <p className="mt-1 text-sm text-zinc-400">{money(result.averageBet, 2)} average action per round</p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-zinc-500">Plain-English result</p>
              <p className="mt-2 font-semibold text-emerald-300">About {money(result.hourlyEv, 0)}/hr long run</p>
              <p className="mt-1 text-sm text-zinc-400">{percent(result.riskOfRuin)} chance of losing the whole bankroll at these stakes</p>
            </div>
          </div>
        </Section>

        <Section
          title="Bankroll and pace"
          summary={`${money(bankroll, 0)} bankroll · ${money(baseBet, 0)} unit · ${compact(handsPerHour)} rounds/hr · ${compact(hours)} hours`}
          icon="fa-wallet"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField label="Available bankroll" value={bankroll} min={1} prefix="$" onValueChange={setBankroll} />
            <NumberField label="Unit amount" value={baseBet} min={1} step={1} prefix="$" onValueChange={setBaseBet} />
            <div className="grid min-w-0 gap-2 text-[.8rem] font-medium tracking-[.01em] text-zinc-400">
              <span># of units</span>
              <div className="field flex min-h-11 w-full items-center rounded-xl px-3 text-zinc-400">{baseBet > 0 ? Math.round(bankroll / baseBet).toLocaleString() : "—"}</div>
            </div>
            <NumberField label="Rounds per hour" value={handsPerHour} min={1} onValueChange={setHandsPerHour} />
            <NumberField label="Hours played" value={hours} min={0.1} step={1} onValueChange={setHours} />
            <Select label="Target risk of ruin" value={targetRisk} onChange={(event) => setTargetRisk(+event.target.value)}>
              <option value={0.01}>1%</option>
              <option value={0.025}>2.5%</option>
              <option value={0.05}>5%</option>
              <option value={0.1}>10%</option>
              <option value={0.135}>13.5% (Kelly)</option>
              <option value={0.25}>25%</option>
            </Select>
          </div>
        </Section>

        <Section
          title="Table rules"
          summary={`${dealerHitsSoft17 ? "H17" : "S17"} · ${doubleAfterSplit ? "DAS" : "no DAS"} · ${resplitAces ? "RSA" : "no RSA"} · ${lateSurrender ? "LS" : "no LS"} · ${blackjackPayout === 1.5 ? "3:2" : "6:5"} · AP Toolbox H17 Pro · ${estimated ? "estimated" : "audited"}`}
          icon="fa-table-cells"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Number of decks"
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
            <div className="field grid min-h-11 content-center rounded-xl px-3 text-sm text-zinc-300">
              <span className="text-xs text-zinc-500">Playing decisions</span>
              Audited AP Toolbox H17 Pro deviations
            </div>
            <Switch label="Dealer hits soft 17" checked={dealerHitsSoft17} onChange={setDealerHitsSoft17} />
            <Switch label="Double after splitting" checked={doubleAfterSplit} onChange={setDoubleAfterSplit} />
            <Switch label="Resplitting aces" checked={resplitAces} onChange={setResplitAces} />
            <Switch label="Late surrender" checked={lateSurrender} onChange={setLateSurrender} />
            <Select label="Strategy" value={europeanNoHoleCard ? "enhc" : "peek"} onChange={(event) => setEuropeanNoHoleCard(event.target.value === "enhc")}>
              <option value="peek">American hole card</option>
              <option value="enhc">European no hole card</option>
            </Select>
            <Select label="Blackjack payout" value={blackjackPayout} onChange={(event) => setBlackjackPayout(+event.target.value as 1.5 | 1.2)}>
              <option value={1.5}>3:2</option>
              <option value={1.2}>6:5</option>
            </Select>
            <Select label="Double rule" value={doubleRule} onChange={(event) => setDoubleRule(event.target.value as "any2" | "9to11" | "10to11")}>
              <option value="any2">Double any first 2 cards</option>
              <option value="9to11">Double only 9-11</option>
              <option value="10to11">Double only 10-11</option>
            </Select>
          </div>
          {estimated && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100/80">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-300" aria-hidden="true" />
              <span>
                {ruleAdjustment !== 0 && `Rules that depart from the audited baseline apply a flat literature-estimated ${(ruleAdjustment * 100).toFixed(2)}pp edge delta rather than a resimulated audit. `}
              </span>
            </p>
          )}
        </Section>

        <Section
          title="Bet spread"
          // A preset's name is its spread, so naming it here would just repeat
          // the range; only a Custom/Optimized ramp needs saying out loud.
          summary={`${Object.hasOwn(RAMPS, rampName) ? "" : `${rampName} · `}${playedSpreadLabel(activeRamp)} spread · ${wongInAt === null ? "play every count" : `enter at TC +${wongInAt}`} · ${percent(result.playedFrequency, 0)} of rounds played`}
          icon="fa-layer-group"
          tone="accent"
        >
          <BetSpreadBody
            rows={result.rows}
            rampName={rampName}
            maxSpread={maxSpread}
            chipIncrement={chipIncrement}
            wongInAt={wongInAt}
            optimalUnit={optimalUnit}
            onPreset={setPreset}
            onMaxSpread={setMaxSpread}
            onChipIncrement={setChipIncrement}
            onWongIn={setWongInAt}
            onGenerate={useOptimal}
            onBetChange={updateDollarBet}
            onHandsChange={(trueCount, hands) =>
              setHandsByCount((current) => ({ ...current, [trueCount]: hands }))
            }
            onScale={scaleRamp}
            onReset={resetBetSpread}
          />
        </Section>

        <Section
          title={`Where this lands over ${compact(hours)} hours`}
          summary={`${money(result.tripEv, 0)} expected · ${percent(result.chanceOfProfit)} chance of finishing ahead`}
          icon="fa-chart-simple"
          tone="accent"
        >
          <p className="text-sm text-zinc-500">
            Expected result {money(result.tripEv, 0)}, with a {percent(result.chanceOfProfit)} chance of finishing ahead. These are ranges, not limits.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([["68% range", 1], ["90% range", 1.645], ["95% range", 1.96]] as const).map(([label, z]) => (
              <div key={label} className="rounded-2xl bg-black/20 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-2 font-semibold">{money(result.tripEv - z * result.standardDeviation, 0)}</p>
                <p className="text-zinc-500">to</p>
                <p className="font-semibold">{money(result.tripEv + z * result.standardDeviation, 0)}</p>
              </div>
            ))}
          </div>
          <dl className="mt-5 grid gap-4 border-t border-white/[.06] pt-4 sm:grid-cols-3">
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Average action / round</dt><dd className="mt-1 text-xl font-semibold">{money(result.averageBet, 2)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">Rounds for EV to match one σ (N₀)</dt><dd className="mt-1 text-xl font-semibold">{compact(result.nZeroRounds)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-zinc-500">c-SCORE</dt><dd className="mt-1 text-xl font-semibold">{result.cScore.toFixed(1)}</dd></div>
          </dl>
        </Section>

        <Section
          title="True count distribution"
          summary="How often each count occurs, and the player edge at that count"
          icon="fa-chart-column"
          open={false}
        >
          <TrueCountDistributionBody rows={result.rows} maxFrequency={maxFrequency} />
        </Section>

        <Section
          title="Compare against the other games"
          summary="Same bankroll and unit; each game gets its own Kelly ramp"
          icon="fa-ranking-star"
          open={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-right text-sm">
              <thead className="text-zinc-500"><tr><th className="pb-3 text-left">Game</th><th className="pb-3">$/hour</th><th className="pb-3">RoR</th><th className="pb-3">N₀</th><th className="pb-3">c-SCORE</th></tr></thead>
              <tbody>
                {[...comparisons].sort((a, b) => b.cScore - a.cScore).map((row, index) => {
                  const active = row.decks === decks && Math.abs(row.penetration - dealt / decks) < 0.001;
                  return (
                    <tr key={row.name} className={`border-t border-white/[.06] ${active ? "text-emerald-300" : ""}`}>
                      <td className="py-3 text-left"><span className="mr-2 text-xs text-zinc-600">#{index + 1}</span><b>{row.name}</b></td>
                      <td>{money(row.hourlyEv, 2)}</td>
                      <td>{percent(row.riskOfRuin)}</td>
                      <td>{compact(row.nZeroRounds)}</td>
                      <td className="font-semibold">{row.cScore.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Saved scenarios and venues"
          summary={`${cvcxTemplates.length} saved scenario${cvcxTemplates.length === 1 ? "" : "s"} · ${venuePresets.length} venue${venuePresets.length === 1 ? "" : "s"}`}
          icon="fa-floppy-disk"
          open={false}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={cvcxTemplateName} onChange={(event) => setCvcxTemplateName(event.target.value)} placeholder="Scenario name" className="field min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
            <GhostButton onClick={saveCvcxTemplate}><i className="fa-solid fa-floppy-disk mr-2" aria-hidden="true" />Save scenario</GhostButton>
          </div>
          {cvcxNotice && <p role="status" className="mt-2 text-xs text-emerald-300">{cvcxNotice}</p>}
          <div className="mt-3 space-y-2">
            {cvcxTemplates.length === 0 && <p className="rounded-xl border border-dashed border-white/[.08] p-3 text-xs text-zinc-600">No saved scenarios yet.</p>}
            {cvcxTemplates.map((template) => (
              <div key={template.id} className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-black/10 p-2.5">
                <button type="button" onClick={() => loadCvcxTemplate(template)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-zinc-200">{template.name}</span>
                  <span className="text-xs text-zinc-600">{template.config.decks}D · {Math.round((template.config.dealt / template.config.decks) * 100)}% · 1–{unitLabel(rampSpread(template.config.ramp))}</span>
                </button>
                <span className="text-xs font-semibold text-emerald-300">Load</span>
                <button type="button" aria-label={`Delete ${template.name}`} onClick={() => setPendingDeleteTemplate(template)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-600 hover:bg-red-400/10 hover:text-red-300">
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {venuePresets.length > 0 && (
            <div className="mt-4">
              <Select label="Load a venue's rules and ramp" defaultValue="" onChange={(event) => event.target.value && loadVenuePreset(event.target.value)}>
                <option value="">Choose a venue…</option>
                {venuePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </Select>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input value={venuePresetName} onChange={(event) => setVenuePresetName(event.target.value)} placeholder="Venue name (e.g. Downtown casino)" className="field min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
            <GhostButton onClick={saveVenuePreset} disabled={!venuePresetName.trim()}>Save venue</GhostButton>
          </div>
        </Section>

        <Section
          title="Scope and method"
          summary="What these numbers are audited on, and what they approximate"
          icon="fa-flask"
          open={false}
        >
          <p className="text-xs leading-5 text-zinc-500">
            This is a post-simulation analyzer for the nine included 6D/8D H17 Hi-Lo profiles, not a general rules simulator. EV and variance use {AP_TOOLBOX_H17_PRO_METADATA.totalRounds.toLocaleString()} audited AP Toolbox H17 Pro-policy resolved rounds at the baseline (H17 · DAS · RSA · LS · American peek · 3:2). Simultaneous hands are priced as correlated (ρ = 0.372, measured on the audited kernel across 137M multi-hand rounds), not independent. Wonging counts skipped rounds as observed opportunities. Risk and result ranges use continuous-diffusion or normal approximations and do not model heat, backoffs, travel time, or bankroll resizing.
            {estimated && " Table rules set away from the audited baseline apply a flat literature-estimated edge adjustment — treat those numbers as directional, not audited."}
          </p>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4">
          <div>
            <h2 className="font-semibold">Want variance and streak simulation?</h2>
            <p className="mt-1 text-sm text-zinc-500">Run this exact bankroll and bet spread through thousands of simulated shoes.</p>
          </div>
          <GhostButton onClick={testInSessionSimulator}><i className="fa-solid fa-dice mr-2" aria-hidden="true" />Open Session Simulator</GhostButton>
        </div>
      </div>

      <ConfirmModal
        open={pendingDeleteTemplate !== undefined}
        title="Delete scenario?"
        description={pendingDeleteTemplate ? `This permanently deletes “${pendingDeleteTemplate.name}”.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setPendingDeleteTemplate(undefined)}
        onConfirm={() => {
          if (pendingDeleteTemplate) {
            cvcxLibrary.deleteTemplate(pendingDeleteTemplate.id);
            track("cvcx_template_deleted", { name: pendingDeleteTemplate.name });
          }
          setPendingDeleteTemplate(undefined);
        }}
      />
    </>
  );
}
