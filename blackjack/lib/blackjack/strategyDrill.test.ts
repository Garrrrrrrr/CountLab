import { describe, expect, it } from "vitest";
import { getBasicStrategyDecision } from "./basicStrategy";
import { CHART_DEALERS } from "./bjaH17Chart";
import { chartCell } from "./strategyChart";
import {
  chartCoordinateOf,
  chartDealer,
  drawStrategyQuestion,
  focusCandidates,
  handLabel,
  isStrategyQuestion,
  offChartNote,
  parseStrategyQuestion,
  pickFocusCategory,
  resolveStrategyHand,
  spokenHand,
  strategyChartCell,
  strategyChartRow,
  strategyMistake,
  strategyQuestionText,
  strategyRetryQueue,
  strategyScenario,
} from "./strategyDrill";
import { surrenderChart } from "./surrenderChart";
import { RANKS, type BlackjackRules, type Card, type Rank } from "./types";
import type { StrategyQuestion } from "./strategyQuestions";

const hand = (a: Rank, b: Rank): Card[] => [{ rank: a, suit: "spades" }, { rank: b, suit: "hearts" }];
const up = (rank: Rank): Card => ({ rank, suit: "diamonds" });

type Surrender = "none" | "late" | "early";
const RULE_SETS = [1, 2, 6, 8].flatMap((decks) => [true, false].flatMap((dealerHitsSoft17) => [true, false].flatMap((doubleAfterSplit) =>
  (["none", "late", "early"] as Surrender[]).map((surrender) => ({ decks, dealerHitsSoft17, doubleAfterSplit, surrender })))));

const engineRules = (set: (typeof RULE_SETS)[number]): BlackjackRules => ({
  decks: set.decks,
  dealerHitsSoft17: set.dealerHitsSoft17,
  doubleAfterSplit: set.doubleAfterSplit,
  resplitAces: true,
  lateSurrender: set.surrender !== "none",
  earlySurrenderVsTen: set.surrender === "early",
  doubleRule: "any",
});
const chartRules = (set: (typeof RULE_SETS)[number]) => ({ ...set, doubleRule: "any" as const, europeanNoHoleCard: false });
const noSurrender = (rules: BlackjackRules): BlackjackRules => ({ ...rules, lateSurrender: false, earlySurrenderVsTen: false });

/** Every two-card hand, a superset of what the drill deals. */
const ALL_HANDS = RANKS.flatMap((a) => RANKS.map((b) => hand(a, b)));
const SURRENDER_HANDS: Card[][] = [hand("10", "7"), hand("10", "6"), hand("9", "7"), hand("10", "5"), hand("9", "6"), hand("10", "4"), hand("9", "5"), hand("10", "3"), hand("10", "2"), hand("8", "8"), hand("7", "7")];

describe("chart placement", () => {
  it("places hands on the rows the chart prints", () => {
    expect(chartCoordinateOf(hand("K", "K"))).toEqual({ section: "pairs", row: "T,T" });
    expect(chartCoordinateOf(hand("K", "Q"))).toEqual({ section: "pairs", row: "T,T" });
    expect(chartCoordinateOf(hand("A", "A"))).toEqual({ section: "pairs", row: "A,A" });
    expect(chartCoordinateOf(hand("A", "7"))).toEqual({ section: "soft", row: "A,7" });
    expect(chartCoordinateOf(hand("10", "6"))).toEqual({ section: "hard", row: "16" });
    expect(chartCoordinateOf(hand("4", "5"))).toEqual({ section: "hard", row: "9" });
  });

  it("explains the hands the chart leaves out", () => {
    expect(chartCoordinateOf(hand("2", "3"))).toBeNull();
    expect(offChartNote(hand("2", "3"))).toBe("Hard 5–7 always hit.");
    expect(chartCoordinateOf(hand("9", "10"))).toBeNull();
    expect(offChartNote(hand("9", "10"))).toBe("Hard 18 and up always stand.");
    // Two ten-value cards are a splittable pair to the engine, so they sit on T,T.
    expect(offChartNote(hand("10", "K"))).toBeUndefined();
    expect(offChartNote(hand("10", "6"))).toBeUndefined();
  });

  it("reads every ten-value upcard as the ten column", () => {
    expect(["10", "J", "Q", "K"].map((rank) => chartDealer(rank as Rank))).toEqual(["10", "10", "10", "10"]);
    expect(chartDealer("A")).toBe("A");
    expect(chartDealer("7")).toBe("7");
  });

  it("labels hands in plain words", () => {
    expect(handLabel(hand("10", "6"))).toBe("Hard 16");
    expect(handLabel(hand("A", "7"))).toBe("Soft 18");
    expect(handLabel(hand("8", "8"))).toBe("Pair of 8s");
    expect(handLabel(hand("A", "A"))).toBe("Pair of aces");
    expect(handLabel(hand("K", "K"))).toBe("Pair of kings");
    expect(spokenHand(hand("A", "7"), up("9"))).toBe("Ace and 7 against a 9");
    expect(spokenHand(hand("10", "6"), up("A"))).toBe("10 and 6 against an ace");
    expect(spokenHand(hand("K", "5"), up("8"))).toBe("King and 5 against an 8");
  });
});

describe("the chart row agrees with the graded answer", () => {
  it("matches chartCell and the engine for every hand, upcard and rule set", () => {
    for (const set of RULE_SETS) {
      const rules = engineRules(set);
      for (const player of ALL_HANDS) {
        const coordinate = chartCoordinateOf(player);
        for (const rank of RANKS) {
          const engine = getBasicStrategyDecision({ playerCards: player, dealerUpcard: up(rank), rules: noSurrender(rules) }).action;
          if (!coordinate) {
            expect(engine, `${player[0].rank},${player[1].rank} v ${rank}`).toBe(offChartNote(player) === "Hard 5–7 always hit." ? "H" : "S");
            continue;
          }
          const cell = chartCell(chartRules(set), coordinate.section, coordinate.row, chartDealer(rank), { canSurrender: false }).action;
          expect(cell, `${JSON.stringify(set)} ${coordinate.row} v ${rank}`).toBe(engine);
        }
      }
    }
  });

  it("shows the answer marked correct in the column being asked", () => {
    for (const set of RULE_SETS) {
      const rules = engineRules(set);
      for (const player of ALL_HANDS) {
        for (const category of ["Hard totals", "Surrender"] as const) {
          if (category === "Surrender" && set.surrender === "none") continue;
          const resolved = resolveStrategyHand({ player, dealer: up("9"), category }, rules);
          const shown = strategyChartRow(resolved);
          if ("note" in shown) continue;
          const column = shown.row.cells.find((cell) => cell.dealer === shown.row.current)!;
          if (category === "Surrender") expect(column.action === "R").toBe(resolved.correct === "R");
          else expect(column.action).toBe(resolved.correct);
        }
      }
    }
  });

  /**
   * The one known disagreement: the 4-8 deck H17 grid stands hard 17 against
   * an ace, while the printed chart (and so the surrender chart and the index
   * drill, through the catalog's unconditional row) gives it up. The drill
   * grades with the engine and draws its row from the engine, so it is
   * consistent with itself; this pins the difference so it cannot grow.
   */
  it("matches the surrender chart's rows wherever the drill asks a surrender question", () => {
    const differences = new Set<string>();
    for (const set of RULE_SETS.filter((candidate) => candidate.surrender !== "none")) {
      const rules = engineRules(set);
      const chart = surrenderChart(chartRules(set));
      for (const player of SURRENDER_HANDS) {
        const coordinate = chartCoordinateOf(player)!;
        for (const dealer of CHART_DEALERS) {
          const engine = getBasicStrategyDecision({ playerCards: player, dealerUpcard: up(dealer as Rank), rules }).action === "R";
          const printed = chart.cells.get(`${coordinate.row}v${dealer}`)?.surrenders ?? false;
          if (printed !== engine) differences.add(`${set.decks >= 4 ? "4-8" : set.decks}d ${set.dealerHitsSoft17 ? "H17" : "S17"} ${coordinate.row} v ${dealer}`);
        }
      }
    }
    expect([...differences]).toEqual(["4-8d H17 17 v A"]);
  });

  it("notes surrender hands that are never given up", () => {
    const rules = engineRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" });
    const shown = strategyChartRow(resolveStrategyHand({ player: hand("10", "2"), dealer: up("10"), category: "Surrender" }, rules));
    expect(shown).toEqual({ note: "This hand is never surrendered under these rules." });
    const offChart = strategyChartRow(resolveStrategyHand({ player: hand("2", "3"), dealer: up("10"), category: "Hard totals" }, rules));
    expect(offChart).toEqual({ note: "Hard 5–7 always hit." });
  });
});

describe("resolved hands", () => {
  const rules = engineRules({ decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" });

  it("offers Split only on pairs and asks surrender on its own", () => {
    expect(resolveStrategyHand({ player: hand("10", "6"), dealer: up("7"), category: "Hard totals" }, rules).disabled).toEqual(["P"]);
    expect(resolveStrategyHand({ player: hand("8", "8"), dealer: up("7"), category: "Pairs" }, rules).disabled).toEqual([]);
    const surrender = resolveStrategyHand({ player: hand("10", "6"), dealer: up("10"), category: "Surrender" }, rules);
    expect(surrender.options).toEqual(["R", "N"]);
    expect(surrender.correct).toBe("R");
    const decline = resolveStrategyHand({ player: hand("10", "2"), dealer: up("10"), category: "Surrender" }, rules);
    expect(decline.correct).toBe("N");
    expect(decline.explanation).toMatch(/^Basic strategy does not give this hand up, so decline and play it out: /);
  });

  it("records mistakes in the drill's existing format and reads them back", () => {
    const resolved = resolveStrategyHand({ player: hand("A", "8"), dealer: up("K"), category: "Soft totals" }, rules);
    const mistake = strategyMistake(resolved, "D");
    expect(mistake.question).toBe("A,8 vs K");
    expect(mistake.userAnswer).toBe("Double");
    expect(mistake.correctAnswer).toBe("Stand");
    expect(strategyScenario(resolved)).toBe("8A_v_K");
    const surrender: StrategyQuestion = { player: hand("10", "6"), dealer: up("A"), category: "Surrender" };
    expect(strategyQuestionText(surrender)).toBe("10,6 vs A — surrender?");
    for (const question of [resolved, surrender, { player: hand("9", "9"), dealer: up("7"), category: "Pairs" as const }]) {
      const parsed = parseStrategyQuestion(strategyQuestionText(question));
      expect(parsed?.category).toBe(question.category);
      expect(parsed?.player.map((card) => card.rank)).toEqual(question.player.map((card) => card.rank));
      expect(parsed?.dealer.rank).toBe(question.dealer.rank);
      expect(isStrategyQuestion(parsed)).toBe(true);
    }
    expect(parseStrategyQuestion("Z,8 vs K")).toBeNull();
    expect(isStrategyQuestion({ player: [], dealer: up("2"), category: "Pairs" })).toBe(false);
  });

  it("links a hand to its chart cell", () => {
    expect(strategyChartCell({ player: hand("A", "8"), dealer: up("K"), category: "Soft totals" })).toEqual({ section: "soft", hand: "A,8", dealer: "10" });
    expect(strategyChartCell({ player: hand("10", "6"), dealer: up("9"), category: "Surrender" })).toEqual({ section: "surrender", hand: "16", dealer: "9" });
    expect(strategyChartCell({ player: hand("8", "10"), dealer: up("9"), category: "Hard totals" })).toBeNull();
  });
});

describe("Weak spots focus", () => {
  it("never leans on surrender when the table has none", () => {
    expect(focusCandidates("none")).not.toContain("Surrender");
    const pick = pickFocusCategory({ surrender: "none", due: ["Surrender", "Pairs"], seen: new Set(["Surrender", "Pairs"]), history: {} });
    expect(pick).toEqual({ category: "Pairs", reason: "due" });
    const byHistory = pickFocusCategory({
      surrender: "none",
      due: ["Surrender"],
      seen: new Set(["Surrender", "Pairs", "Hard totals", "Soft totals"]),
      history: { Surrender: { correct: 0, total: 9 }, Pairs: { correct: 5, total: 10 }, "Soft totals": { correct: 9, total: 10 } },
    });
    expect(byHistory).toEqual({ category: "Pairs", reason: "weakest", correct: 5, total: 10 });
  });

  it("reports unseen types as new and seen ones as due", () => {
    expect(pickFocusCategory({ surrender: "late", due: ["Soft totals"], seen: new Set(), history: {} })?.reason).toBe("new");
    expect(pickFocusCategory({ surrender: "late", due: ["Soft totals"], seen: new Set(["Soft totals"]), history: {} })?.reason).toBe("due");
    expect(pickFocusCategory({ surrender: "late", due: [], seen: new Set(), history: {} })).toBeUndefined();
  });

  it("deals no surrender question in any mode when the table has none", () => {
    for (let draw = 0; draw < 600; draw += 1) {
      for (const mode of ["standard", "adaptive", "tricky"] as const) {
        expect(drawStrategyQuestion({ mode, surrender: "none", focus: "Surrender" }).category).not.toBe("Surrender");
      }
    }
  });

  it("leans on the focus type in Weak spots", () => {
    const draws = Array.from({ length: 400 }, () => drawStrategyQuestion({ mode: "adaptive", surrender: "late", focus: "Soft totals" }));
    expect(draws.filter((question) => question.category === "Soft totals").length).toBeGreaterThan(240);
  });

  it("builds retry rounds from the missed hands, dropping surrender hands the table no longer offers", () => {
    const questions = [parseStrategyQuestion("10,6 vs A — surrender?"), parseStrategyQuestion("A,8 vs 6"), parseStrategyQuestion("8,8 vs 10")];
    expect(strategyRetryQueue(questions, "none").map(strategyQuestionText).sort()).toEqual(["8,8 vs 10", "A,8 vs 6"]);
    expect(strategyRetryQueue(questions, "late")).toHaveLength(3);
  });
});
