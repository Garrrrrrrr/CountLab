import { describe, expect, it } from "vitest";
import {
  countText,
  findIndexRow,
  focusQueue,
  focusRows,
  indexAnswerName,
  indexChartCell,
  indexDomain,
  indexLineLabel,
  indexMistake,
  indexReasoning,
  indexRetryQueue,
  indexRuleText,
  indexSegments,
  indexTrainingRows,
  mostMissed,
  parseIndexMistake,
  pickIndexRow,
  playableQueue,
  resolveIndexHand,
  spokenIndexHand,
  type IndexRow,
} from "./indexDrill";

const h17 = (surrender: "none" | "late" | "early") => indexTrainingRows({ decks: 6, dealerHitsSoft17: true, surrender });
const row = (rows: IndexRow[], hand: string, dealer: string, kind: IndexRow["kind"]) => {
  const found = findIndexRow(rows, { hand, dealer, kind });
  if (!found) throw new Error(`no ${kind} row ${hand} v ${dealer}`);
  return found;
};

describe("training rows", () => {
  it("asks surrender only where the table offers it", () => {
    expect(h17("none").some((entry) => entry.kind === "surrender")).toBe(false);
    expect(h17("late").some((entry) => entry.kind === "surrender")).toBe(true);
    expect(h17("late").filter((entry) => entry.kind === "insurance")).toHaveLength(1);
  });

  it("offers Split only on pairs and decides the answer at the count", () => {
    const hand = resolveIndexHand(row(h17("late"), "16", "10", "play"), 1);
    expect(hand.options).toEqual(["H", "S", "D", "P"]);
    expect(hand.disabled).toEqual(["P"]);
    expect(hand.correct).toBe("S");
    expect(hand.rc).toBe(3);
    expect(resolveIndexHand(row(h17("late"), "16", "10", "play"), -1).correct).toBe("H");
    const surrender = resolveIndexHand(row(h17("late"), "16", "9", "surrender"), -2);
    expect(surrender.options).toEqual(["R", "N"]);
    expect(surrender.correct).toBe("N");
  });
});

describe("indexSegments", () => {
  it("runs 13 v 2 downwards: hit at -1 and lower", () => {
    const entry = row(h17("none"), "13", "2", "play");
    expect(indexSegments(entry.transition, entry.row.index)).toEqual([
      { from: -Infinity, to: -1, action: "H" },
      { from: 0, to: Infinity, action: "S" },
    ]);
  });

  it("stands 16 v 10 from 0 upwards", () => {
    const entry = row(h17("late"), "16", "10", "play");
    expect(indexSegments(entry.transition, entry.row.index)).toEqual([
      { from: -Infinity, to: -1, action: "H" },
      { from: 0, to: Infinity, action: "S" },
    ]);
  });

  it("takes insurance from +3", () => {
    const entry = row(h17("late"), "Insurance", "A", "insurance");
    expect(indexSegments(entry.transition, entry.row.index)).toEqual([
      { from: -Infinity, to: 2, action: "N" },
      { from: 3, to: Infinity, action: "I" },
    ]);
  });

  it("gives an unconditional row one segment", () => {
    const entry = row(h17("late"), "17", "A", "surrender");
    expect(entry.row.always).toBe(true);
    expect(indexSegments(entry.transition, entry.row.index, true)).toEqual([{ from: -Infinity, to: Infinity, action: "R" }]);
  });

  it("keeps far indices and counts on the scale", () => {
    const early = h17("early");
    const sixteen = row(early, "16", "10", "surrender");
    expect(sixteen.row.index).toBe(-5);
    expect(indexDomain(sixteen.row.index, -7)).toEqual({ min: -8, max: 10 });
    const twelve = row(early, "12", "10", "surrender");
    expect(twelve.row.index).toBe(8);
    expect(indexDomain(twelve.row.index, 10)).toEqual({ min: -5, max: 11 });
    expect(indexDomain(0, 0)).toEqual({ min: -5, max: 10 });
  });
});

describe("explanations name the actions the buttons show", () => {
  it("13 v 2", () => {
    const entry = row(h17("none"), "13", "2", "play");
    const below = resolveIndexHand(entry, -2);
    expect(indexRuleText(below)).toBe("Hit at −1 or lower · Stand above −1");
    expect(indexReasoning(below)).toBe("At −2, which is at or below −1, the play changes to Hit.");
    expect(indexReasoning(resolveIndexHand(entry, 1))).toBe("At +1, above the index −1, basic strategy stands: Stand.");
  });

  it("16 v 9 under late surrender says Play it out, never Hit", () => {
    const entry = row(h17("late"), "16", "9", "surrender");
    const low = resolveIndexHand(entry, -2);
    expect(low.correct).toBe("N");
    expect(indexRuleText(low)).toBe("Play it out at −1 or lower · Surrender above −1");
    expect(indexReasoning(low)).toBe("At −2, which is at or below −1, the play changes to Play it out.");
    expect(indexLineLabel(low)).toBe("Play it out at true count −1 or lower, surrender above −1. This count: −2.");
    expect(indexReasoning(resolveIndexHand(entry, 1))).toBe("At +1, above the index −1, basic strategy stands: Surrender.");
    expect(indexMistake(low, "R")).toEqual({ question: "16 vs 9 at TC -2", userAnswer: "Surrender", correctAnswer: "Play it out", explanation: low.sentence });
  });

  it("15 v 10 under late surrender", () => {
    const entry = row(h17("late"), "15", "10", "surrender");
    expect(indexReasoning(resolveIndexHand(entry, 0))).toBe("At 0, which is at or below 0, the play changes to Play it out.");
    expect(indexReasoning(resolveIndexHand(entry, 2))).toBe("At +2, above the index 0, basic strategy stands: Surrender.");
  });

  it("16 v 10 under early surrender against a ten", () => {
    const entry = row(h17("early"), "16", "10", "surrender");
    expect(indexReasoning(resolveIndexHand(entry, -4))).toBe("At −4, which is at or above −5, the play changes to Surrender.");
    expect(indexReasoning(resolveIndexHand(entry, -7))).toBe("At −7, below the index −5, basic strategy stands: Play it out.");
  });

  it("insurance and unconditional rows", () => {
    const insurance = resolveIndexHand(row(h17("late"), "Insurance", "A", "insurance"), 4);
    expect(indexRuleText(insurance)).toBe("No insurance below +3 · Insurance at +3 or higher");
    expect(indexAnswerName("N", "insurance")).toBe("No insurance");
    expect(spokenIndexHand(insurance)).toBe("Insurance: the dealer shows an ace. True count plus 4.");
    const always = resolveIndexHand(row(h17("late"), "17", "A", "surrender"), -3);
    expect(always.correct).toBe("R");
    expect(indexReasoning(always)).toBe("This play does not depend on the count: surrender whenever the table offers it.");
    expect(countText(0)).toBe("0");
  });
});

describe("focus hand-offs and retries", () => {
  it("reads the exam's insurance label and seeds every matching kind around the index", () => {
    const rows = h17("late");
    expect(focusRows("Insurance vs A", rows).map((entry) => entry.kind)).toEqual(["insurance"]);
    const sixteen = focusRows("16 vs 9", rows);
    expect(sixteen.map((entry) => entry.kind).sort()).toEqual(["play", "surrender"]);
    const queue = focusQueue(sixteen);
    expect(queue).toHaveLength(6);
    expect(new Set(queue.map((item) => `${item.kind}:${item.tc}`))).toEqual(new Set(["play:3", "play:4", "play:5", "surrender:-2", "surrender:-1", "surrender:0"]));
    expect(focusRows("16 vs 9", h17("none")).map((entry) => entry.kind)).toEqual(["play"]);
    expect(focusRows("Not a play", rows)).toEqual([]);
  });

  it("rebuilds retry rounds from recorded mistakes and drops rows the rules no longer have", () => {
    const rows = h17("late");
    const mistakes = [
      indexMistake(resolveIndexHand(row(rows, "16", "9", "surrender"), -2), "R"),
      indexMistake(resolveIndexHand(row(rows, "Insurance", "A", "insurance"), 4), "N"),
      indexMistake(resolveIndexHand(row(rows, "13", "2", "play"), -2), "S"),
    ];
    expect(parseIndexMistake(mistakes[0])).toEqual({ hand: "16", dealer: "9", kind: "surrender", tc: -2 });
    expect(parseIndexMistake(mistakes[1])).toEqual({ hand: "Insurance", dealer: "A", kind: "insurance", tc: 4 });
    const queue = indexRetryQueue(mistakes, rows);
    expect(queue.map((item) => item.kind).sort()).toEqual(["insurance", "play", "surrender"]);
    for (const item of queue) expect(Math.abs(item.tc - findIndexRow(rows, item)!.row.index)).toBeLessThanOrEqual(2);
    expect(indexRetryQueue(mistakes, h17("none")).map((item) => item.kind).sort()).toEqual(["insurance", "play"]);
    expect(playableQueue(queue, h17("none"))).toHaveLength(2);
  });

  it("leans on missed plays and names the worst one", () => {
    const rows = h17("late");
    const history = { "16 vs 10": { correct: 0, total: 20 }, "Insurance": { correct: 20, total: 20 }, "13 vs 2": { correct: 2, total: 5 } };
    const draws = Array.from({ length: 2000 }, () => pickIndexRow(rows, "adaptive", history));
    const share = (category: string) => draws.filter((entry) => `${entry.row.hand} vs ${entry.row.dealer}` === category).length;
    expect(share("16 vs 10")).toBeGreaterThan(share("Insurance vs A") * 3);
    expect(mostMissed(rows, history)).toEqual({ category: "16 vs 10", correct: 0, total: 20 });
    expect(mostMissed(rows, { Insurance: { correct: 3, total: 3 } })).toBeUndefined();
  });

  it("links plays to the deviation chart's rows", () => {
    expect(indexChartCell({ hand: "Soft 19", dealer: "6", kind: "play" })).toEqual({ section: "soft", hand: "A,8", dealer: "6" });
    expect(indexChartCell({ hand: "10,10", dealer: "5", kind: "play" })).toEqual({ section: "pairs", hand: "T,T", dealer: "5" });
    expect(indexChartCell({ hand: "16", dealer: "9", kind: "surrender" })).toEqual({ section: "surrender", hand: "16", dealer: "9" });
    expect(indexChartCell({ hand: "Insurance", dealer: "A", kind: "insurance" })).toBeNull();
  });
});
