import { BET_SPREAD_PRESETS, POSITIVE_TRUE_COUNTS, type BetRamp, type BetSpreadPreset } from "@/lib/blackjack/fullShoeSession";
import type { Settings } from "@/lib/statistics/storage";
import { rulesFromSettings, rulesSummary, SURRENDER_LABEL } from "@/lib/strategy";
import type { FullShoeSetup, Speed } from "@/lib/full-shoe/session";
import type { CountCheckFrequency } from "@/lib/full-shoe/grading";

export const PENETRATIONS = [0.65, 0.75, 0.8, 5 / 6, 0.85] as const;
export const penetrationLabel = (value: number) => `${Math.round(value * 100)}%`;

const nearest = <T extends number>(options: readonly T[], value: number): T =>
  options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best), options[0]);

export const SPEED_MS: Record<Speed, { stagger: number; step: number }> = {
  relaxed: { stagger: 300, step: 750 },
  casino: { stagger: 190, step: 520 },
  fast: { stagger: 80, step: 220 },
};

export const COUNT_CHECK_OPTIONS: readonly { value: CountCheckFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "every", label: "After every round" },
  { value: "3", label: "Every 3 rounds" },
  { value: "5", label: "Every 5 rounds" },
  { value: "random", label: "At random (about 1 round in 3)" },
];
/** Back-counting starts from a common plan: in at +2, out at −1. */
export const DEFAULT_WONG = { enter: 2, leave: -1 } as const;
export const SPREAD_LABEL: Record<BetSpreadPreset, string> = { flat: "Flat", "1-8": "1–8", "1-12": "1–12", custom: "Custom" };

/** A fresh setup from the reader's saved table rules. */
export function setupFromSettings(settings: Settings): FullShoeSetup {
  return {
    mode: "coached",
    rules: rulesFromSettings(settings),
    resplitAces: settings.resplitAces,
    blackjackPayout: 1.5,
    penetration: nearest(PENETRATIONS, settings.penetration),
    resolution: 0.5,
    rounding: settings.rounding,
    bankroll: 1000,
    unit: 10,
    spread: "1-8",
    ramp: { ...BET_SPREAD_PRESETS["1-8"] },
    players: 1,
    countChecks: "random",
    countDepth: "true",
    holeCard: "hidden",
    stacked: true,
    speed: "casino",
    animations: settings.animations,
    sound: settings.sound,
    decisionSeconds: 0,
  };
}

/** Dollar bets per positive true count, from a ramp in units. */
export const rampDollars = (ramp: BetRamp, unit: number) => POSITIVE_TRUE_COUNTS.map((tc) => Math.round(ramp[tc] * unit * 100) / 100);

/** "6D · H17 · DAS · LS · RSA · 3:2 · 75%". */
export function setupSummary(setup: FullShoeSetup): string {
  return [
    rulesSummary(setup.rules),
    setup.resplitAces ? "RSA" : "No RSA",
    setup.blackjackPayout === 1.5 ? "3:2" : "6:5",
    `${penetrationLabel(setup.penetration)} pen`,
  ].join(" · ");
}

export const surrenderName = (setup: FullShoeSetup) => SURRENDER_LABEL[setup.rules.surrender];
