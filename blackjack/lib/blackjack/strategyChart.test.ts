import { describe, expect, it } from "vitest";
import { CHART_CODES, chartCell, resolveCode } from "./strategyChart";
import { getBasicStrategyDecision } from "./basicStrategy";
import { STRATEGY_ROWS } from "./strategyTables";
import { CHART_DEALERS } from "./bjaH17Chart";
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

function handFor(section: "pairs" | "soft" | "hard", row: string): Card[] {
  if (section === "pairs") { const [a, b] = row.split(","); return [card(a), card(b, "hearts")]; }
  if (section === "soft") { const [, b] = row.split(","); return [card("A"), card(b, "hearts")]; }
  const total = Number(row);
  const high = total >= 12 ? 10 : total - 2;
  return [card(String(high)), card(String(total - high), "hearts")];
}

/**
 * Cells where the table deliberately disagrees with the engine it replaces.
 * All five are DAS-conditional pair splits that the old function decided without
 * consulting `doubleAfterSplit`. The audited `bjaH17Chart.ts` transcription
 * prints `Y/N` — its notation for "split only with DAS" — in exactly these
 * cells, so the table is right and the old branch was wrong.
 */
const KNOWN_ENGINE_BUGS = new Set(["pairs:6,6v2", "pairs:3,3v2", "pairs:3,3v3", "pairs:2,2v2", "pairs:2,2v3"]);

describe("parity with the engine this replaces", () => {
  for (const dealerHitsSoft17 of [true, false]) {
    it(`reproduces 6-deck ${dealerHitsSoft17 ? "H17" : "S17"} basic strategy`, () => {
      const rules = { decks: 6, dealerHitsSoft17, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
      const legacy = { decks: 6, dealerHitsSoft17, doubleAfterSplit: true, resplitAces: true, lateSurrender: true, doubleRule: "any" as const };
      const mismatches: string[] = [];
      for (const section of ["pairs", "soft", "hard"] as const) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            const key = `${section}:${row}v${dealer}`;
            if (KNOWN_ENGINE_BUGS.has(key)) continue;
            const ours = chartCell(rules, section, row, dealer).action;
            const theirs = getBasicStrategyDecision({ playerCards: handFor(section, row), dealerUpcard: card(dealer, "diamonds"), rules: legacy }).action;
            if (ours !== theirs) mismatches.push(`${key}: table=${ours} engine=${theirs}`);
          }
        }
      }
      expect(mismatches).toEqual(dealerHitsSoft17 ? [] : ["hard:16vA: table=R engine=H"]);
    });
  }
});
