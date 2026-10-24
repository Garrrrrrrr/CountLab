import { describe, expect, it } from "vitest";
import { BET_SPREAD_PRESETS } from "@/lib/blackjack/fullShoeSession";
import type { Card, Rank } from "@/lib/blackjack/types";
import { DEFAULT_TABLE_RULES, type TableRules } from "@/lib/strategy";
import { carriedTrueCount, countCheckDue, divisorFor, gradeBet, gradeCountCheck, gradeInsurance, gradePlay, liveTrueCount } from "./grading";

const card = (rank: Rank): Card => ({ rank, suit: "hearts" });
const cards = (...ranks: Rank[]) => ranks.map(card);
const rules = (patch: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...patch });
const TWO = { canDouble: true, canSplit: true, canSurrender: true };
const DRAWN = { canDouble: false, canSplit: false, canSurrender: false };
const ramp = BET_SPREAD_PRESETS["1-8"];

describe("the true count used for grading", () => {
  it("divides by the decks left to the table's precision and rounds the way Settings says", () => {
    expect(divisorFor(130, 0.5)).toBe(2.5);
    expect(divisorFor(130, 1)).toBe(3); // 2.5 rounds to 3 decks at whole-deck precision
    expect(liveTrueCount(7, 130, { resolution: 0.5, rounding: "floor" })).toBe(2);
    expect(liveTrueCount(-7, 130, { resolution: 0.5, rounding: "floor" })).toBe(-3);
    expect(liveTrueCount(-7, 130, { resolution: 0.5, rounding: "truncate" })).toBe(-2);
    expect(liveTrueCount(-7, 130, { resolution: 0.5, rounding: "nearest" })).toBe(-3);
    expect(liveTrueCount(4, 10, { resolution: 0.5, rounding: "floor" })).toBe(8); // never divides by less than half a deck
  });
});

describe("bet grading by the ramp", () => {
  it("expects the ramp's bet on every seat, and one unit at zero or below", () => {
    expect(gradeBet({ bets: [10], unit: 10, ramp, tc: -2, bankroll: 1000 })).toMatchObject({ ok: true, expected: 10 });
    expect(gradeBet({ bets: [10], unit: 10, ramp, tc: 0, bankroll: 1000 })).toMatchObject({ ok: true });
    expect(gradeBet({ bets: [40], unit: 10, ramp, tc: 2, bankroll: 1000 })).toMatchObject({ ok: true, expected: 40, units: 4 });
    expect(gradeBet({ bets: [80, 80], unit: 10, ramp, tc: 7, bankroll: 1000 })).toMatchObject({ ok: true, correct: "2 × $80" });
    const under = gradeBet({ bets: [5], unit: 10, ramp, tc: 0, bankroll: 1000 });
    expect(under).toMatchObject({ ok: false, chosen: "$5", correct: "1 × $10" });
    expect(gradeBet({ bets: [40, 10], unit: 10, ramp, tc: 2, bankroll: 1000 }).ok).toBe(false);
  });

  it("accepts the whole bankroll when the ramp asks for more than is left", () => {
    expect(gradeBet({ bets: [35], unit: 10, ramp, tc: 4, bankroll: 35 })).toMatchObject({ ok: true, expected: 35 });
  });

  it("credits a bet that is right for the count the player last reported", () => {
    const grade = gradeBet({ bets: [20], unit: 10, ramp, tc: 3, bankroll: 1000, playerTc: 1 });
    expect(grade).toMatchObject({ ok: true, credited: true });
    expect(gradeBet({ bets: [20], unit: 10, ramp, tc: 3, bankroll: 1000 }).ok).toBe(false);
  });
});

describe("insurance", () => {
  it("takes insurance and even money at +3 or more, never below", () => {
    // Wong's table 11: +3.0 for six decks, +1.4 for one.
    const six = { decks: 6 }, one = { decks: 1 };
    expect(gradeInsurance({ rules: six, took: true, tc: 3 }).ok).toBe(true);
    expect(gradeInsurance({ rules: six, took: true, tc: 2 }).ok).toBe(false);
    expect(gradeInsurance({ rules: one, took: true, tc: 2 }).ok).toBe(true);
    expect(gradeInsurance({ rules: six, took: false, tc: 2 }).ok).toBe(true);
    expect(gradeInsurance({ rules: six, took: false, tc: 5, evenMoney: true })).toMatchObject({ ok: false, correct: "Take even money" });
    expect(gradeInsurance({ rules: six, took: false, tc: 4, playerTc: 1 })).toMatchObject({ ok: true, credited: true });
  });
});

describe("playing decisions", () => {
  const ns = rules({ surrender: "none" });

  it("grades 16 v 10 at the index and files it under Deviations when the count changes the play", () => {
    const stand = gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: ns, permissions: TWO, chosen: "S", tc: 0 });
    expect(stand).toMatchObject({ ok: true, correct: "S", basic: "H", category: "Deviations" });
    const hit = gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: ns, permissions: TWO, chosen: "H", tc: -1 });
    expect(hit).toMatchObject({ ok: true, correct: "H", category: "Basic Strategy" });
    expect(hit.explanation).toContain("stand at 0 or higher");
    // Standing at −3 is a deviation the count did not call for.
    expect(gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: ns, permissions: TWO, chosen: "S", tc: -3 })).toMatchObject({ ok: false, category: "Deviations" });
  });

  it("uses the no-surrender play once a hand has drawn: 3,9,4 v 10 stands at 0", () => {
    const grade = gradePlay({ cards: cards("3", "9", "4"), upcard: card("10"), rules: rules(), permissions: DRAWN, chosen: "H", tc: 1 });
    expect(grade).toMatchObject({ ok: false, correct: "S" });
    expect(gradePlay({ cards: cards("3", "9", "4"), upcard: card("10"), rules: rules(), permissions: DRAWN, chosen: "S", tc: 1 }).ok).toBe(true);
  });

  it("only surrenders where the hand still may", () => {
    expect(gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: rules(), permissions: TWO, chosen: "R", tc: 0 }).correct).toBe("R");
    expect(gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: rules(), permissions: { ...TWO, canSurrender: false }, chosen: "S", tc: 0 }).correct).toBe("S");
  });

  it("falls back from a double the hand cannot make", () => {
    expect(gradePlay({ cards: cards("6", "5"), upcard: card("6"), rules: ns, permissions: TWO, chosen: "D", tc: 0 }).correct).toBe("D");
    expect(gradePlay({ cards: cards("6", "5"), upcard: card("6"), rules: ns, permissions: { ...TWO, canDouble: false }, chosen: "H", tc: 0 }).correct).toBe("H");
  });

  it("explains totals the chart does not print", () => {
    expect(gradePlay({ cards: cards("10", "9"), upcard: card("6"), rules: ns, permissions: TWO, chosen: "S", tc: 0 }).explanation).toBe("Hard 19 vs a 6: stand at every count.");
  });

  it("credits an index play that is right for the player's own reported count", () => {
    const grade = gradePlay({ cards: cards("10", "6"), upcard: card("K"), rules: ns, permissions: TWO, chosen: "H", tc: 1, playerTc: -1 });
    expect(grade).toMatchObject({ ok: true, credited: true, correct: "S" });
  });
});

describe("count checks", () => {
  const count = { resolution: 0.5 as const, rounding: "floor" as const };

  it("asks on the chosen schedule, never before the first round", () => {
    expect(countCheckDue("every", 0)).toBe(false);
    expect(countCheckDue("every", 1)).toBe(true);
    expect([1, 2, 3, 4, 5, 6].map((n) => countCheckDue("3", n))).toEqual([false, false, true, false, false, true]);
    expect([4, 5, 10].map((n) => countCheckDue("5", n))).toEqual([false, true, true]);
    expect(countCheckDue("off", 9)).toBe(false);
    expect(countCheckDue("random", 4, () => 0.1)).toBe(true);
    expect(countCheckDue("random", 4, () => 0.9)).toBe(false);
  });

  it("grades the running count exactly", () => {
    const right = gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, count, answer: { rc: 6 } });
    expect(right).toMatchObject({ rcOk: true, expected: { rc: 6, decks: 3, tc: 2 } });
    expect(right.tcOk).toBeUndefined();
    expect(gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, count, answer: { rc: 4 } }).rcExplanation).toContain("2 points low");
  });

  it("accepts the deck estimate the tray photo shows as well as the real depth", () => {
    const grade = gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, photoDiscarded: 3.44, count, answer: { rc: 6, decks: 2.5, tc: 2 } });
    expect(grade.acceptedDecks).toEqual([2.5, 3]);
    expect(grade).toMatchObject({ decksOk: true, tcOk: true });
  });

  it("does not grade a running-count slip twice: the right division of your own count passes", () => {
    const grade = gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, count, answer: { rc: 3, decks: 3, tc: 1 } });
    expect(grade).toMatchObject({ rcOk: false, tcOk: true });
  });

  it("needs an accepted deck estimate: a running count of 0 cannot pass with any divisor", () => {
    const grade = gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, count, answer: { rc: 0, decks: 0.5, tc: 0 } });
    expect(grade).toMatchObject({ rcOk: false, decksOk: false, tcOk: false });
    expect(grade.tcExplanation).toContain("about 3 decks left, not 0.5");
  });

  it("says when the division was right but the deck estimate was not", () => {
    const grade = gradeCountCheck({ rc: 6, cardsRemaining: 156, totalDecks: 6, count, answer: { rc: 6, decks: 1.5, tc: 4 } });
    expect(grade).toMatchObject({ decksOk: false, tcOk: false });
    expect(grade.tcExplanation).toContain("about 3 decks left");
  });

  it("carries a reported count forward until the next check", () => {
    expect(carriedTrueCount(undefined, 6, 156, count)).toBeUndefined();
    expect(carriedTrueCount(0, 6, 156, count)).toBeUndefined();
    expect(carriedTrueCount(-3, 6, 156, count)).toBe(1);
  });
});
