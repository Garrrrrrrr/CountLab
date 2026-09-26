import { describe, expect, it } from "vitest";
import { DEFAULT_ADVANTAGE_RULES, RAMPS } from "./advantage";
import type { CvcxTemplateConfig } from "./cvcxLibrary";
import type { JournalSession } from "./journal";
import {
  applyVenue,
  casinoNames,
  DEFAULT_GAME,
  DEFAULT_HOURS,
  draftFromSession,
  expandRamp,
  gameForCasino,
  gameFromScenario,
  gameFromSession,
  gameFromSimulationSetup,
  handsSummary,
  latestSession,
  localDateString,
  newSessionDraft,
  nextEntryDraft,
  normalizeHands,
  penetrationOptions,
  rampName,
  rampSummary,
  rememberedGame,
  rulesOf,
  rulesSummary,
  sameGame,
  sessionPayload,
  signedResult,
  sourceLabel,
  spreadLabel,
  usesVenue,
  validateSessionDraft,
} from "./journalForm";
import type { VenuePreset } from "./venuePresets";

function makeSession(overrides: Partial<JournalSession> = {}): JournalSession {
  return {
    id: "s1",
    createdAt: "2026-08-01T12:00:00.000Z",
    bankrollId: "main",
    date: "2026-08-01",
    hours: 4,
    handsPerHour: 100,
    playerHands: 1,
    bettingUnit: 25,
    rules: DEFAULT_ADVANTAGE_RULES,
    ramp: RAMPS["1-8"],
    netResult: 0,
    expenses: 0,
    ...overrides,
  };
}

const scenario: CvcxTemplateConfig = {
  decks: 8, dealt: 6.5, bankroll: 20000, handsPerHour: 90, hours: 12, targetRisk: 0.05, maxSpread: 12,
  wongInAt: 1, rampName: "1-12", ramp: RAMPS["1-12"], chipIncrement: 5, baseBet: 15,
  hands: Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, hands: 2 })),
  dealerHitsSoft17: false, doubleAfterSplit: true, resplitAces: false, lateSurrender: true, europeanNoHoleCard: false, blackjackPayout: 1.5,
};

describe("localDateString", () => {
  it("uses the local calendar day, not UTC", () => {
    // 9:30 pm on Sep 26 in a UTC-4 zone is already Sep 27 in UTC; built from
    // local fields, the date stays on the 26th wherever the test runs.
    const evening = new Date(2026, 8, 26, 21, 30);
    expect(localDateString(evening)).toBe("2026-09-26");
    expect(localDateString(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });
});

describe("latestSession", () => {
  it("orders by date, then by when the session was logged", () => {
    const sessions = [
      makeSession({ id: "a", date: "2026-09-02", createdAt: "2026-09-02T10:00:00Z" }),
      makeSession({ id: "b", date: "2026-09-03", createdAt: "2026-09-03T08:00:00Z" }),
      makeSession({ id: "c", date: "2026-09-03", createdAt: "2026-09-03T09:00:00Z" }),
      makeSession({ id: "d", date: "2026-08-30", createdAt: "2026-09-10T09:00:00Z" }),
    ];
    expect(latestSession(sessions)?.id).toBe("c");
  });

  it("ignores legacy invalid dates unless nothing else exists", () => {
    expect(latestSession([makeSession({ id: "bad", date: "2026-9-30" }), makeSession({ id: "ok", date: "2026-09-01" })])?.id).toBe("ok");
    expect(latestSession([makeSession({ id: "bad", date: "2026-9-30" })])?.id).toBe("bad");
    expect(latestSession([])).toBeUndefined();
  });
});

describe("gameFromSession and draftFromSession", () => {
  it("rebuilds dealt from penetration and keeps the unit, pace and ramp", () => {
    const game = gameFromSession(makeSession({ rules: { ...DEFAULT_ADVANTAGE_RULES, decks: 8, penetration: 0.8125 }, bettingUnit: 50, handsPerHour: 80 }));
    expect(game.decks).toBe(8);
    expect(game.dealt).toBe(6.5);
    expect(game.bettingUnit).toBe(50);
    expect(game.handsPerHour).toBe(80);
    expect(game.spread).toBe("1-8");
    expect(game.ramp).toHaveLength(17);
  });

  it("turns a stored per-count schedule into overrides", () => {
    const schedule = Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, hands: index - 8 >= 3 ? 2 : 1 }));
    const game = gameFromSession(makeSession({ handsByTrueCount: schedule }));
    expect(game.playerHands).toBe(1);
    expect(game.handsByCount).toEqual({ 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
    expect(handsSummary(game)).toBe("hands vary by count");
  });

  it("reads legacy sessions without useIndices as indices on", () => {
    const { useIndices: _omit, ...legacy } = DEFAULT_ADVANTAGE_RULES;
    void _omit;
    expect(gameFromSession(makeSession({ rules: legacy })).useIndices).toBe(true);
  });

  it("splits a signed result into direction and amount", () => {
    expect(draftFromSession(makeSession({ netResult: -200 }))).toMatchObject({ direction: "lost", amount: 200 });
    expect(draftFromSession(makeSession({ netResult: 350 }))).toMatchObject({ direction: "won", amount: 350 });
    expect(draftFromSession(makeSession({ netResult: 0 }))).toMatchObject({ direction: null, amount: 0 });
  });

  it("round-trips an unedited session to the same stored fields", () => {
    const session = makeSession({ netResult: -200, location: "Aria", notes: "Tough shoe", expenses: 12 });
    const payload = sessionPayload(draftFromSession(session));
    expect(payload).toMatchObject({ date: session.date, location: "Aria", hours: 4, netResult: -200, expenses: 12, notes: "Tough shoe", bankrollId: "main", bettingUnit: 25, playerHands: 1, handsPerHour: 100, handsByTrueCount: undefined });
    expect(payload.rules).toMatchObject({ decks: 6, penetration: 0.75, useIndices: true });
  });
});

describe("normalizeHands", () => {
  it("reads a uniform schedule as a number of hands at once", () => {
    expect(normalizeHands(1, Array.from({ length: 17 }, (_, index) => ({ trueCount: index - 8, hands: 2 })))).toEqual({ playerHands: 2, handsByCount: {} });
  });

  it("reads a sparse stored schedule the way the engine does, as steps", () => {
    expect(normalizeHands(1, [{ trueCount: 2, hands: 2 }]).handsByCount).toEqual({ 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2 });
  });
});

describe("gameFromScenario", () => {
  it("matches the ScenarioPicker mapping", async () => {
    const { scenarioRamp } = await import("@/components/ScenarioPicker");
    const ramp = scenarioRamp(scenario);
    const game = gameFromScenario(scenario, ramp);
    expect(game).toMatchObject({ decks: 8, dealt: 6.5, bettingUnit: 15, handsPerHour: 90, dealerHitsSoft17: false, resplitAces: false, useIndices: true, playerHands: 2, handsByCount: {} });
    // Counts below the wong-in point sit out.
    expect(game.ramp.filter((point) => point.trueCount < 1).every((point) => point.units === 0)).toBe(true);
    expect(game.ramp.find((point) => point.trueCount === 4)?.units).toBe(12);
    expect(handsSummary(game)).toBe("2 hands at once");
  });

  it("honours an explicit basic-strategy scenario", () => {
    expect(gameFromScenario({ ...scenario, useIndices: false }, scenario.ramp).useIndices).toBe(false);
  });
});

describe("gameFromSimulationSetup and applyVenue", () => {
  it("takes rules, unit, hands, pace and ramp from a Simulator setup", () => {
    const game = gameFromSimulationSetup({ bankroll: 1, bettingUnit: 40, playerHands: 2, rounds: 1, paths: 1, roundsPerHour: 70, seed: "x", rules: { ...DEFAULT_ADVANTAGE_RULES, penetration: 5 / 6 }, ramp: RAMPS["1-4"] });
    expect(game).toMatchObject({ bettingUnit: 40, playerHands: 2, handsPerHour: 70, dealt: 5, spread: "1-4", handsByCount: {} });
  });

  it("leaves the unit, pace and hands alone when a venue is applied", () => {
    const current = { ...DEFAULT_GAME, bettingUnit: 60, handsPerHour: 75, playerHands: 2, handsByCount: { 4: 3 } };
    const venue = { rules: { ...DEFAULT_ADVANTAGE_RULES, dealerHitsSoft17: false, blackjackPayout: 1.2 as const }, ramp: RAMPS["1-12"] };
    const game = applyVenue(current, venue);
    expect(game).toMatchObject({ bettingUnit: 60, handsPerHour: 75, playerHands: 2, handsByCount: { 4: 3 }, dealerHitsSoft17: false, blackjackPayout: 1.2, spread: "1-12" });
    expect(usesVenue(game, venue)).toBe(true);
    expect(usesVenue(current, venue)).toBe(false);
  });
});

describe("sameGame", () => {
  it("ignores the spread's display name but not the bets", () => {
    expect(sameGame(DEFAULT_GAME, { ...DEFAULT_GAME, spread: "Custom" })).toBe(true);
    expect(sameGame(DEFAULT_GAME, { ...DEFAULT_GAME, bettingUnit: 26 })).toBe(false);
    expect(sameGame(DEFAULT_GAME, { ...DEFAULT_GAME, handsByCount: { 5: 2 } })).toBe(false);
  });
});

describe("signedResult", () => {
  it("applies the chosen direction to a magnitude", () => {
    expect(signedResult("lost", 200)).toBe(-200);
    expect(signedResult("won", 200)).toBe(200);
    expect(signedResult("lost", -200)).toBe(-200);
    expect(signedResult(undefined, 0)).toBe(0);
    expect(signedResult("lost", 0)).toBe(0);
  });
});

describe("validateSessionDraft", () => {
  it("checks date, then amount, then direction", () => {
    expect(validateSessionDraft({ date: "", amount: null, direction: null })).toEqual(["date", "amount"]);
    expect(validateSessionDraft({ date: "2026-09-01", amount: null, direction: "won" })).toEqual(["amount"]);
    expect(validateSessionDraft({ date: "2026-09-01", amount: 150, direction: null })).toEqual(["direction"]);
    expect(validateSessionDraft({ date: "2026-09-01", amount: 0, direction: null })).toEqual([]);
    expect(validateSessionDraft({ date: "2026-02-30", amount: 10, direction: "lost" })).toEqual(["date"]);
  });
});

describe("sessionPayload", () => {
  it("never saves a blank as text and signs the amount", () => {
    const draft = { ...newSessionDraft({ game: DEFAULT_GAME, source: { kind: "default" }, hours: 3, bankrollId: "b", today: "2026-09-26" }), location: "  ", notes: " \n", amount: 450, direction: "lost" as const };
    const payload = sessionPayload(draft);
    expect(payload).toMatchObject({ date: "2026-09-26", hours: 3, netResult: -450, location: undefined, notes: undefined, bankrollId: "b", handsByTrueCount: undefined });
  });

  it("saves the per-count schedule only when there are overrides", () => {
    const draft = { ...newSessionDraft({ game: { ...DEFAULT_GAME, handsByCount: { 4: 2 } }, source: { kind: "edited" }, hours: 3, bankrollId: "b" }), amount: 0 };
    expect(sessionPayload(draft).handsByTrueCount).toHaveLength(17);
    expect(sessionPayload(draft).handsByTrueCount?.find((point) => point.trueCount === 4)?.hands).toBe(2);
  });

  it("keeps the date, casino and game for the next entry but clears the result", () => {
    const draft = { ...newSessionDraft({ game: DEFAULT_GAME, source: { kind: "default" }, hours: 3, bankrollId: "b", today: "2026-09-26" }), location: "Aria", amount: 90, direction: "won" as const, expenses: 20, notes: "x" };
    expect(nextEntryDraft(draft)).toMatchObject({ date: "2026-09-26", location: "Aria", hours: 3, amount: null, direction: null, expenses: 0, notes: "" });
  });
});

describe("rememberedGame", () => {
  it("starts from the latest session, or the defaults", () => {
    expect(rememberedGame([])).toMatchObject({ hours: DEFAULT_HOURS, source: { kind: "default" } });
    const remembered = rememberedGame([makeSession({ bettingUnit: 50, hours: 6, location: " Bellagio ", date: "2026-09-20" })]);
    expect(remembered.game.bettingUnit).toBe(50);
    expect(remembered.hours).toBe(6);
    expect(remembered.source).toEqual({ kind: "latest", date: "2026-09-20", location: "Bellagio" });
    expect(sourceLabel(remembered.source)).toMatch(/^From your latest session \(Sep 20.* · Bellagio\)$/);
  });
});

describe("labels", () => {
  it("names the spread by its largest bet over its smallest", () => {
    expect(spreadLabel(RAMPS["1-8"])).toBe("1–8");
    expect(spreadLabel([{ trueCount: -8, units: 0 }, { trueCount: 1, units: 2 }, { trueCount: 4, units: 16 }])).toBe("1–8");
    expect(spreadLabel([{ trueCount: -8, units: 1.5 }, { trueCount: 3, units: 8 }])).toBe("1–5.3");
    expect(spreadLabel([{ trueCount: -8, units: 0 }])).toBe("Sit out");
  });

  it("recognises preset ramps whatever their shape", () => {
    expect(rampName(expandRamp(RAMPS["1-12"]))).toBe("1-12");
    expect(rampName([{ trueCount: -8, units: 1 }, { trueCount: 5, units: 3 }])).toBe("Custom");
  });

  it("summarises every rule, on and off", () => {
    expect(rulesSummary(DEFAULT_ADVANTAGE_RULES)).toBe("6 decks · 4.5 of 6 dealt · H17 · DAS · RSA · LS · 3:2 · Indices");
    expect(rulesSummary(rulesOf({ ...DEFAULT_GAME, decks: 8, dealt: 6, dealerHitsSoft17: false, doubleAfterSplit: false, resplitAces: false, lateSurrender: false, blackjackPayout: 1.2, useIndices: false })))
      .toBe("8 decks · 6 of 8 dealt · S17 · No DAS · No RSA · No surrender · 6:5 · Basic only");
  });

  it("reads a ramp as runs of equal bets", () => {
    expect(rampSummary(RAMPS["1-8"], 25)).toEqual([
      { counts: "≤ 0", bet: "$25" },
      { counts: "+1", bet: "$50" },
      { counts: "+2", bet: "$100" },
      { counts: "+3", bet: "$150" },
      { counts: "+4 and up", bet: "$200" },
    ]);
    expect(rampSummary([{ trueCount: -8, units: 0 }, { trueCount: -1, units: 1 }], 10)).toEqual([
      { counts: "≤ −2", bet: "sit out" },
      { counts: "−1 and up", bet: "$10" },
    ]);
    expect(rampSummary([{ trueCount: -8, units: 1 }], 12.5)).toEqual([{ counts: "Every count", bet: "$12.50" }]);
  });

  it("keeps an off-list penetration selectable", () => {
    expect(penetrationOptions(6, 4.5)).toEqual([4, 4.5, 4.75, 5, 5.25]);
    expect(penetrationOptions(6, 4.2)).toEqual([4, 4.2, 4.5, 4.75, 5, 5.25]);
  });
});

describe("casino suggestions", () => {
  const presets: VenuePreset[] = [
    { id: "old", name: "Aria", createdAt: "2026-01-01T00:00:00Z", rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-4"] },
    { id: "new", name: "aria ", createdAt: "2026-06-01T00:00:00Z", rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-12"] },
    { id: "wynn", name: "Wynn", createdAt: "2026-06-01T00:00:00Z", rules: DEFAULT_ADVANTAGE_RULES, ramp: RAMPS["1-8"] },
  ];
  const sessions = [
    makeSession({ id: "a", location: "Bellagio", date: "2026-09-01" }),
    makeSession({ id: "b", location: "Aria", date: "2026-09-05" }),
    makeSession({ id: "c", location: "bellagio", date: "2026-09-09", bettingUnit: 40 }),
  ];

  it("lists each casino once, most recently played first, then saved venues", () => {
    expect(casinoNames(sessions, presets)).toEqual(["bellagio", "Aria", "Wynn"]);
  });

  it("prefers the newest saved venue with that name, else the last session there", () => {
    expect(gameForCasino("ARIA", sessions, presets)).toMatchObject({ kind: "venue", preset: { id: "new" } });
    expect(gameForCasino("Bellagio", sessions, presets)).toMatchObject({ kind: "session", session: { id: "c" } });
    expect(gameForCasino("Golden Nugget", sessions, presets)).toBeNull();
    expect(gameForCasino("  ", sessions, presets)).toBeNull();
  });
});
