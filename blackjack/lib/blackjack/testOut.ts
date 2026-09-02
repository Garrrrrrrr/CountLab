import type { DeckResolution } from "./countingTraining";
import type { TrueCountRounding } from "./hiLo";
import type { BlackjackRules } from "./types";
import type { DrillType, Mistake, Session } from "../statistics/storage";
import { makeSession } from "../statistics/storage";

/**
 * The skills a test-out exam can assess. Each maps onto a drill that already
 * teaches it, so a failed section can hand the taker straight back to practice.
 */
export type ExamSectionId =
  | "counting"
  | "estimation"
  | "conversion"
  | "basic-strategy"
  | "deviations"
  | "betting"
  | "shoe";

export interface ExamSectionMeta {
  id: ExamSectionId;
  label: string;
  description: string;
  /** The drill that practises this skill, for the report's "practice this" link. */
  drill: DrillType;
  href: string;
  /** Unit the configured `questions` count is expressed in. */
  unit: "questions" | "rounds";
}

export const EXAM_SECTIONS: readonly ExamSectionMeta[] = [
  {
    id: "counting",
    label: "Running count",
    description: "Hold the Hi-Lo count through a dealt sequence.",
    drill: "Running Count",
    href: "/training/running-count",
    unit: "questions",
  },
  {
    id: "estimation",
    label: "Deck estimation",
    description: "Read the discard tray to the configured resolution.",
    drill: "Deck Estimation",
    href: "/training/deck-estimation",
    unit: "questions",
  },
  {
    id: "conversion",
    label: "True count",
    description: "Convert a running count with the decks remaining.",
    drill: "True Count",
    href: "/training/true-count",
    unit: "questions",
  },
  {
    id: "basic-strategy",
    label: "Basic strategy",
    description: "Make the standard play for the table rules.",
    drill: "Basic Strategy",
    href: "/training/basic-strategy",
    unit: "questions",
  },
  {
    id: "deviations",
    label: "Index deviations",
    description: "Depart from basic strategy when the count says so.",
    drill: "Deviations",
    href: "/training/deviations",
    unit: "questions",
  },
  {
    id: "betting",
    label: "Bet sizing",
    description: "Put the ramp's bet out at the true count in front of you.",
    drill: "Full Shoe",
    href: "/training/full-shoe",
    unit: "questions",
  },
  {
    id: "shoe",
    label: "Capstone shoe",
    description: "Count, estimate, convert, bet, and play through live rounds.",
    drill: "Full Shoe",
    href: "/training/full-shoe",
    unit: "rounds",
  },
];

export const sectionMeta = (id: ExamSectionId): ExamSectionMeta =>
  EXAM_SECTIONS.find((section) => section.id === id)!;

/**
 * The table the exam is graded against, plus the counting and betting
 * parameters the drills already take. A superset of `BlackjackRules` rather
 * than a competing shape, so `toBlackjackRules` is the only bridge needed.
 */
export interface ExamRules {
  decks: number;
  dealerHitsSoft17: boolean;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  lateSurrender: boolean;
  penetration: number;
  rounding: TrueCountRounding;
  deckResolution: DeckResolution;
  spread: "1-4" | "1-8" | "1-12";
  baseBet: number;
  wongOutNegative: boolean;
  spots: number;
}

export const toBlackjackRules = (rules: ExamRules): BlackjackRules => ({
  decks: rules.decks,
  dealerHitsSoft17: rules.dealerHitsSoft17,
  doubleAfterSplit: rules.doubleAfterSplit,
  resplitAces: rules.resplitAces,
  lateSurrender: rules.lateSurrender,
  doubleRule: "any",
});

/** A one-line description of the table, for the certification record. */
export function summariseRules(rules: ExamRules): string {
  const flags = [
    rules.dealerHitsSoft17 ? "H17" : "S17",
    rules.doubleAfterSplit ? "DAS" : "no DAS",
    rules.resplitAces ? "RSA" : "no RSA",
    rules.lateSurrender ? "LS" : "no LS",
  ];
  return `${rules.decks}D ${flags.join(" ")}, ${Math.round(rules.penetration * 100)}% pen`;
}

export interface ExamSectionConfig {
  id: ExamSectionId;
  enabled: boolean;
  /** Questions, or rounds for the shoe section. */
  questions: number;
  /** Null runs the section untimed. */
  timeLimitSeconds: number | null;
  /** The floor this section has to clear on its own, 0-100. */
  passAccuracy: number;
}

export interface ExamConfig {
  id: string;
  name: string;
  description: string;
  rules: ExamRules;
  sections: ExamSectionConfig[];
  /** The bar the combined score has to clear, 0-100. */
  overallPassAccuracy: number;
  /** Days a pass stays current before it lapses. */
  validDays: number;
}

export const enabledSections = (config: ExamConfig): ExamSectionConfig[] =>
  config.sections.filter((section) => section.enabled);

/**
 * What the runner reports back for one finished section. `presented` counts the
 * questions actually shown, which is lower than the configured count whenever
 * the section's clock ran out.
 */
export interface SectionRun {
  section: ExamSectionId;
  presented: number;
  correct: number;
  elapsedMs: number;
  timedOut: boolean;
  bestStreak: number;
  mistakes: Mistake[];
  categories: Record<string, { correct: number; total: number }>;
  /** Shoe only: rounds actually played to completion. */
  roundsCompleted?: number;
}

export interface SectionResult {
  section: ExamSectionId;
  label: string;
  /** The denominator the section is scored over. */
  questions: number;
  correct: number;
  accuracy: number;
  elapsedMs: number;
  timedOut: boolean;
  passAccuracy: number;
  passed: boolean;
  mistakes: Mistake[];
  categories: Record<string, { correct: number; total: number }>;
}

export interface ExamResult {
  config: ExamConfig;
  sections: SectionResult[];
  questions: number;
  correct: number;
  accuracy: number;
  overallPassed: boolean;
  failedSections: ExamSectionId[];
  bestStreak: number;
  elapsedMs: number;
}

const percentage = (correct: number, questions: number) =>
  questions > 0 ? Math.round((correct / questions) * 100) : 0;

/**
 * Grades one attempt.
 *
 * Running out of time does not end the exam — the section keeps its configured
 * denominator, so every question the clock swallowed scores zero and the taker
 * moves on to the next section. That keeps the report diagnostic: you can see
 * you were accurate but slow, instead of being told only that you failed.
 *
 * The shoe is the exception. Its configured count is rounds, not questions, and
 * a round produces a variable number of checkpoints (insurance only comes up
 * against an ace), so there is no honest fixed denominator to score against. It
 * is graded over the checkpoints it actually reached and fails outright if the
 * clock stopped it short of the configured rounds.
 */
export function gradeExam(config: ExamConfig, runs: SectionRun[]): ExamResult {
  const sections: SectionResult[] = [];
  for (const section of enabledSections(config)) {
    const run = runs.find((candidate) => candidate.section === section.id);
    if (!run) continue;
    const isShoe = section.id === "shoe";
    const questions = isShoe ? run.presented : Math.max(section.questions, run.presented);
    const accuracy = percentage(run.correct, questions);
    const shoeCutShort = isShoe && run.timedOut && (run.roundsCompleted ?? 0) < section.questions;
    sections.push({
      section: section.id,
      label: sectionMeta(section.id).label,
      questions,
      correct: run.correct,
      accuracy,
      elapsedMs: run.elapsedMs,
      timedOut: run.timedOut,
      passAccuracy: section.passAccuracy,
      passed: accuracy >= section.passAccuracy && !shoeCutShort,
      mistakes: run.mistakes,
      categories: run.categories,
    });
  }
  const questions = sections.reduce((sum, section) => sum + section.questions, 0);
  const correct = sections.reduce((sum, section) => sum + section.correct, 0);
  const accuracy = percentage(correct, questions);
  const failedSections = sections.filter((section) => !section.passed).map((section) => section.section);
  return {
    config,
    sections,
    questions,
    correct,
    accuracy,
    // Both bars have to clear. An overall average alone would let a strong
    // counting score hide a broken index game.
    overallPassed: sections.length > 0 && accuracy >= config.overallPassAccuracy && failedSections.length === 0,
    failedSections,
    bestStreak: runs.reduce((best, run) => Math.max(best, run.bestStreak), 0),
    elapsedMs: runs.reduce((sum, run) => sum + run.elapsedMs, 0),
  };
}

/**
 * The certification record is the session itself: expiry is derived from its
 * date plus `validDays`, so a pass needs no table, no localStorage namespace,
 * and no backup wiring of its own.
 *
 * `Session.metrics` only holds scalars, so the failed-section list travels as a
 * comma-joined string.
 */
export function examToSession(result: ExamResult): Session {
  const { config } = result;
  const categories: Record<string, { correct: number; total: number }> = {};
  for (const section of result.sections) {
    categories[section.label] = { correct: section.correct, total: section.questions };
  }
  return makeSession(
    "Test Out",
    result.questions,
    result.correct,
    result.elapsedMs,
    result.bestStreak,
    result.sections.flatMap((section) => section.mistakes),
    categories,
    {
      examId: config.id,
      examName: config.name,
      passed: result.overallPassed,
      requiredAccuracy: config.overallPassAccuracy,
      failedSections: result.failedSections.join(","),
      elapsedSeconds: Math.round(result.elapsedMs / 1000),
      validDays: config.validDays,
      rulesSummary: summariseRules(config.rules),
      decks: config.rules.decks,
      dealerHitsSoft17: config.rules.dealerHitsSoft17,
      penetration: config.rules.penetration,
      rounding: config.rules.rounding,
    },
    ["test-out", config.id, result.overallPassed ? "passed" : "failed"],
  );
}

export interface ExamConfigProblem {
  field: string;
  message: string;
}

/** Blocks a config that cannot produce a meaningful score. */
export function validateExamConfig(config: ExamConfig): ExamConfigProblem[] {
  const problems: ExamConfigProblem[] = [];
  const active = enabledSections(config);
  if (active.length === 0) problems.push({ field: "sections", message: "Enable at least one section." });
  for (const section of active) {
    const meta = sectionMeta(section.id);
    const unit = meta.unit === "rounds" ? "round" : "question";
    if (section.questions < 1) {
      problems.push({ field: section.id, message: `${meta.label} needs at least one ${unit}.` });
    }
    if (section.passAccuracy < 0 || section.passAccuracy > 100) {
      problems.push({ field: section.id, message: `${meta.label} pass mark must be between 0 and 100.` });
    }
    if (section.timeLimitSeconds !== null && section.timeLimitSeconds < 10) {
      problems.push({ field: section.id, message: `${meta.label} needs at least 10 seconds, or no limit.` });
    }
  }
  if (config.overallPassAccuracy < 0 || config.overallPassAccuracy > 100) {
    problems.push({ field: "overallPassAccuracy", message: "Overall pass mark must be between 0 and 100." });
  }
  if (config.validDays < 1) problems.push({ field: "validDays", message: "Certification must stay valid for at least a day." });
  return problems;
}
