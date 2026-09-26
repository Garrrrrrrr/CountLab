import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import type { CvcxTemplateConfig } from "./cvcxLibrary";
import {
  changedFields,
  configKey,
  DEFAULT_LAB_CONFIG,
  hasAuditedRules,
  isLabConfig,
  labDraftKey,
  normalizeConfig,
  parseLabDraft,
  ruleStates,
  snapDealt,
  toTemplateConfig,
  uniqueName,
  venueGaps,
  venuePatch,
} from "./labConfig";
import { expandRamp } from "./rampSteps";

/** A scenario saved by an early version of the Lab: sparse ramp, the old hand triple, no doubling rule or play mode. */
const legacy: CvcxTemplateConfig = {
  decks: 6, dealt: 4.5, bankroll: 20000, handsPerHour: 90, hours: 50, targetRisk: 0.05, maxSpread: 8, wongInAt: 1,
  rampName: "1-8", ramp: RAMPS["1-8"], chipIncrement: 0.5, baseBet: 25,
  playerHands: 1, extraHandsAt: 3, highCountHands: 2,
  dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5,
};

describe("normalizeConfig", () => {
  it("loads a legacy scenario the way the Lab always has", () => {
    const config = normalizeConfig(legacy);
    expect(config.ramp).toEqual(expandRamp(RAMPS["1-8"]));
    expect(config.hands.filter((point) => point.hands === 2).map((point) => point.trueCount)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(config.doubleRule).toBe("any2");
    expect(config.useIndices).toBe(true);
    expect(normalizeConfig({ ...legacy, useIndices: false }).useIndices).toBe(false);
  });

  it("does not report a freshly loaded legacy scenario as edited", () => {
    const loaded = normalizeConfig(legacy);
    expect(configKey(loaded)).toBe(configKey(normalizeConfig(legacy)));
    expect(configKey(normalizeConfig(toTemplateConfig(loaded)))).toBe(configKey(loaded));
  });

  it("round-trips the page's own saves exactly", () => {
    const saved = toTemplateConfig(DEFAULT_LAB_CONFIG);
    expect(normalizeConfig(saved)).toEqual(DEFAULT_LAB_CONFIG);
  });

  it("snaps float noise to the audited penetration", () => {
    expect(snapDealt(6, 4.749999999)).toBe(4.75);
    expect(snapDealt(8, 6.3)).toBe(6.3);
    expect(normalizeConfig({ ...legacy, dealt: 5.2500000001 }).dealt).toBe(5.25);
  });
});

describe("toTemplateConfig", () => {
  it("writes the saved-scenario fields in the order the Lab has always written them", () => {
    expect(Object.keys(toTemplateConfig(DEFAULT_LAB_CONFIG))).toEqual([
      "decks", "dealt", "bankroll", "baseBet", "handsPerHour", "hours", "targetRisk", "maxSpread", "wongInAt",
      "rampName", "ramp", "chipIncrement", "hands",
      "dealerHitsSoft17", "doubleAfterSplit", "resplitAces", "lateSurrender", "europeanNoHoleCard", "blackjackPayout", "useIndices", "doubleRule",
    ]);
  });
});

describe("configKey", () => {
  it("changes with any input and ignores sparse versus expanded ramps", () => {
    const base = configKey(DEFAULT_LAB_CONFIG);
    expect(configKey({ ...DEFAULT_LAB_CONFIG, bankroll: 25001 })).not.toBe(base);
    expect(configKey({ ...DEFAULT_LAB_CONFIG, ramp: RAMPS["1-12"] })).toBe(base);
  });
});

describe("changedFields", () => {
  it("keeps only the previous values of fields that actually change", () => {
    expect(changedFields(DEFAULT_LAB_CONFIG, { decks: 8, dealt: 6, bankroll: 25000 })).toEqual({ decks: 6, dealt: 4.5 });
    expect(changedFields(DEFAULT_LAB_CONFIG, { ramp: expandRamp(RAMPS["1-12"]) })).toEqual({});
  });
});

describe("uniqueName", () => {
  it("numbers copies instead of repeating a name", () => {
    expect(uniqueName("Weekend", [])).toBe("Weekend");
    expect(uniqueName("Weekend", ["Weekend"])).toBe("Weekend (2)");
    expect(uniqueName("Weekend", ["Weekend", "Weekend (2)"])).toBe("Weekend (3)");
    expect(uniqueName("Weekend (2)", ["Weekend", "Weekend (2)"])).toBe("Weekend (3)");
    expect(uniqueName("  Trip  ", ["Other"])).toBe("Trip");
  });
});

describe("ruleStates", () => {
  it("describes the audited game in plain words", () => {
    expect(ruleStates(DEFAULT_LAB_CONFIG).map((rule) => rule.label)).toEqual([
      "Dealer hits soft 17", "Blackjack pays 3:2", "Double any two cards", "Double after split", "Resplit aces", "Late surrender", "Dealer peeks",
    ]);
    expect(hasAuditedRules(DEFAULT_LAB_CONFIG)).toBe(true);
  });

  it("marks the rules that differ from the audited game", () => {
    const rules = ruleStates({ ...DEFAULT_LAB_CONFIG, dealerHitsSoft17: false, doubleRule: "10to11", europeanNoHoleCard: true });
    expect(rules.filter((rule) => rule.differs).map((rule) => rule.label)).toEqual(["Dealer stands on soft 17", "Double 10–11 only", "No hole card (European)"]);
    expect(hasAuditedRules({ ...DEFAULT_LAB_CONFIG, blackjackPayout: 1.2 })).toBe(false);
  });
});

describe("venues", () => {
  const preset = { id: "v", name: "Downtown", createdAt: "2026-01-01", rules: { ...DEFAULT_ADVANTAGE_RULES, decks: 8, penetration: 6.5 / 8, dealerHitsSoft17: false, useIndices: false }, ramp: RAMPS["1-8"] };

  it("loads the venue's game, rules, play mode and ramp", () => {
    expect(venuePatch(preset)).toMatchObject({ decks: 8, dealt: 6.5, dealerHitsSoft17: false, useIndices: false, rampName: "Custom", maxSpread: 8, ramp: expandRamp(RAMPS["1-8"]) });
  });

  it("leaves the play mode alone for venues saved without one", () => {
    const rules = { ...preset.rules };
    delete rules.useIndices;
    expect("useIndices" in venuePatch({ ...preset, rules })).toBe(false);
  });

  it("lists what a venue cannot store", () => {
    expect(venueGaps(DEFAULT_LAB_CONFIG)).toEqual([]);
    const hands = DEFAULT_LAB_CONFIG.hands.map((point) => (point.trueCount > 3 ? { ...point, hands: 2 } : point));
    expect(venueGaps({ ...DEFAULT_LAB_CONFIG, europeanNoHoleCard: true, doubleRule: "9to11", wongInAt: 1, hands })).toEqual(["the no-hole-card rule", "the doubling rule", "When you play", "hands per count"]);
  });
});

describe("working draft", () => {
  it("is keyed by account", () => {
    expect(labDraftKey("guest")).toBe("countlab:lab-draft:guest");
    expect(labDraftKey("user-1")).not.toBe(labDraftKey("guest"));
  });

  it("reads back what was stored", () => {
    const draft = { version: 1 as const, config: DEFAULT_LAB_CONFIG, active: { id: "a", name: "A", snapshot: "{}" }, draftName: "Downtown · 6D" };
    expect(parseLabDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("rejects missing, damaged or foreign drafts", () => {
    expect(parseLabDraft(null)).toBeNull();
    expect(parseLabDraft("{")).toBeNull();
    expect(parseLabDraft(JSON.stringify({ version: 2, config: DEFAULT_LAB_CONFIG }))).toBeNull();
    expect(parseLabDraft(JSON.stringify({ version: 1, config: { ...DEFAULT_LAB_CONFIG, ramp: RAMPS["1-12"] } }))).toBeNull();
    expect(isLabConfig({ ...DEFAULT_LAB_CONFIG, bankroll: "lots" })).toBe(false);
    expect(parseLabDraft(JSON.stringify({ version: 1, config: DEFAULT_LAB_CONFIG, active: { id: 3 } }))?.active).toBeNull();
  });
});
