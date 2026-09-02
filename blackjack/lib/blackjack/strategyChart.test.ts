import { describe, expect, it } from "vitest";
import { CHART_CODES, resolveCode } from "./strategyChart";
import { getBasicStrategyDecision } from "./basicStrategy";
import { Card, Rank } from "./types";

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

const card = (rank: string, suit: Card["suit"] = "spades"): Card => ({ rank: (rank === "T" ? "10" : rank) as Rank, suit });

const RULES = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" as const };

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

  it("answers deck counts whose grid is not transcribed yet instead of throwing", () => {
    // FullShoeGame offers 1 and 2 decks. Until those grids land they read the
    // 4+ deck one, which is what the engine this replaces did for every count.
    for (const decks of [1, 2, 4, 6, 8]) {
      expect(() => decide(pairOf("8"), "10", { decks })).not.toThrow();
      expect(decide(hard16(), "10", { decks }).action).toBe("R");
    }
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
