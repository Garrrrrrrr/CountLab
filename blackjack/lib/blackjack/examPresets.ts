import { DEFAULT_SETTINGS, Settings } from "../statistics/storage";
import {
  EXAM_SECTIONS,
  ExamConfig,
  ExamRules,
  ExamSectionConfig,
  ExamSectionId,
} from "./testOut";

/**
 * The table an exam grades against, taken from the training defaults so a first
 * attempt matches the game the taker has been practising on.
 */
export function examRulesFromSettings(settings: Settings = DEFAULT_SETTINGS): ExamRules {
  return {
    decks: settings.decks,
    dealerHitsSoft17: settings.dealerHitsSoft17,
    doubleAfterSplit: settings.doubleAfterSplit,
    resplitAces: settings.resplitAces,
    lateSurrender: settings.lateSurrender,
    penetration: settings.penetration,
    rounding: settings.rounding,
    deckResolution: 0.5,
    spread: "1-8",
    baseBet: 10,
    wongOutNegative: true,
    spots: 3,
  };
}

/**
 * Per-section floors.
 *
 * These match the standards `countingMastery` already holds people to, so the
 * exam and the benchmark do not teach two different definitions of "good
 * enough". Counting is the exception at 100%: a running count that is nearly
 * right is a running count that is wrong, and every later skill is built on it.
 */
const FLOORS: Record<ExamSectionId, number> = {
  counting: 100,
  estimation: 95,
  conversion: 95,
  "basic-strategy": 95,
  deviations: 95,
  betting: 90,
  shoe: 95,
};

/** Default length and clock per section, used by presets and the custom panel. */
const DEFAULTS: Record<ExamSectionId, { questions: number; timeLimitSeconds: number | null }> = {
  counting: { questions: 4, timeLimitSeconds: 180 },
  estimation: { questions: 10, timeLimitSeconds: 120 },
  conversion: { questions: 20, timeLimitSeconds: 180 },
  "basic-strategy": { questions: 25, timeLimitSeconds: 180 },
  deviations: { questions: 20, timeLimitSeconds: 180 },
  betting: { questions: 10, timeLimitSeconds: 90 },
  shoe: { questions: 4, timeLimitSeconds: 600 },
};

/**
 * Every section in canonical order, enabled only where asked for. Presets and
 * the custom panel share this so a disabled section keeps a sensible length if
 * the taker switches it back on.
 */
export function buildSections(enabled: ExamSectionId[]): ExamSectionConfig[] {
  return EXAM_SECTIONS.map((section) => ({
    id: section.id,
    enabled: enabled.includes(section.id),
    questions: DEFAULTS[section.id].questions,
    timeLimitSeconds: DEFAULTS[section.id].timeLimitSeconds,
    passAccuracy: FLOORS[section.id],
  }));
}

export const CUSTOM_EXAM_ID = "custom";

export function examPresets(settings: Settings = DEFAULT_SETTINGS): ExamConfig[] {
  const rules = examRulesFromSettings(settings);
  return [
    {
      id: "hi-lo-checkout",
      name: "Hi-Lo Checkout",
      description:
        "The full test: count, estimate, convert, play, bet, and then hold it all together through live rounds.",
      rules,
      sections: buildSections([
        "counting",
        "estimation",
        "conversion",
        "basic-strategy",
        "deviations",
        "betting",
        "shoe",
      ]),
      overallPassAccuracy: 95,
      validDays: 30,
    },
    {
      id: "counting-checkout",
      name: "Counting Checkout",
      description: "Counting, tray estimation, and true-count conversion, without the playing decisions.",
      rules,
      sections: buildSections(["counting", "estimation", "conversion"]),
      overallPassAccuracy: 95,
      validDays: 30,
    },
    {
      id: "index-certification",
      name: "Index Certification",
      description: "Conversion and index deviations, for proving the departures rather than the arithmetic.",
      rules,
      sections: buildSections(["conversion", "deviations"]),
      overallPassAccuracy: 95,
      validDays: 30,
    },
    {
      // Keeps the retired /training/proficiency-test benchmark available: 50
      // true-count questions in five minutes, scored the same way.
      id: "quick-true-count",
      name: "Quick True Count",
      description: "Fifty true-count questions in five minutes. No hints, no pausing.",
      rules,
      sections: buildSections(["conversion"]).map((section) =>
        section.id === "conversion"
          ? { ...section, questions: 50, timeLimitSeconds: 300, passAccuracy: 90 }
          : section,
      ),
      overallPassAccuracy: 90,
      validDays: 30,
    },
  ];
}

export const EXAM_PRESETS: readonly ExamConfig[] = examPresets();

export function findPreset(id: string, settings?: Settings): ExamConfig | undefined {
  return examPresets(settings).find((preset) => preset.id === id);
}

/** A starting point for the custom panel: the full checkout, renamed. */
export function customExamConfig(settings: Settings = DEFAULT_SETTINGS): ExamConfig {
  const [checkout] = examPresets(settings);
  return {
    ...checkout,
    id: CUSTOM_EXAM_ID,
    name: "Custom exam",
    description: "Your own sections, lengths, clocks, and pass marks.",
  };
}
