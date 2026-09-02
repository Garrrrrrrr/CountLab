import { getBasicStrategyDecision } from "./basicStrategy";
import {
  expectedBet,
  makeCountSequence,
  makeTrueCountScenario,
  roundDeckEstimate,
  TrueCountScenario,
} from "./countingTraining";
import {
  DEVIATION_ACTION_NAMES,
  DeviationAction,
  deviationHandRanks,
  deviationSentence,
  deviationTrainingRows,
} from "./deviations";
import { runningCount, signed, trueCount } from "./hiLo";
import { randomStrategyQuestion, strategyCategoryOf } from "./strategyQuestions";
import { ExamRules, ExamSectionConfig, ExamSectionId, toBlackjackRules } from "./testOut";
import { Card } from "./types";
import type { CountingErrorCategory } from "../statistics/storage";
import rawDeckEstimationPhotos from "../../public/deck-estimation/manifest.json";

export type DeckPhoto = { file: string; decks: number; numDecks: number };
export const DECK_ESTIMATION_PHOTOS = rawDeckEstimationPhotos as DeckPhoto[];

/**
 * Cards shown per counting question, and the pace they are dealt at.
 *
 * Half a deck is long enough that a lost count cannot be recovered by luck and
 * short enough that a section of ten questions stays inside a coffee break. The
 * pace matches the six-deck casino preset in `COUNTING_PRESETS`, which is the
 * one modelled on a real table.
 */
export const COUNTING_CARDS = 26;
export const COUNTING_SPEED_MS = 750;

/** True counts the betting section draws from — the range a ramp actually reacts to. */
export const BETTING_TRUE_COUNTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const;

export type ExamPrompt =
  | { kind: "count-sequence"; cards: Card[]; speedMs: number }
  | { kind: "tray"; file: string; totalDecks: number; decksRemaining: number }
  | { kind: "true-count"; scenario: TrueCountScenario }
  | { kind: "decision"; player: Card[]; dealer: Card; trueCount: number | null; actions: DeviationAction[] }
  | { kind: "bet"; trueCount: number; baseBet: number; spread: string };

export interface ExamQuestion {
  section: ExamSectionId;
  prompt: ExamPrompt;
  /** Canonical answer. Numeric sections compare by value, decisions by exact match. */
  correctAnswer: string;
  /** The question as the mistake record should state it. */
  question: string;
  /** The answer as the mistake record should state it. */
  correctLabel: string;
  /** Scoring bucket within the section. */
  category: string;
  errorCategory?: CountingErrorCategory;
  explanation: string;
}

const PLAY_ACTIONS: DeviationAction[] = ["H", "S", "D", "P", "R"];

const pick = <T,>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

const handLabel = (cards: Card[]) => cards.map((card) => card.rank).join(",");

function countingQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const cards = makeCountSequence(rules.decks, COUNTING_CARDS, "none", rng);
  const answer = runningCount(cards);
  return {
    section: "counting",
    prompt: { kind: "count-sequence", cards, speedMs: COUNTING_SPEED_MS },
    correctAnswer: String(answer),
    question: `Running count after ${cards.length} cards`,
    correctLabel: signed(answer),
    category: "running count",
    errorCategory: "negative arithmetic",
    explanation: `The sequence carried ${cards.filter((card) => ["2", "3", "4", "5", "6"].includes(card.rank)).length} low cards and ${cards.filter((card) => ["10", "J", "Q", "K", "A"].includes(card.rank)).length} high cards, for a running count of ${signed(answer)}.`,
  };
}

function estimationQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const pool = DECK_ESTIMATION_PHOTOS.filter((photo) => photo.numDecks === rules.decks);
  const photo = pick(pool.length ? pool : DECK_ESTIMATION_PHOTOS, rng);
  const answer = roundDeckEstimate(photo.decks, rules.deckResolution);
  return {
    section: "estimation",
    prompt: { kind: "tray", file: photo.file, totalDecks: photo.numDecks, decksRemaining: photo.decks },
    correctAnswer: String(answer),
    question: "Decks remaining in the pictured tray",
    correctLabel: `${answer} decks`,
    category: `${rules.deckResolution}-deck resolution`,
    errorCategory: "deck estimate",
    explanation: `The tray holds ${(photo.numDecks - photo.decks).toFixed(2)} discarded decks, leaving ${photo.decks.toFixed(2)} before rounding to ${rules.deckResolution}-deck resolution.`,
  };
}

function conversionQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const scenario = makeTrueCountScenario({
    decks: rules.decks,
    resolution: rules.deckResolution,
    rounding: rules.rounding,
    focus: "all",
    rng,
  });
  const bucket = scenario.runningCount < 0 ? "negative" : scenario.runningCount > 0 ? "positive" : "zero";
  return {
    section: "conversion",
    prompt: { kind: "true-count", scenario },
    correctAnswer: String(scenario.answer),
    question: `RC ${signed(scenario.runningCount)} with ${scenario.estimatedDecksRemaining} decks remaining`,
    correctLabel: `TC ${signed(scenario.answer)}`,
    category: `${bucket} count`,
    errorCategory: "true-count division",
    explanation: `${signed(scenario.runningCount)} ÷ ${scenario.estimatedDecksRemaining} = ${(scenario.runningCount / scenario.estimatedDecksRemaining).toFixed(2)}, which ${rules.rounding} rounding takes to ${signed(scenario.answer)}.`,
  };
}

function basicStrategyQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const { player, dealer } = randomStrategyQuestion(undefined, rng);
  const decision = getBasicStrategyDecision({
    playerCards: player,
    dealerUpcard: dealer,
    rules: toBlackjackRules(rules),
  });
  return {
    section: "basic-strategy",
    prompt: { kind: "decision", player, dealer, trueCount: null, actions: PLAY_ACTIONS },
    correctAnswer: decision.action,
    question: `${handLabel(player)} vs ${dealer.rank}`,
    correctLabel: DEVIATION_ACTION_NAMES[decision.action],
    category: strategyCategoryOf(player, decision.action),
    errorCategory: "playing decision",
    explanation: decision.explanation,
  };
}

function deviationQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const rows = deviationTrainingRows(rules, rules.decks);
  const { row, transition } = pick(rows, rng);
  // Sit near the index so both sides of the threshold come up, the way the
  // deviation drill jitters. `always` rows have no live threshold, so they draw
  // from the whole practical range instead.
  const tc = row.always
    ? Math.floor(rng() * 12) - 4
    : row.index + Math.floor(rng() * 5) - 2;
  const departureApplies = row.always || (transition.atOrBelow ? tc <= row.index : tc >= row.index);
  const answer = departureApplies ? transition.departure : transition.baseline;
  const isInsurance = row.hand === "Insurance";
  const [first, second] = deviationHandRanks(row.hand);
  return {
    section: "deviations",
    prompt: isInsurance
      ? { kind: "decision", player: [], dealer: { rank: "A", suit: "diamonds" }, trueCount: tc, actions: ["I", "N"] }
      : {
        kind: "decision",
        player: [{ rank: first, suit: "spades" }, { rank: second, suit: "hearts" }],
        dealer: { rank: row.dealer as Card["rank"], suit: "diamonds" },
        trueCount: tc,
        actions: PLAY_ACTIONS,
      },
    correctAnswer: answer,
    question: `${row.hand} vs ${row.dealer} at TC ${signed(tc)}`,
    correctLabel: DEVIATION_ACTION_NAMES[answer],
    category: `${row.hand} vs ${row.dealer}`,
    errorCategory: "playing decision",
    explanation: deviationSentence(row, transition),
  };
}

function bettingQuestion(rules: ExamRules, rng: () => number): ExamQuestion {
  const tc = pick(BETTING_TRUE_COUNTS, rng);
  const answer = expectedBet(tc, rules.baseBet, rules.spread, rules.wongOutNegative);
  return {
    section: "betting",
    prompt: { kind: "bet", trueCount: tc, baseBet: rules.baseBet, spread: rules.spread },
    correctAnswer: String(answer),
    question: `Bet at TC ${signed(tc)} on a ${rules.spread} spread`,
    correctLabel: `$${answer}`,
    category: tc < 0 ? "negative count" : tc === 0 ? "zero count" : "positive count",
    errorCategory: "bet sizing",
    explanation: rules.wongOutNegative && tc < 0
      ? `The wong-out rule sets every negative-count bet to $0.`
      : `Apply the ${rules.spread} ramp to a $${rules.baseBet} unit.`,
  };
}

const GENERATORS: Record<Exclude<ExamSectionId, "shoe">, (rules: ExamRules, rng: () => number) => ExamQuestion> = {
  counting: countingQuestion,
  estimation: estimationQuestion,
  conversion: conversionQuestion,
  "basic-strategy": basicStrategyQuestion,
  deviations: deviationQuestion,
  betting: bettingQuestion,
};

/**
 * Every question for one section, generated up front so the runner can show a
 * stable question count and so the section's clock governs answering rather
 * than generation.
 *
 * The shoe section has no pre-generated list — it drives a live shoe and scores
 * checkpoints as they come — so asking for it is a programming error.
 */
export function buildQuestionStage(
  section: ExamSectionConfig,
  rules: ExamRules,
  rng: () => number = Math.random,
): ExamQuestion[] {
  if (section.id === "shoe") throw new Error("The shoe section is driven live, not pre-generated");
  const generate = GENERATORS[section.id];
  return Array.from({ length: Math.max(0, section.questions) }, () => generate(rules, rng));
}

/**
 * Whether an answer counts. Numeric sections compare by value so "+3", "3" and
 * "3.0" all read the same; decisions compare exactly, since they are chosen
 * from buttons rather than typed.
 */
export function gradeAnswer(question: ExamQuestion, raw: string): boolean {
  const answer = raw.trim();
  if (!answer) return false;
  if (question.prompt.kind === "decision") return answer === question.correctAnswer;
  const value = Number(answer.replace(/^\+/, ""));
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - Number(question.correctAnswer)) < 0.001;
}

/** The true count a live shoe is at, given the running count and what is left. */
export function shoeTrueCount(rules: ExamRules, rc: number, decksRemaining: number): number {
  return trueCount(rc, roundDeckEstimate(decksRemaining, rules.deckResolution), rules.rounding);
}
