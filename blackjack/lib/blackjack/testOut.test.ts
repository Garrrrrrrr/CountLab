import { describe, expect, it } from "vitest";
import { countingMastery } from "./countingTraining";
import {
  EXAM_SECTIONS,
  ExamConfig,
  ExamRules,
  ExamSectionId,
  SectionRun,
  enabledSections,
  examToSession,
  gradeExam,
  sectionMeta,
  summariseRules,
  toBlackjackRules,
  validateExamConfig,
} from "./testOut";

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

function config(overrides: Partial<ExamConfig> = {}): ExamConfig {
  return {
    id: "test",
    name: "Test",
    description: "",
    rules: RULES,
    overallPassAccuracy: 90,
    validDays: 30,
    sections: [
      { id: "conversion", enabled: true, questions: 10, timeLimitSeconds: null, passAccuracy: 90 },
      { id: "deviations", enabled: true, questions: 10, timeLimitSeconds: null, passAccuracy: 90 },
    ],
    ...overrides,
  };
}

function run(section: ExamSectionId, correct: number, overrides: Partial<SectionRun> = {}): SectionRun {
  return {
    section,
    presented: 10,
    correct,
    elapsedMs: 60_000,
    timedOut: false,
    bestStreak: correct,
    mistakes: [],
    categories: {},
    ...overrides,
  };
}

describe("section metadata", () => {
  it("gives every section id a unique label and a drill to practise", () => {
    const ids = EXAM_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = EXAM_SECTIONS.map((section) => section.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const section of EXAM_SECTIONS) {
      expect(sectionMeta(section.id)).toBe(section);
      expect(section.href.startsWith("/training/"), section.id).toBe(true);
    }
  });

  it("measures only the shoe in rounds", () => {
    const inRounds = EXAM_SECTIONS.filter((section) => section.unit === "rounds").map((section) => section.id);
    expect(inRounds).toEqual(["shoe"]);
  });
});

describe("rules", () => {
  it("narrows to the play engine's rule shape", () => {
    expect(toBlackjackRules(RULES)).toEqual({
      decks: 6,
      dealerHitsSoft17: true,
      doubleAfterSplit: true,
      resplitAces: true,
      lateSurrender: true,
      doubleRule: "any",
    });
  });

  it("summarises the table for the certification record", () => {
    expect(summariseRules(RULES)).toBe("6D H17 DAS RSA LS, 75% pen");
    expect(summariseRules({ ...RULES, decks: 8, dealerHitsSoft17: false, lateSurrender: false, penetration: 0.8 }))
      .toBe("8D S17 DAS RSA no LS, 80% pen");
  });
});

describe("gradeExam pass matrix", () => {
  it("passes when the overall bar and every section floor clear", () => {
    const result = gradeExam(config(), [run("conversion", 10), run("deviations", 9)]);
    expect(result.accuracy).toBe(95);
    expect(result.failedSections).toEqual([]);
    expect(result.overallPassed).toBe(true);
  });

  it("fails when a section floor is missed even though the overall bar clears", () => {
    // 10/10 and 8/10 averages to 90, which clears the overall bar, but the
    // second section is below its own 90% floor.
    const result = gradeExam(config(), [run("conversion", 10), run("deviations", 8)]);
    expect(result.accuracy).toBe(90);
    expect(result.failedSections).toEqual(["deviations"]);
    expect(result.overallPassed).toBe(false);
  });

  it("fails when every section floor clears but the overall bar does not", () => {
    const strict = config({ overallPassAccuracy: 95 });
    const result = gradeExam(strict, [run("conversion", 9), run("deviations", 9)]);
    expect(result.accuracy).toBe(90);
    expect(result.failedSections).toEqual([]);
    expect(result.overallPassed).toBe(false);
  });

  it("ignores disabled sections entirely", () => {
    const partial = config({
      sections: [
        { id: "conversion", enabled: true, questions: 10, timeLimitSeconds: null, passAccuracy: 90 },
        { id: "deviations", enabled: false, questions: 10, timeLimitSeconds: null, passAccuracy: 90 },
      ],
    });
    const result = gradeExam(partial, [run("conversion", 10), run("deviations", 0)]);
    expect(result.sections.map((section) => section.section)).toEqual(["conversion"]);
    expect(result.questions).toBe(10);
    expect(result.overallPassed).toBe(true);
  });

  it("never passes an exam with no graded sections", () => {
    const empty = config({ sections: [] });
    expect(gradeExam(empty, []).overallPassed).toBe(false);
    expect(gradeExam(empty, []).accuracy).toBe(0);
  });
});

describe("gradeExam timeouts", () => {
  it("scores questions the clock swallowed as zero", () => {
    // Answered 6 of 10 correctly before time ran out: 6/10, not 6/6.
    const result = gradeExam(config(), [
      run("conversion", 6, { presented: 6, timedOut: true }),
      run("deviations", 10),
    ]);
    const conversion = result.sections.find((section) => section.section === "conversion")!;
    expect(conversion.questions).toBe(10);
    expect(conversion.accuracy).toBe(60);
    expect(conversion.timedOut).toBe(true);
    expect(conversion.passed).toBe(false);
  });

  it("does not abort the exam when a section times out", () => {
    const result = gradeExam(config(), [
      run("conversion", 0, { presented: 0, timedOut: true }),
      run("deviations", 10),
    ]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].accuracy).toBe(100);
    expect(result.failedSections).toEqual(["conversion"]);
  });

  it("keeps the larger denominator when more questions were shown than configured", () => {
    const result = gradeExam(config(), [run("conversion", 12, { presented: 12 }), run("deviations", 10)]);
    expect(result.sections[0].questions).toBe(12);
  });
});

describe("gradeExam shoe section", () => {
  const shoeConfig = config({
    overallPassAccuracy: 90,
    sections: [{ id: "shoe", enabled: true, questions: 4, timeLimitSeconds: 300, passAccuracy: 90 }],
  });

  it("grades over the checkpoints actually reached", () => {
    const result = gradeExam(shoeConfig, [
      run("shoe", 19, { presented: 20, roundsCompleted: 4 }),
    ]);
    expect(result.sections[0].questions).toBe(20);
    expect(result.sections[0].accuracy).toBe(95);
    expect(result.overallPassed).toBe(true);
  });

  it("fails outright when the clock stops it short of the configured rounds", () => {
    const result = gradeExam(shoeConfig, [
      run("shoe", 10, { presented: 10, timedOut: true, roundsCompleted: 2 }),
    ]);
    // Accuracy alone would have cleared the floor; the unfinished shoe is what fails it.
    expect(result.sections[0].accuracy).toBe(100);
    expect(result.sections[0].passed).toBe(false);
    expect(result.overallPassed).toBe(false);
  });

  it("passes a shoe that ran out of time only after completing its rounds", () => {
    const result = gradeExam(shoeConfig, [
      run("shoe", 20, { presented: 20, timedOut: true, roundsCompleted: 4 }),
    ]);
    expect(result.sections[0].passed).toBe(true);
  });
});

describe("examToSession", () => {
  const result = gradeExam(config({ id: "hi-lo-checkout", name: "Hi-Lo Checkout" }), [
    run("conversion", 10, { bestStreak: 10 }),
    run("deviations", 8, {
      bestStreak: 4,
      mistakes: [{ question: "16 v 10", userAnswer: "Hit", correctAnswer: "Stand", explanation: "Index 0." }],
    }),
  ]);
  const session = examToSession(result);

  it("records under its own drill type so it cannot pollute another drill's history", () => {
    expect(session.drill).toBe("Test Out");
  });

  it("carries the pass verdict and the exam identity in tags and metrics", () => {
    expect(session.tags).toEqual(["test-out", "hi-lo-checkout", "failed"]);
    expect(session.metrics?.examId).toBe("hi-lo-checkout");
    expect(session.metrics?.passed).toBe(false);
    expect(session.metrics?.validDays).toBe(30);
    expect(session.metrics?.failedSections).toBe("deviations");
  });

  it("keeps every metric a scalar, because Session.metrics cannot hold arrays", () => {
    for (const [key, value] of Object.entries(session.metrics ?? {})) {
      expect(["string", "number", "boolean"], key).toContain(typeof value);
    }
  });

  it("scores per section, so a weak skill is visible in the record", () => {
    expect(session.categories).toEqual({
      "True count": { correct: 10, total: 10 },
      "Index deviations": { correct: 8, total: 10 },
    });
    expect(session.questions).toBe(20);
    expect(session.correct).toBe(18);
    expect(session.accuracy).toBe(90);
  });

  it("collects mistakes from every section", () => {
    expect(session.mistakes).toHaveLength(1);
    expect(session.mistakes[0].correctAnswer).toBe("Stand");
  });

  it("reports the best streak across sections", () => {
    expect(session.bestStreak).toBe(10);
  });
});

describe("validateExamConfig", () => {
  it("accepts a well-formed config", () => {
    expect(validateExamConfig(config())).toEqual([]);
  });

  it("rejects an exam with nothing enabled", () => {
    const problems = validateExamConfig(config({ sections: [] }));
    expect(problems.map((problem) => problem.field)).toContain("sections");
  });

  it("rejects impossible section counts, floors, and clocks", () => {
    const broken = config({
      sections: [
        { id: "conversion", enabled: true, questions: 0, timeLimitSeconds: 5, passAccuracy: 140 },
      ],
    });
    expect(validateExamConfig(broken)).toHaveLength(3);
  });

  it("does not complain about disabled sections", () => {
    const broken = config({
      sections: [
        { id: "conversion", enabled: true, questions: 10, timeLimitSeconds: null, passAccuracy: 90 },
        { id: "shoe", enabled: false, questions: 0, timeLimitSeconds: 1, passAccuracy: 900 },
      ],
    });
    expect(validateExamConfig(broken)).toEqual([]);
  });

  it("rejects a certification that expires immediately", () => {
    expect(validateExamConfig(config({ validDays: 0 })).map((problem) => problem.field)).toContain("validDays");
  });

  it("counts the shoe in rounds when it complains", () => {
    const broken = config({ sections: [{ id: "shoe", enabled: true, questions: 0, timeLimitSeconds: null, passAccuracy: 90 }] });
    expect(validateExamConfig(broken)[0].message).toContain("at least one round");
  });
});

describe("enabledSections", () => {
  it("preserves configured order", () => {
    const ordered = config({
      sections: [
        { id: "shoe", enabled: true, questions: 2, timeLimitSeconds: null, passAccuracy: 90 },
        { id: "counting", enabled: false, questions: 2, timeLimitSeconds: null, passAccuracy: 90 },
        { id: "betting", enabled: true, questions: 2, timeLimitSeconds: null, passAccuracy: 90 },
      ],
    });
    expect(enabledSections(ordered).map((section) => section.id)).toEqual(["shoe", "betting"]);
  });
});

describe("isolation from the counting benchmark", () => {
  // The retired proficiency test recorded under `drill: "True Count"` with a
  // tag, so a bad run at it could flip the benchmark's 95% true-count gate —
  // which reads the newest True Count session tag-blind.
  it("does not let a failed exam flip a counting benchmark gate", () => {
    const goodTrueCount = {
      id: "a",
      drill: "True Count" as const,
      questions: 20,
      correct: 20,
      accuracy: 100,
      averageResponseTime: 2000,
      bestStreak: 20,
      date: "2026-06-01T00:00:00.000Z",
      mistakes: [],
    };
    const failedExam = {
      ...examToSession(gradeExam(config(), [run("conversion", 0), run("deviations", 0)])),
      date: "2026-06-02T00:00:00.000Z",
    };
    const withExam = countingMastery([failedExam, goodTrueCount]);
    const withoutExam = countingMastery([goodTrueCount]);
    const gate = (checks: { label: string; met: boolean }[]) =>
      checks.find((check) => check.label.includes("true-count"))!.met;
    expect(gate(withExam.checks)).toBe(true);
    expect(gate(withExam.checks)).toBe(gate(withoutExam.checks));
  });
});
