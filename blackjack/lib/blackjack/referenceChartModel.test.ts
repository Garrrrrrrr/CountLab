import { describe, expect, it } from "vitest";
import { BJA_H17_SECTIONS } from "./bjaH17Chart";
import {
  DEFAULT_CHART_RULES,
  buildH17Chart,
  buildRulesChart,
  changedCells,
  chartRulesFromSettings,
  chipText,
  decksForChoice,
  deckChoice,
  h17PlainSentence,
  handName,
  rankIndexPlays,
  rulesSummary,
} from "./referenceChartModel";
import type { StrategyChartRules } from "./strategyChart";

const rules = (overrides: Partial<StrategyChartRules> = {}): StrategyChartRules => ({ ...DEFAULT_CHART_RULES, ...overrides });

describe("notation", () => {
  it("writes chips as play, signed count and direction", () => {
    expect(chipText("S", 4, false)).toBe("S+4↑");
    expect(chipText("S", 0, false)).toBe("S0↑");
    expect(chipText("H", -1, true)).toBe("H−1↓");
  });

  it("names hands the way a player says them", () => {
    expect(handName("hard", "16")).toBe("Hard 16");
    expect(handName("soft", "A,7")).toBe("Soft 18 (A,7)");
    expect(handName("pairs", "8,8")).toBe("Pair of 8s");
    expect(handName("pairs", "T,T")).toBe("Pair of tens");
    expect(handName("pairs", "A,A")).toBe("Pair of aces");
  });

  it("summarises the default rules in short and long form", () => {
    expect(rulesSummary(DEFAULT_CHART_RULES, "short")).toBe("6D · H17 · DAS · LS");
    expect(rulesSummary(DEFAULT_CHART_RULES, "long")).toBe(
      "6 decks · dealer hits soft 17 · double after split · late surrender · double on any two cards · dealer peeks for blackjack",
    );
    expect(rulesSummary(rules({ doubleRule: "10-11", europeanNoHoleCard: true, surrender: "early" }), "short")).toBe("6D · H17 · DAS · ES10 · 10–11 · ENHC");
  });

  it("reads saved settings and keeps a saved 4, 6 or 8 decks behind the 4–8 choice", () => {
    expect(chartRulesFromSettings({ decks: 3, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: "none" })).toMatchObject({ decks: 6, dealerHitsSoft17: false, doubleAfterSplit: false, surrender: "none", doubleRule: "any", europeanNoHoleCard: false });
    expect(deckChoice(8)).toBe("4-8");
    expect(decksForChoice("4-8", 8)).toBe(8);
    expect(decksForChoice("4-8", 1)).toBe(6);
    expect(decksForChoice("2", 8)).toBe(2);
  });
});

describe("rules chart cells", () => {
  it("labels cells with the hand, dealer and play", () => {
    const basic = buildRulesChart(DEFAULT_CHART_RULES, "basic");
    expect(basic.cells.get("hard:8v2")!.ariaLabel).toContain("8 versus dealer 2: Hit");
    expect(basic.cells.get("hard:11vA")!.ariaLabel).toContain("11 versus dealer A: Double; otherwise hit");
    const index = buildRulesChart(DEFAULT_CHART_RULES, "index");
    const thirteen = index.cells.get("hard:13v2")!.ariaLabel;
    expect(thirteen).toContain("13 versus dealer 2: Stand");
    expect(thirteen).toContain("Hit when the true count is -1 or lower; otherwise stand.");
  });

  it("covers every cell of the four tables", () => {
    const chart = buildRulesChart(DEFAULT_CHART_RULES, "basic");
    expect(chart.sections.map((section) => section.id)).toEqual(["hard", "soft", "pairs", "surrender"]);
    expect(chart.sections.map((section) => section.cells.flat().length)).toEqual([100, 80, 100, 50]);
  });

  it("marks hands the surrender table takes first, for sighted and screen-reader users", () => {
    const cell = buildRulesChart(DEFAULT_CHART_RULES, "basic").cells.get("hard:16v10")!;
    expect(cell.surrenderFirst).toBe(true);
    expect(cell.ariaLabel).toContain("16 versus dealer 10: Hit");
    expect(cell.ariaLabel).toContain("Surrender first if the table allows it.");
    expect(buildRulesChart(rules({ surrender: "none" }), "basic").cells.get("hard:16v10")!.surrenderFirst).toBe(false);
  });

  it("shows Ds as its own code", () => {
    const cell = buildRulesChart(DEFAULT_CHART_RULES, "basic").cells.get("soft:A,7v3")!;
    expect(cell.text).toBe("Ds");
    expect(cell.tone).toBe("Ds");
  });

  it("explains cells a restricted double or a missing hole card changes", () => {
    const restricted = buildRulesChart(rules({ doubleRule: "10-11" }), "index");
    expect(restricted.cells.get("hard:9v3")!.notes.join(" ")).toContain("only lets you double on hard 10–11");
    expect(restricted.cells.get("hard:9v2")!.play!.available).toBe(false);
    expect(restricted.cells.get("hard:9v2")!.ariaLabel).toContain("Not available under these rules.");
    const enhc = buildRulesChart(rules({ europeanNoHoleCard: true }), "index");
    expect(enhc.cells.get("hard:11v10")!.notes.join(" ")).toContain("No hole card");
    expect(enhc.cells.get("hard:11vA")!.play!.available).toBe(false);
  });

  it("explains how double after split and the soft-17 rule change a cell", () => {
    const das = buildRulesChart(DEFAULT_CHART_RULES, "basic").cells.get("pairs:4,4v5")!;
    expect(das.notes.join(" ")).toContain("lets you double after splitting");
    const noDas = buildRulesChart(rules({ doubleAfterSplit: false }), "basic").cells.get("pairs:4,4v5")!;
    expect(noDas.notes.join(" ")).toContain("doesn't let you double after splitting");
    const elevenVsAce = buildRulesChart(DEFAULT_CHART_RULES, "basic").cells.get("hard:11vA")!;
    expect(elevenVsAce.notes.join(" ")).toContain("Where the dealer stands on soft 17 (S17), hit instead.");
  });

  it("keeps index information out of the basic view but says the count matters", () => {
    const cell = buildRulesChart(DEFAULT_CHART_RULES, "basic").cells.get("hard:13v2")!;
    expect(cell.ariaLabel).not.toContain("Index play");
    expect(cell.ariaLabel).toContain("The count can change this play.");
  });

  it("lists the cells a rule change repaints", () => {
    const before = buildRulesChart(DEFAULT_CHART_RULES, "basic");
    const after = buildRulesChart(rules({ dealerHitsSoft17: false }), "basic");
    const keys = changedCells(before, after).map((cell) => cell.key);
    expect(keys).toContain("hard:11vA");
    expect(keys).not.toContain("hard:8v2");
    // Index chips are not drawn in the basic view, so their changes do not count there.
    expect(keys).not.toContain("hard:16v9");
    const indexKeys = changedCells(buildRulesChart(DEFAULT_CHART_RULES, "index"), buildRulesChart(rules({ dealerHitsSoft17: false }), "index")).map((cell) => cell.key);
    expect(indexKeys).toContain("hard:16v9");
  });
});

describe("rankIndexPlays", () => {
  const combos: StrategyChartRules[] = [true, false].flatMap((dealerHitsSoft17) =>
    (["none", "late", "early"] as const).map((surrender) => rules({ dealerHitsSoft17, surrender })));

  it("puts insurance first and prices plays with the table's own surrender rule", () => {
    const ranking = rankIndexPlays(DEFAULT_CHART_RULES);
    expect(ranking.ranked[0].kind).toBe("Insurance");
    // At a late-surrender table two-card 16 v 10 is surrendered, so its stand
    // index is not the second most valuable play; it moves to its own group.
    expect(ranking.ranked[1].key).toBe("surrender:14v10");
    expect(ranking.ranked[1].value!.ev.toFixed(3)).toBe("0.039");
    expect(ranking.afterSurrender[0].key).toBe("hard:16v10");
    expect(ranking.afterSurrender[0].value!.ev.toFixed(3)).toBe("0.052");
  });

  it("ranks 16 v 10 second where there is no surrender", () => {
    const ranking = rankIndexPlays(rules({ surrender: "none" }));
    expect(ranking.ranked[1].key).toBe("hard:16v10");
    expect(ranking.afterSurrender).toEqual([]);
  });

  it("sends the early-surrender ten column to the unmeasured group", () => {
    const ranking = rankIndexPlays(rules({ surrender: "early" }));
    expect(ranking.unmeasured.map((play) => play.key)).toContain("surrender:16v10");
    expect(ranking.unmeasured.every((play) => play.key.endsWith("v10"))).toBe(true);
  });

  for (const combo of combos) {
    it(`orders ${combo.dealerHitsSoft17 ? "H17" : "S17"} ${combo.surrender} without repeats and totals only what applies`, () => {
      const ranking = rankIndexPlays(combo);
      const keys = ranking.ranked.map((play) => play.key);
      expect(new Set(keys).size).toBe(keys.length);
      const hands = ranking.ranked.map((play) => play.label);
      expect(new Set(hands).size, "a hand appears twice in the numbered list").toBe(hands.length);
      for (let index = 1; index < ranking.ranked.length; index++) {
        expect(ranking.ranked[index - 1].value!.ev).toBeGreaterThanOrEqual(ranking.ranked[index].value!.ev);
      }
      const expected = ranking.ranked.filter((play) => play.available).reduce((sum, play) => sum + play.value!.ev, 0);
      expect(ranking.total).toBeCloseTo(expected, 10);
      if (combo.surrender === "none") expect(ranking.ranked.some((play) => play.kind === "Surrender")).toBe(false);
    });
  }

  it("leaves plays the table cannot make out of the total", () => {
    const restricted = rankIndexPlays(rules({ doubleRule: "10-11", surrender: "none" }));
    const open = rankIndexPlays(rules({ surrender: "none" }));
    expect(restricted.ranked.find((play) => play.key === "hard:9v2")!.available).toBe(false);
    expect(restricted.total).toBeLessThan(open.total);
  });

  it("says how few plays carry most of the value", () => {
    const { topShare, ranked } = rankIndexPlays(DEFAULT_CHART_RULES);
    expect(topShare!.count).toBeLessThan(ranked.length);
    expect(topShare!.share).toBeGreaterThanOrEqual(0.75);
  });
});

describe("the printed H17 chart", () => {
  it("keeps every printed token and its explanation", () => {
    const sections = buildH17Chart("late");
    expect(sections.map((section) => section.id)).toEqual(["pairs", "soft", "hard", "surrender"]);
    const hard = sections.find((section) => section.id === "hard")!;
    const cell = hard.cells[1][7];
    expect(cell.text).toBe("4+");
    expect(cell.ariaLabel).toContain("16 versus dealer 9: The chart prints 4+: the deviation applies at true count +4 and above.");
    expect(cell.tone).toBe("index");
    expect(buildH17Chart("early10").find((section) => section.id === "surrender")!.rows).toHaveLength(7);
  });

  it("reads 0+ and 0- as running counts", () => {
    const soft = BJA_H17_SECTIONS.find((section) => section.id === "soft")!;
    const token = soft.cells.get("soft:A,8v6")!;
    expect(h17PlainSentence("soft", token, "A,8", "6", "late")).toContain("running count is negative");
  });

  it("words index tokens from the catalog and falls back when the printed direction disagrees", () => {
    const hard = BJA_H17_SECTIONS.find((section) => section.id === "hard")!;
    expect(h17PlainSentence("hard", hard.cells.get("hard:16v9")!, "16", "9", "late")).toBe("Stand when the true count is +4 or higher; otherwise hit.");
    const early = buildH17Chart("early10").find((section) => section.id === "surrender")!;
    const sixteenVsTen = early.cells[early.rows.indexOf("16")][8];
    expect(sixteenVsTen.text).toBe("-6-");
    expect(sixteenVsTen.plain).toBeUndefined();
  });
});
