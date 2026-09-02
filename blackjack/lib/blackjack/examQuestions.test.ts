import { describe, expect, it } from "vitest";
import { getBasicStrategyDecision } from "./basicStrategy";
import { expectedBet, roundDeckEstimate } from "./countingTraining";
import { deviationTrainingRows } from "./deviations";
import { runningCount, trueCount } from "./hiLo";
import {
  BETTING_TRUE_COUNTS,
  COUNTING_CARDS,
  DECK_ESTIMATION_PHOTOS,
  buildQuestionStage,
  gradeAnswer,
  shoeTrueCount,
} from "./examQuestions";
import type { ExamQuestion } from "./examQuestions";
import { ExamRules, ExamSectionConfig, ExamSectionId, toBlackjackRules } from "./testOut";

const RULES: ExamRules = {
  decks: 6,
  dealerHitsSoft17: true,
  doubleAfterSplit: true,
  resplitAces: true,
  lateSurrender: true,
  penetration: 0.75,
  rounding: "floor",
  deckResolution: 0.5,
  spread: "1-8",
  baseBet: 10,
  wongOutNegative: true,
  spots: 3,
};

/** A small deterministic generator, so a failure can be reproduced exactly. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const section = (id: ExamSectionId, questions = 25): ExamSectionConfig => ({
  id,
  enabled: true,
  questions,
  timeLimitSeconds: null,
  passAccuracy: 90,
});

const QUESTION_SECTIONS: ExamSectionId[] = [
  "counting",
  "estimation",
  "conversion",
  "basic-strategy",
  "deviations",
  "betting",
];

const RULE_MATRIX = [
  { dealerHitsSoft17: true, lateSurrender: true },
  { dealerHitsSoft17: true, lateSurrender: false },
  { dealerHitsSoft17: false, lateSurrender: true },
  { dealerHitsSoft17: false, lateSurrender: false },
] as const;

describe("buildQuestionStage", () => {
  it.each(QUESTION_SECTIONS)("generates exactly the configured number of %s questions", (id) => {
    const questions = buildQuestionStage(section(id, 7), RULES, seeded(1));
    expect(questions).toHaveLength(7);
    expect(questions.every((question) => question.section === id)).toBe(true);
  });

  it("generates nothing for a zero-length section", () => {
    expect(buildQuestionStage(section("betting", 0), RULES, seeded(1))).toEqual([]);
  });

  it("refuses the shoe section, which is driven live rather than pre-generated", () => {
    expect(() => buildQuestionStage(section("shoe"), RULES, seeded(1))).toThrow(/driven live/);
  });

  it("is reproducible under a seeded generator", () => {
    const first = buildQuestionStage(section("conversion", 5), RULES, seeded(99));
    const second = buildQuestionStage(section("conversion", 5), RULES, seeded(99));
    expect(first).toEqual(second);
  });

  it.each(QUESTION_SECTIONS)("gives every %s question a prompt, an answer and an explanation", (id) => {
    for (const question of buildQuestionStage(section(id), RULES, seeded(7))) {
      expect(question.correctAnswer, question.question).not.toBe("");
      expect(question.explanation.length, question.question).toBeGreaterThan(0);
      expect(question.category, question.question).toBeTruthy();
      expect(question.correctLabel, question.question).toBeTruthy();
    }
  });
});

describe("counting questions", () => {
  it("answers with the Hi-Lo count of the cards it showed", () => {
    for (const question of buildQuestionStage(section("counting"), RULES, seeded(3))) {
      if (question.prompt.kind !== "count-sequence") throw new Error("expected a card sequence");
      expect(question.prompt.cards).toHaveLength(COUNTING_CARDS);
      expect(Number(question.correctAnswer)).toBe(runningCount(question.prompt.cards));
    }
  });
});

describe("estimation questions", () => {
  it("answers with the tray photo rounded to the configured resolution", () => {
    for (const resolution of [1, 0.5, 0.25] as const) {
      const rules = { ...RULES, deckResolution: resolution };
      for (const question of buildQuestionStage(section("estimation"), rules, seeded(4))) {
        if (question.prompt.kind !== "tray") throw new Error("expected a tray");
        expect(Number(question.correctAnswer)).toBeCloseTo(
          roundDeckEstimate(question.prompt.decksRemaining, resolution),
          10,
        );
      }
    }
  });

  it("draws photos of the configured shoe size when the library has them", () => {
    const sizes = new Set(DECK_ESTIMATION_PHOTOS.map((photo) => photo.numDecks));
    for (const decks of sizes) {
      for (const question of buildQuestionStage(section("estimation", 10), { ...RULES, decks }, seeded(5))) {
        if (question.prompt.kind !== "tray") throw new Error("expected a tray");
        expect(question.prompt.totalDecks, `${decks}-deck shoe`).toBe(decks);
      }
    }
  });

  it("falls back to the whole library rather than generating nothing for an unphotographed shoe", () => {
    const questions = buildQuestionStage(section("estimation", 5), { ...RULES, decks: 3 }, seeded(6));
    expect(questions).toHaveLength(5);
    for (const question of questions) {
      if (question.prompt.kind !== "tray") throw new Error("expected a tray");
      expect(question.prompt.file).toBeTruthy();
    }
  });
});

describe("conversion questions", () => {
  it.each(["floor", "truncate", "nearest"] as const)("answers with the %s-rounded true count", (rounding) => {
    for (const question of buildQuestionStage(section("conversion"), { ...RULES, rounding }, seeded(8))) {
      if (question.prompt.kind !== "true-count") throw new Error("expected a true-count scenario");
      const { runningCount: rc, estimatedDecksRemaining } = question.prompt.scenario;
      // Normalised, because truncate and nearest both produce -0 for a small
      // negative quotient and the answer is stored as the string "0".
      expect(Number(question.correctAnswer) + 0).toBe(trueCount(rc, estimatedDecksRemaining, rounding) + 0);
    }
  });

  it("never shows a true count of minus zero", () => {
    // Math.trunc(-0.4) and Math.round(-0.4) are both -0, which would read as
    // "-0" on screen and in the mistake record if it were not normalised.
    for (const rounding of ["floor", "truncate", "nearest"] as const) {
      for (const question of buildQuestionStage(section("conversion", 40), { ...RULES, rounding }, seeded(9))) {
        expect(question.correctAnswer).not.toBe("-0");
        expect(question.correctLabel).not.toContain("-0");
      }
    }
  });
});

describe("basic-strategy questions", () => {
  it.each(RULE_MATRIX)("answers with the engine's decision for %o", (overrides) => {
    const rules = { ...RULES, ...overrides };
    for (const question of buildQuestionStage(section("basic-strategy"), rules, seeded(11))) {
      if (question.prompt.kind !== "decision") throw new Error("expected a decision");
      const decision = getBasicStrategyDecision({
        playerCards: question.prompt.player,
        dealerUpcard: question.prompt.dealer,
        rules: toBlackjackRules(rules),
      });
      expect(question.correctAnswer, question.question).toBe(decision.action);
    }
  });

  it("asks without a true count, so the count cannot change the answer", () => {
    for (const question of buildQuestionStage(section("basic-strategy"), RULES, seeded(12))) {
      if (question.prompt.kind !== "decision") throw new Error("expected a decision");
      expect(question.prompt.trueCount).toBeNull();
    }
  });
});

describe("deviation questions", () => {
  /** Recover the catalog row from the question's category and re-derive the answer. */
  function expectedAction(question: ExamQuestion, rules: ExamRules) {
    if (question.prompt.kind !== "decision") throw new Error("expected a decision");
    const tc = question.prompt.trueCount!;
    const entry = deviationTrainingRows(rules, rules.decks)
      .find(({ row }) => `${row.hand} vs ${row.dealer}` === question.category);
    expect(entry, question.category).toBeDefined();
    const { row, transition } = entry!;
    const departs = row.always || (transition.atOrBelow ? tc <= row.index : tc >= row.index);
    return departs ? transition.departure : transition.baseline;
  }

  it.each(RULE_MATRIX)("answers with the row's resolved transition for %o", (overrides) => {
    const rules = { ...RULES, ...overrides };
    for (const question of buildQuestionStage(section("deviations"), rules, seeded(13))) {
      expect(question.correctAnswer, question.question).toBe(expectedAction(question, rules));
    }
  });

  it("only draws rows the rules actually make live", () => {
    for (const overrides of RULE_MATRIX) {
      const rules = { ...RULES, ...overrides };
      const live = new Set(
        deviationTrainingRows(rules, rules.decks).map(({ row }) => `${row.hand} vs ${row.dealer}`),
      );
      for (const question of buildQuestionStage(section("deviations"), rules, seeded(14))) {
        expect(live.has(question.category), question.category).toBe(true);
      }
    }
  });

  it("offers insurance answers only on the insurance row", () => {
    for (const question of buildQuestionStage(section("deviations", 60), RULES, seeded(15))) {
      if (question.prompt.kind !== "decision") throw new Error("expected a decision");
      const insurance = question.category.startsWith("Insurance");
      expect(question.prompt.actions.includes("I"), question.category).toBe(insurance);
      if (insurance) expect(["I", "N"]).toContain(question.correctAnswer);
    }
  });

  it("deals a hand matching the row label for every non-insurance question", () => {
    for (const question of buildQuestionStage(section("deviations", 60), RULES, seeded(16))) {
      if (question.prompt.kind !== "decision") throw new Error("expected a decision");
      if (question.category.startsWith("Insurance")) continue;
      expect(question.prompt.player, question.category).toHaveLength(2);
    }
  });

  it("asks on both sides of the index, not only where the departure applies", () => {
    const questions = buildQuestionStage(section("deviations", 120), RULES, seeded(17));
    const answers = questions.map((question) => {
      const entry = deviationTrainingRows(RULES, RULES.decks)
        .find(({ row }) => `${row.hand} vs ${row.dealer}` === question.category)!;
      return question.correctAnswer === entry.transition.departure;
    });
    expect(answers).toContain(true);
    expect(answers).toContain(false);
  });
});

describe("betting questions", () => {
  it.each(["1-4", "1-8", "1-12"] as const)("answers with the %s ramp's bet", (spread) => {
    const rules = { ...RULES, spread };
    for (const question of buildQuestionStage(section("betting"), rules, seeded(18))) {
      if (question.prompt.kind !== "bet") throw new Error("expected a bet");
      expect(Number(question.correctAnswer)).toBe(
        expectedBet(question.prompt.trueCount, rules.baseBet, spread, rules.wongOutNegative),
      );
      expect(BETTING_TRUE_COUNTS).toContain(question.prompt.trueCount);
    }
  });

  it("answers zero at negative counts only when the exam wongs out", () => {
    const wonging = buildQuestionStage(section("betting", 60), RULES, seeded(19));
    const negativeWonged = wonging.filter((question) => question.prompt.kind === "bet" && question.prompt.trueCount < 0);
    expect(negativeWonged.length).toBeGreaterThan(0);
    expect(negativeWonged.every((question) => Number(question.correctAnswer) === 0)).toBe(true);

    const playingAll = buildQuestionStage(section("betting", 60), { ...RULES, wongOutNegative: false }, seeded(19));
    const negativePlayed = playingAll.filter((question) => question.prompt.kind === "bet" && question.prompt.trueCount < 0);
    expect(negativePlayed.every((question) => Number(question.correctAnswer) > 0)).toBe(true);
  });
});

describe("gradeAnswer", () => {
  const numeric = buildQuestionStage(section("conversion", 1), RULES, seeded(20))[0];
  const decision = buildQuestionStage(section("basic-strategy", 1), RULES, seeded(21))[0];

  it("accepts a numeric answer however it is written", () => {
    const answer = numeric.correctAnswer;
    expect(gradeAnswer(numeric, answer)).toBe(true);
    expect(gradeAnswer(numeric, ` ${answer} `)).toBe(true);
    if (Number(answer) > 0) expect(gradeAnswer(numeric, `+${answer}`)).toBe(true);
  });

  it("rejects a blank, a non-number, and a wrong value", () => {
    expect(gradeAnswer(numeric, "")).toBe(false);
    expect(gradeAnswer(numeric, "   ")).toBe(false);
    expect(gradeAnswer(numeric, "abc")).toBe(false);
    expect(gradeAnswer(numeric, String(Number(numeric.correctAnswer) + 1))).toBe(false);
  });

  it("matches decisions exactly, since they come from buttons", () => {
    expect(gradeAnswer(decision, decision.correctAnswer)).toBe(true);
    expect(gradeAnswer(decision, decision.correctAnswer.toLowerCase())).toBe(false);
    expect(gradeAnswer(decision, "")).toBe(false);
  });

  it("tolerates the float error a quarter-deck estimate carries", () => {
    const tray = buildQuestionStage(section("estimation", 1), { ...RULES, deckResolution: 0.25 }, seeded(22))[0];
    expect(gradeAnswer(tray, String(Number(tray.correctAnswer) + 0.0000001))).toBe(true);
    expect(gradeAnswer(tray, String(Number(tray.correctAnswer) + 0.25))).toBe(false);
  });
});

describe("shoeTrueCount", () => {
  it("estimates the tray before dividing, the way a counter has to", () => {
    // 4.4 decks left reads as 4.5 at half-deck resolution: 9 / 4.5 = 2.
    expect(shoeTrueCount(RULES, 9, 4.4)).toBe(2);
    // Dividing by the exact 4.4 would have given 2.045, which floors to 2 as well,
    // so use a case where the rounding actually moves the answer.
    expect(shoeTrueCount(RULES, 9, 2.6)).toBe(trueCount(9, 2.5, "floor"));
    expect(shoeTrueCount({ ...RULES, deckResolution: 1 }, 9, 2.6)).toBe(trueCount(9, 3, "floor"));
  });
});
