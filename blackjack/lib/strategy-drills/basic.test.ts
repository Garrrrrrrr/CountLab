import { describe, expect, it } from "vitest";
import type { Card, Rank } from "@/lib/blackjack/types";
import { cellDecision, cellKey, decideHand, DEFAULT_TABLE_RULES, surrenderOffered, type TableRules } from "@/lib/strategy";
import { BASIC_FOCUSES, basicMistake, borderlineCells, categoryOf, drawBasic, explainBasic, legalActions, parsePracticeKey, questionFromMistake, recentMisses, resolveBasic, surrenderPool, weakPool, type BasicFocus } from "./basic";
import { ALL_RULES, label, seeded } from "./testRules";

const card = (rank: Rank, suit: Card["suit"] = "spades"): Card => ({ rank, suit });
const rules = (patch: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...patch });

describe("basic strategy questions", () => {
  it("grades every dealt hand with decideHand and only offers legal actions", () => {
    for (const table of ALL_RULES) {
      const rng = seeded(table.decks * 100 + table.surrender.length);
      const weak = weakPool(table, {}, {});
      for (const focus of BASIC_FOCUSES) {
        for (let draw = 0; draw < 60; draw += 1) {
          const question = drawBasic({ focus, rules: table, weak, rng });
          const hand = resolveBasic(question, table);
          expect(hand, `${label(table)} ${focus}`).not.toBeNull();
          const expected = decideHand({ cards: question.cards, upcard: question.upcard, rules: table });
          expect(hand!.correct).toBe(expected.action);
          expect(hand!.available, `${label(table)} ${hand!.key}`).toContain(hand!.correct);
          if (hand!.drawn) expect(hand!.available).toEqual(["H", "S"]);
          if (!surrenderOffered(table)) {
            expect(hand!.correct).not.toBe("R");
            expect(hand!.available).not.toContain("R");
            expect(hand!.category).not.toBe("Surrender");
          }
        }
      }
    }
  });

  it("keeps each focus to its slice of the chart", () => {
    const table = rules();
    const rng = seeded(7);
    const sections: Record<BasicFocus, string[]> = { hard: ["hard"], soft: ["soft"], pairs: ["pairs"], surrender: ["hard", "pairs"], mixed: ["hard", "soft", "pairs"], weak: ["hard", "soft", "pairs"] };
    for (const focus of BASIC_FOCUSES) {
      for (let draw = 0; draw < 80; draw += 1) {
        const hand = resolveBasic(drawBasic({ focus, rules: table, weak: weakPool(table, {}, {}), rng }), table)!;
        expect(sections[focus]).toContain(hand.cell.section);
      }
    }
    const pool = surrenderPool(table).map((entry) => cellKey(entry.cell));
    for (let draw = 0; draw < 80; draw += 1) {
      const hand = resolveBasic(drawBasic({ focus: "surrender", rules: table, rng }), table)!;
      expect(pool).toContain(cellKey(hand.cell));
      expect(hand.drawn).toBe(false);
    }
  });

  it("asks no surrender questions when the table has none, even when the focus is surrender", () => {
    const rng = seeded(8);
    for (const decks of [1, 2, 6]) {
      const table = rules({ decks, surrender: "none" });
      for (let draw = 0; draw < 200; draw += 1) {
        const hand = resolveBasic(drawBasic({ focus: "surrender", rules: table, rng }), table)!;
        expect(hand.correct).not.toBe("R");
        expect(hand.available).not.toContain("R");
      }
    }
  });

  it("deals drawn hands, and a three-card soft 18 cannot double", () => {
    const table = rules();
    const softEighteen = resolveBasic({ cards: [card("A"), card("2"), card("5")], upcard: card("4", "hearts") }, table)!;
    expect(softEighteen.cell).toEqual({ section: "soft", row: "A,7", dealer: "4" });
    expect(cellDecision(table, softEighteen.cell, undefined).action).toBe("D");
    expect(softEighteen.correct).toBe("S");
    expect(softEighteen.available).toEqual(["H", "S"]);
    expect(explainBasic(softEighteen, table)).toMatch(/only double on your first two cards/);
    const drawnSixteen = resolveBasic({ cards: [card("6"), card("4"), card("6")], upcard: card("K") }, table)!;
    expect(drawnSixteen.correct).toBe("H");
    expect(resolveBasic({ cards: [card("10"), card("6")], upcard: card("K") }, table)!.correct).toBe("R");

    const rng = seeded(9);
    let drawn = 0;
    for (let draw = 0; draw < 400; draw += 1) if (resolveBasic(drawBasic({ focus: "soft", rules: table, rng }), table)!.drawn) drawn += 1;
    expect(drawn).toBeGreaterThan(30);
  });

  it("offers double and split only where the hand and table allow them", () => {
    expect(legalActions([card("8"), card("8")], rules())).toEqual(["H", "S", "D", "P", "R"]);
    expect(legalActions([card("8"), card("8")], rules({ surrender: "none" }))).toEqual(["H", "S", "D", "P"]);
    expect(legalActions([card("A"), card("7")], rules({ doubling: "10-11" }))).toEqual(["H", "S", "R"]);
    expect(legalActions([card("6"), card("4")], rules({ doubling: "10-11" }))).toContain("D");
  });

  it("files surrender-table hands under Surrender only where surrender is offered", () => {
    const cell = { section: "hard" as const, row: "16", dealer: "10" as const };
    expect(categoryOf(cell, false, rules())).toBe("Surrender");
    expect(categoryOf(cell, true, rules())).toBe("Hard totals");
    expect(categoryOf(cell, false, rules({ surrender: "none" }))).toBe("Hard totals");
  });
});

describe("weak spots", () => {
  it("leans on missed and due cells, and falls back to the chart's borderline cells", () => {
    const table = rules();
    const now = Date.parse("2026-01-02T00:00:00Z");
    const states = {
      "soft:A,7v3": { itemKey: "soft:A,7v3", box: 1 as const, dueAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-01-01T00:00:00Z" },
      "hard:12v4": { itemKey: "hard:12v4", box: 5 as const, dueAt: "2026-02-01T00:00:00Z", lastSeenAt: "2026-01-01T00:00:00Z" },
      "Soft totals": { itemKey: "Soft totals", box: 1 as const, dueAt: "2026-01-01T00:00:00Z", lastSeenAt: "2026-01-01T00:00:00Z" },
    };
    const pool = weakPool(table, states, { "hard:16v10|drawn": 2 }, now);
    expect(pool.source).toBe("history");
    expect(pool.entries.map((entry) => entry.key).sort()).toEqual(["hard:16v10|drawn", "soft:A,7v3"]);
    const rng = seeded(10);
    const keys = new Map<string, number>();
    for (let draw = 0; draw < 300; draw += 1) {
      const hand = resolveBasic(drawBasic({ focus: "weak", rules: table, weak: pool, rng }), table)!;
      keys.set(hand.key, (keys.get(hand.key) ?? 0) + 1);
    }
    expect((keys.get("hard:16v10|drawn") ?? 0) + (keys.get("soft:A,7v3") ?? 0)).toBeGreaterThan(150);

    const fresh = weakPool(table, {}, {});
    expect(fresh.source).toBe("borderline");
    expect(fresh.entries.length).toBe(borderlineCells(table).length);
    expect(fresh.entries.some((entry) => entry.key === "hard:12v4")).toBe(true);
    expect(parsePracticeKey("pairs:8,8v10|drawn", table)).toBeNull();
    expect(parsePracticeKey("hard:16vA", table)).toEqual({ cell: { section: "hard", row: "16", dealer: "A" }, drawn: false });
  });

  it("rebuilds the exact hand from a saved mistake and counts recent misses by cell", () => {
    const table = rules();
    const hand = resolveBasic({ cards: [card("A", "hearts"), card("2"), card("5", "clubs")], upcard: card("Q", "diamonds") }, table)!;
    const mistake = basicMistake(hand, "D", table);
    expect(mistake.correctAnswer).toBe("Hit");
    expect(questionFromMistake(mistake)).toEqual({ cards: hand.cards, upcard: hand.upcard });
    const session = { id: "1", drill: "Basic Strategy" as const, questions: 1, correct: 0, accuracy: 0, averageResponseTime: 0, bestStreak: 0, date: "", mistakes: [mistake, mistake] };
    expect(recentMisses([session])).toEqual({ [hand.key]: 2 });
    expect(recentMisses([{ ...session, tags: ["retry"] }])).toEqual({});
  });
});
