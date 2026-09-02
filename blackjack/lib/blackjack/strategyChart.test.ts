import { describe, expect, it } from "vitest";
import { CHART_CODES, chartCell, resolveCode } from "./strategyChart";
import { getBasicStrategyDecision } from "./basicStrategy";
import { BlackjackRules, Card, Rank } from "./types";

const all = { canDouble: true, canSplit: true, doubleAfterSplit: true, canSurrender: true };

describe("resolveCode", () => {
  it("passes unconditional codes straight through", () => {
    expect(resolveCode("H", all)).toEqual({ action: "H" });
    expect(resolveCode("S", all)).toEqual({ action: "S" });
    expect(resolveCode("P", all)).toEqual({ action: "P" });
  });

  it("doubles when allowed and records the fallback", () => {
    expect(resolveCode("D", all)).toEqual({ action: "D", fallback: "H" });
    expect(resolveCode("Ds", all)).toEqual({ action: "D", fallback: "S" });
  });

  it("demotes doubles to their own fallback", () => {
    expect(resolveCode("D", { ...all, canDouble: false })).toEqual({ action: "H" });
    expect(resolveCode("Ds", { ...all, canDouble: false })).toEqual({ action: "S" });
  });

  it("demotes DAS-conditional splits to their own fallback", () => {
    expect(resolveCode("Ph", { ...all, doubleAfterSplit: false })).toEqual({ action: "H" });
    expect(resolveCode("Ps", { ...all, doubleAfterSplit: false })).toEqual({ action: "S" });
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false })).toEqual({ action: "D", fallback: "H" });
  });

  it("splits DAS-conditional cells when DAS is on", () => {
    for (const code of ["Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, all)).toEqual({ action: "P" });
    }
  });

  it("demotes a Pd to a hit when doubling is also unavailable", () => {
    expect(resolveCode("Pd", { ...all, doubleAfterSplit: false, canDouble: false })).toEqual({ action: "H" });
  });

  it("surrenders when offered and falls back otherwise", () => {
    expect(resolveCode("Rh", all)).toEqual({ action: "R", fallback: "H" });
    expect(resolveCode("Rh", { ...all, canSurrender: false })).toEqual({ action: "H" });
    expect(resolveCode("Rs", { ...all, canSurrender: false })).toEqual({ action: "S" });
    expect(resolveCode("Rp", { ...all, canSurrender: false })).toEqual({ action: "P" });
  });

  it("demotes an Rp to the pair's own fallback when splitting is unavailable", () => {
    expect(resolveCode("Rp", { ...all, canSurrender: false, canSplit: false })).toEqual({ action: "H" });
  });

  it("names a legal fallback for Rp when surrender is offered but splitting is not", () => {
    expect(resolveCode("Rp", { ...all, canSplit: false })).toEqual({ action: "R", fallback: "H" });
  });

  it("never splits when splitting is unavailable", () => {
    for (const code of ["P", "Ph", "Pd", "Ps"] as const) {
      expect(resolveCode(code, { ...all, canSplit: false }).action).not.toBe("P");
    }
  });

  it("lists exactly the eleven supported codes", () => {
    expect([...CHART_CODES].sort()).toEqual(["D", "Ds", "H", "P", "Pd", "Ph", "Ps", "Rh", "Rp", "Rs", "S"]);
  });
});

describe("chartCell permissions", () => {
  const anyDouble = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const tensOnly = { ...anyDouble, doubleRule: "10-11" as const };

  it("keeps the table's doubleRule in force when the caller also permits doubling", () => {
    // The caller's `canDouble` is a further restriction, not a replacement.
    // Without composition here `doubleRule` would be dead for every caller that
    // passes the flag at all, which is every caller `basicStrategy` has.
    expect(chartCell(anyDouble, "hard", "9", "3", { canDouble: true }).action).toBe("D");
    expect(chartCell(tensOnly, "hard", "9", "3", { canDouble: true }).action).toBe("H");
    expect(chartCell(tensOnly, "hard", "11", "3", { canDouble: true }).action).toBe("D");
    // Soft doubles are never permitted under a restriction, whatever the caller says.
    expect(chartCell(anyDouble, "soft", "A,6", "4", { canDouble: true }).action).toBe("D");
    expect(chartCell(tensOnly, "soft", "A,6", "4", { canDouble: true }).action).toBe("H");
  });

  it("still lets the caller withhold a double the table would have allowed", () => {
    expect(chartCell(anyDouble, "hard", "11", "3", { canDouble: false }).action).toBe("H");
    expect(chartCell(anyDouble, "soft", "A,7", "4", { canDouble: false }).action).toBe("S");
  });

  it("lets the caller override the permissions that are not double-related", () => {
    expect(chartCell(anyDouble, "pairs", "8,8", "5").action).toBe("P");
    expect(chartCell(anyDouble, "pairs", "8,8", "5", { canSplit: false }).action).toBe("H");
    expect(chartCell(anyDouble, "hard", "16", "10").action).toBe("R");
    expect(chartCell(anyDouble, "hard", "16", "10", { canSurrender: false }).action).toBe("H");
    expect(chartCell(anyDouble, "pairs", "2,2", "3", { doubleAfterSplit: false }).action).toBe("H");
  });
});

const card = (rank: string, suit: Card["suit"] = "spades"): Card => ({ rank: (rank === "T" ? "10" : rank) as Rank, suit });

const RULES: BlackjackRules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" };

const decide = (cards: Card[], up: string, over: Partial<typeof RULES> = {}, canSplit?: boolean) =>
  getBasicStrategyDecision({ playerCards: cards, dealerUpcard: card(up, "diamonds"), rules: { ...RULES, ...over }, canSplit });

const pairOf = (rank: string): Card[] => [card(rank), card(rank, "hearts")];
const hard16 = (): Card[] => [card("10"), card("6", "hearts")];

/**
 * The six cells where the table deliberately disagrees with the branch-based
 * engine it replaces. Asserted as the behaviour the table now produces, not by
 * comparison against the old engine — that engine is gone.
 *
 * Five are DAS-conditional pair splits the old function decided without ever
 * consulting `doubleAfterSplit`. The audited `bjaH17Chart.ts` transcription
 * prints `Y/N` — its notation for "split only with DAS" — in exactly these
 * cells, and `strategyTables.test.ts` pins that agreement independently.
 *
 * The sixth is hard 16 v A under S17. The old engine gated that surrender
 * behind `dealerHitsSoft17`; the sourced S17 grid, the repo's own
 * `S17_PRO_DEVIATIONS` (an unconditional late-surrender row) and the measured
 * EV artifact all say it surrenders under S17 too.
 */
describe("cells this table corrects", () => {
  it.each([["6", "2"], ["3", "2"], ["3", "3"], ["2", "2"], ["2", "3"]])(
    "splits a pair of %ss against a dealer %s only when DAS is offered",
    (rank, dealer) => {
      expect(decide(pairOf(rank), dealer).action).toBe("P");
      expect(decide(pairOf(rank), dealer, { doubleAfterSplit: false }).action).toBe("H");
      // The correction is DAS-driven, not dealer-rule-driven: both grids print `Ph` here.
      expect(decide(pairOf(rank), dealer, { dealerHitsSoft17: false }).action).toBe("P");
      expect(decide(pairOf(rank), dealer, { dealerHitsSoft17: false, doubleAfterSplit: false }).action).toBe("H");
    },
  );

  it("surrenders hard 16 v A under S17, not only under H17", () => {
    expect(decide(hard16(), "A", { dealerHitsSoft17: false })).toMatchObject({ action: "R", fallback: "H" });
    expect(decide(hard16(), "A")).toMatchObject({ action: "R", fallback: "H" });
    // Still hits it at a table with no surrender, and on a hand already drawn to.
    expect(decide(hard16(), "A", { dealerHitsSoft17: false, lateSurrender: false }).action).toBe("H");
    expect(decide([card("10"), card("3", "hearts"), card("3")], "A", { dealerHitsSoft17: false }).action).toBe("H");
  });
});

describe("getBasicStrategyDecision on the tables", () => {
  it("falls through from a pair to its total when splitting is not offered", () => {
    expect(decide(pairOf("8"), "5").action).toBe("P");
    expect(decide(pairOf("8"), "5", {}, false).action).toBe("S"); // hard 16 v 5
  });

  it("honours DAS on the conditional pair splits", () => {
    expect(decide(pairOf("2"), "3").action).toBe("P");
    expect(decide(pairOf("2"), "3", { doubleAfterSplit: false }).action).toBe("H");
  });

  it("offers double and surrender only on a two-card hand", () => {
    expect(decide([card("6"), card("5", "hearts")], "6").action).toBe("D");
    expect(decide([card("4"), card("4", "hearts"), card("3")], "6").action).toBe("H"); // hard 11, three cards
    expect(decide(hard16(), "10").action).toBe("R");
    expect(decide([card("10"), card("3", "hearts"), card("3")], "10").action).toBe("H");
  });

  it("still reports a fallback for a double", () => {
    expect(decide([card("A"), card("7", "hearts")], "4")).toMatchObject({ action: "D", fallback: "S" });
  });

  it("stands on totals above the printed grid without a lookup", () => {
    expect(decide([card("10"), card("9", "hearts")], "A").action).toBe("S");
    expect(decide([card("A"), card("10", "hearts")], "A").action).toBe("S");
  });

  it("hits totals below the printed grid without a lookup", () => {
    // These must not be clamped onto the hard-8 row: the 1- and 2-deck grids
    // double hard 8 against a 5 and a 6, so a clamp would tell a two-card hard
    // 5, 6 or 7 to double the moment those grids land.
    for (const dealer of ["5", "6"]) {
      expect(decide([card("2"), card("3", "hearts")], dealer)).toMatchObject({ action: "H", fallback: undefined });
      expect(decide([card("2"), card("4", "hearts")], dealer)).toMatchObject({ action: "H", fallback: undefined });
      expect(decide([card("3"), card("4", "hearts")], dealer)).toMatchObject({ action: "H", fallback: undefined });
      // The same totals reached as an unsplittable pair take the same route.
      expect(decide(pairOf("2"), dealer, {}, false).action).toBe("H");
      expect(decide(pairOf("3"), dealer, {}, false).action).toBe("H");
    }
    // Hard 8 itself is a real row and still reads from the grid.
    expect(decide([card("5"), card("3", "hearts")], "6").action).toBe("H");
  });

  it("applies a restricted doubleRule", () => {
    // The caller's two-card `canDouble` must not cancel the table's restriction.
    expect(decide([card("5"), card("4", "hearts")], "3").action).toBe("D");
    expect(decide([card("5"), card("4", "hearts")], "3", { doubleRule: "10-11" }).action).toBe("H");
    expect(decide([card("5"), card("4", "hearts")], "3", { doubleRule: "9-11" }).action).toBe("D");
    expect(decide([card("6"), card("5", "hearts")], "3", { doubleRule: "10-11" }).action).toBe("D");
    expect(decide([card("A"), card("6", "hearts")], "4", { doubleRule: "9-11" }).action).toBe("H");
  });

  it("answers every supported deck count from its own grid", () => {
    // FullShoeGame and CountingDrills offer 1 and 2 decks. Until those grids
    // land they read the 4+ deck one, which is what the engine this replaces
    // did for every count — and the explanation says which grid answered.
    for (const decks of [1, 2, 4, 6, 8]) {
      expect(() => decide(pairOf("8"), "10", { decks })).not.toThrow();
      expect(decide(hard16(), "10", { decks }).action).toBe("R");
    }
    expect(decide(hard16(), "10", { decks: 1 }).explanation).toContain("under 1-deck H17");
    expect(decide(hard16(), "10", { decks: 8 }).explanation).toContain("under 8-deck H17");
    expect(decide([card("5"), card("3", "hearts")], "5", { decks: 1 }).action).toBe("D");
  });

  it("splits nines rather than standing on their total", () => {
    // 9,9 and T,T reach the stand-anything band on total alone; the pair row wins.
    expect(decide(pairOf("9"), "3").action).toBe("P");
    expect(decide(pairOf("9"), "7").action).toBe("S");
    expect(decide(pairOf("9"), "3", {}, false).action).toBe("S");
    expect(decide([card("K"), card("Q", "hearts")], "6").action).toBe("S");
  });

  it("explains the play it chose", () => {
    expect(decide([card("A"), card("7", "hearts")], "4").explanation)
      .toBe("18 (soft hand) vs dealer 4 is Double if allowed, otherwise Stand under 6-deck H17 basic strategy.");
  });
});
