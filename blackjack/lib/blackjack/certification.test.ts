import { describe, expect, it } from "vitest";
import {
  EXPIRING_WINDOW_DAYS,
  certificationFor,
  certifications,
  examAttempts,
  latestAttempt,
} from "./certification";
import { EXAM_PRESETS, buildSections, customExamConfig, examPresets, examRulesFromSettings, findPreset } from "./examPresets";
import { EXAM_SECTIONS, validateExamConfig } from "./testOut";
import { DEFAULT_SETTINGS, Session } from "../statistics/storage";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

function attempt(overrides: Partial<Session> & { metrics?: Session["metrics"] } = {}): Session {
  return {
    id: Math.random().toString(36).slice(2),
    drill: "Test Out",
    questions: 20,
    correct: 19,
    accuracy: 95,
    averageResponseTime: 3000,
    bestStreak: 10,
    date: daysBefore(1),
    mistakes: [],
    ...overrides,
    metrics: {
      examId: "hi-lo-checkout",
      examName: "Hi-Lo Checkout",
      passed: true,
      validDays: 30,
      rulesSummary: "6D H17 DAS RSA LS, 75% pen",
      ...overrides.metrics,
    },
  };
}

describe("examAttempts", () => {
  it("picks out test-out sessions and orders them newest first", () => {
    const sessions: Session[] = [
      attempt({ date: daysBefore(5) }),
      { ...attempt({ date: daysBefore(1) }), drill: "True Count" },
      attempt({ date: daysBefore(2) }),
    ];
    const found = examAttempts(sessions);
    expect(found).toHaveLength(2);
    expect(found.map((session) => session.date)).toEqual([daysBefore(2), daysBefore(5)]);
  });

  it("returns nothing when the history holds no exams", () => {
    expect(examAttempts([{ ...attempt(), drill: "Deviations" }])).toEqual([]);
  });
});

describe("certifications", () => {
  it("is current well inside the validity window", () => {
    const [certification] = certifications([attempt({ date: daysBefore(2) })], NOW);
    expect(certification.status).toBe("current");
    expect(certification.daysRemaining).toBe(28);
    expect(certification.name).toBe("Hi-Lo Checkout");
    expect(certification.rulesSummary).toBe("6D H17 DAS RSA LS, 75% pen");
  });

  it("warns in the last week before expiry", () => {
    const [certification] = certifications([attempt({ date: daysBefore(30 - EXPIRING_WINDOW_DAYS) })], NOW);
    expect(certification.status).toBe("expiring");
    expect(certification.daysRemaining).toBe(EXPIRING_WINDOW_DAYS);
  });

  it("lapses the moment the window closes", () => {
    const exactly = certifications([attempt({ date: daysBefore(30) })], NOW);
    expect(exactly[0].status).toBe("lapsed");
    expect(exactly[0].daysRemaining).toBe(0);

    const wellPast = certifications([attempt({ date: daysBefore(40) })], NOW);
    expect(wellPast[0].status).toBe("lapsed");
    expect(wellPast[0].daysRemaining).toBe(-10);
  });

  it("stays current a moment before the window closes", () => {
    const session = attempt({ date: new Date(NOW.getTime() - 30 * DAY_MS + 1000).toISOString() });
    expect(certifications([session], NOW)[0].status).toBe("expiring");
  });

  it("honours the exam's own validity window", () => {
    const shortLived = attempt({ date: daysBefore(10), metrics: { validDays: 7 } });
    expect(certifications([shortLived], NOW)[0].status).toBe("lapsed");
    const longLived = attempt({ date: daysBefore(10), metrics: { validDays: 90 } });
    expect(certifications([longLived], NOW)[0].status).toBe("current");
  });

  it("ignores failed attempts entirely", () => {
    const failed = attempt({ metrics: { passed: false } });
    expect(certifications([failed], NOW)).toEqual([]);
  });

  it("keeps a valid certification when a later attempt fails", () => {
    const sessions = [
      attempt({ date: daysBefore(1), metrics: { passed: false } }),
      attempt({ date: daysBefore(5) }),
    ];
    const [certification] = certifications(sessions, NOW);
    expect(certification.status).toBe("current");
    expect(certification.passedAt).toBe(daysBefore(5));
  });

  it("takes the newest pass when there are several", () => {
    const sessions = [
      attempt({ date: daysBefore(20), accuracy: 96 }),
      attempt({ date: daysBefore(3), accuracy: 99 }),
      attempt({ date: daysBefore(9), accuracy: 97 }),
    ];
    const found = certifications(sessions, NOW);
    expect(found).toHaveLength(1);
    expect(found[0].accuracy).toBe(99);
  });

  it("tracks each exam separately", () => {
    const sessions = [
      attempt({ date: daysBefore(1) }),
      attempt({ date: daysBefore(2), metrics: { examId: "index-certification", examName: "Index Certification" } }),
    ];
    const found = certifications(sessions, NOW);
    expect(found.map((certification) => certification.examId)).toEqual(["hi-lo-checkout", "index-certification"]);
  });

  it("skips records missing the fields it needs rather than inventing them", () => {
    const noExamId = attempt();
    delete noExamId.metrics!.examId;
    const badDate = attempt({ date: "not a date" });
    expect(certifications([noExamId, badDate], NOW)).toEqual([]);
  });

  it("defaults a missing validity window to thirty days", () => {
    const session = attempt({ date: daysBefore(2) });
    delete session.metrics!.validDays;
    expect(certifications([session], NOW)[0].daysRemaining).toBe(28);
  });
});

describe("certificationFor and latestAttempt", () => {
  const sessions = [
    attempt({ date: daysBefore(1), metrics: { passed: false } }),
    attempt({ date: daysBefore(4) }),
  ];

  it("finds the standing certification for one exam", () => {
    expect(certificationFor("hi-lo-checkout", sessions, NOW)?.passedAt).toBe(daysBefore(4));
    expect(certificationFor("counting-checkout", sessions, NOW)).toBeUndefined();
  });

  it("finds the newest attempt whether or not it passed", () => {
    expect(latestAttempt("hi-lo-checkout", sessions)?.date).toBe(daysBefore(1));
    expect(latestAttempt("counting-checkout", sessions)).toBeUndefined();
  });
});

describe("presets", () => {
  it("every preset is runnable", () => {
    for (const preset of EXAM_PRESETS) {
      expect(validateExamConfig(preset), preset.name).toEqual([]);
    }
  });

  it("gives every preset a unique id and at least one enabled section", () => {
    const ids = EXAM_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of EXAM_PRESETS) {
      expect(preset.sections.some((section) => section.enabled), preset.name).toBe(true);
      expect(preset.description.length, preset.name).toBeGreaterThan(0);
    }
  });

  it("carries every section so a disabled one keeps a usable default", () => {
    for (const preset of EXAM_PRESETS) {
      expect(preset.sections.map((section) => section.id)).toEqual(EXAM_SECTIONS.map((section) => section.id));
      for (const section of preset.sections) {
        expect(section.questions, `${preset.name}/${section.id}`).toBeGreaterThan(0);
        expect(section.passAccuracy, `${preset.name}/${section.id}`).toBeGreaterThanOrEqual(0);
        expect(section.passAccuracy, `${preset.name}/${section.id}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("the full checkout covers every section", () => {
    const checkout = findPreset("hi-lo-checkout")!;
    expect(checkout.sections.filter((section) => section.enabled)).toHaveLength(EXAM_SECTIONS.length);
  });

  it("reproduces the retired proficiency test", () => {
    const quick = findPreset("quick-true-count")!;
    const enabled = quick.sections.filter((section) => section.enabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe("conversion");
    expect(enabled[0].questions).toBe(50);
    expect(enabled[0].timeLimitSeconds).toBe(300);
  });

  it("holds counting to a perfect score, because a near-right count is wrong", () => {
    const checkout = findPreset("hi-lo-checkout")!;
    expect(checkout.sections.find((section) => section.id === "counting")!.passAccuracy).toBe(100);
  });

  it("grades against the saved training rules", () => {
    const settings = { ...DEFAULT_SETTINGS, decks: 8, dealerHitsSoft17: false, lateSurrender: false, penetration: 0.85 };
    const [checkout] = examPresets(settings);
    expect(checkout.rules.decks).toBe(8);
    expect(checkout.rules.dealerHitsSoft17).toBe(false);
    expect(checkout.rules.lateSurrender).toBe(false);
    expect(checkout.rules.penetration).toBe(0.85);
    expect(examRulesFromSettings(settings).rounding).toBe(settings.rounding);
  });

  it("returns undefined for an unknown preset instead of guessing", () => {
    expect(findPreset("nope")).toBeUndefined();
  });
});

describe("buildSections", () => {
  it("returns every section in canonical order, enabling only what was asked for", () => {
    const sections = buildSections(["betting", "counting"]);
    expect(sections.map((section) => section.id)).toEqual(EXAM_SECTIONS.map((section) => section.id));
    expect(sections.filter((section) => section.enabled).map((section) => section.id)).toEqual(["counting", "betting"]);
  });
});

describe("customExamConfig", () => {
  it("starts from the full checkout under its own id", () => {
    const custom = customExamConfig();
    expect(custom.id).toBe("custom");
    expect(validateExamConfig(custom)).toEqual([]);
    expect(custom.sections.filter((section) => section.enabled)).toHaveLength(EXAM_SECTIONS.length);
  });
});
