import { describe, expect, it } from "vitest";
import { cellDecision, countLadder, decideHand, DEFAULT_TABLE_RULES, indexList, takeInsurance, type TableRules } from "@/lib/strategy";
import { buildIndexQuestion, CORE_PRIORITY_LIMIT, dealIndex, entryLabel, explainIndex, focusQuestions, indexMistake, indexPool, permissionsFor, playable, questionFromMistake, resolveIndex, switchCounts, workingShapes, type DealState } from "./indexPlays";
import { handLadder } from "./ladder";
import { ALL_RULES, label, seeded } from "./testRules";

const rules = (patch: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...patch });

describe("index play questions", () => {
  it("can ask every index the rules have, on both sides of its switch", () => {
    for (const table of ALL_RULES) {
      for (const entry of indexList(table)) expect(playable(entry, table), `${label(table)} ${entry.id}`).toBe(true);
    }
  });

  it("expects exactly cellDecision at the stated count, with the hand's own permissions", () => {
    for (const table of ALL_RULES) {
      const rng = seeded(table.decks * 31 + (table.hitSoft17 ? 1 : 2));
      const list = indexList(table);
      for (const entry of list) {
        for (const side of ["index", "basic"] as const) {
          for (const offset of [0, 1, 2]) {
            const question = buildIndexQuestion(entry, side, table, rng, offset)!;
            const hand = resolveIndex(question, table, list);
            expect(hand, `${label(table)} ${entry.id}`).not.toBeNull();
            const name = `${label(table)} ${entry.id} ${side}+${offset} at ${question.tc} (${question.cards.map((card) => card.rank)})`;
            if (entry.kind === "insurance") {
              expect(hand!.correct, name).toBe(takeInsurance(question.tc) ? "I" : "N");
              expect(hand!.correct, name).toBe(side === "index" ? "I" : "N");
              continue;
            }
            const permissions = permissionsFor(hand!.drawn ? "drawn" : "two", table, entry.ref!);
            expect(hand!.correct, name).toBe(cellDecision(table, entry.ref!, question.tc, permissions).action);
            expect(hand!.correct, name).toBe(decideHand({ cards: question.cards, upcard: question.upcard, rules: table, tc: question.tc }).action);
            expect(hand!.available, name).toContain(hand!.correct);
            if (side === "index") expect(hand!.correct, name).toBe(entry.play);
            else expect(hand!.correct, name).not.toBe(entry.play);
            if (offset === 0) expect(question.tc).toBe(side === "index" ? entry.at : switchCounts(entry).basic);
          }
        }
      }
    }
  });

  it("asks index stand plays on drawn hands where a two-card hand would surrender", () => {
    const table = rules();
    const entry = indexList(table).find((candidate) => candidate.id === "hard:16v10")!;
    expect(workingShapes(entry, table)).toEqual(["drawn"]);
    const rng = seeded(11);
    for (let draw = 0; draw < 20; draw += 1) {
      const hand = resolveIndex(buildIndexQuestion(entry, draw % 2 ? "index" : "basic", table, rng)!, table)!;
      expect(hand.drawn).toBe(true);
      expect(hand.surrender).toBe("drawn");
      expect(hand.available).not.toContain("R");
    }
    // Without surrender, the same index is a plain two-card question.
    const noSurrender = rules({ surrender: "none" });
    const plain = indexList(noSurrender).find((candidate) => candidate.id === "hard:16v10")!;
    expect(workingShapes(plain, noSurrender)).toContain("two");
  });

  it("never asks or expects surrender when the table has none", () => {
    for (const table of ALL_RULES.filter((candidate) => candidate.surrender === "none")) {
      const pool = indexPool(table, "all");
      expect(pool.some((entry) => entry.kind === "surrender")).toBe(false);
      const rng = seeded(12);
      const state: DealState = { sides: {} };
      for (let draw = 0; draw < 200; draw += 1) {
        const question = dealIndex(pool, table, state, {}, rng)!;
        const hand = resolveIndex(question, table)!;
        expect(hand.correct).not.toBe("R");
        expect(hand.available).not.toContain("R");
        state.sides[question.id] = question.side;
        state.last = question.id;
      }
    }
  });

  it("samples both sides of each index within a round", () => {
    for (const table of [rules(), rules({ hitSoft17: false, surrender: "none" }), rules({ surrender: "early" })]) {
      for (const set of ["core", "all"] as const) {
        const pool = indexPool(table, set);
        const rng = seeded(13);
        const state: DealState = { sides: {} };
        const seen = new Map<string, Set<number>>();
        for (let draw = 0; draw < pool.length * 30; draw += 1) {
          const question = dealIndex(pool, table, state, {}, rng)!;
          expect(question.id).not.toBe(state.last);
          state.sides[question.id] = question.side;
          state.last = question.id;
          if (!seen.has(question.id)) seen.set(question.id, new Set());
          seen.get(question.id)!.add(question.tc);
        }
        for (const entry of pool) {
          const counts = seen.get(entry.id);
          const { index, basic } = switchCounts(entry);
          expect(counts?.has(index), `${label(table)} ${entry.id} at the index ${index}`).toBe(true);
          expect(counts?.has(basic), `${label(table)} ${entry.id} on the basic side ${basic}`).toBe(true);
        }
      }
    }
  });

  it("starts the I18 + Fab 4 set with the published learning order", () => {
    const table = rules();
    const core = indexPool(table, "core");
    expect(core[0].id).toBe("insurance");
    expect(core[1].id).toBe("hard:16v10");
    expect(core.every((entry) => entry.priority < CORE_PRIORITY_LIMIT)).toBe(true);
    expect(core.map((entry) => entry.id)).toEqual(expect.arrayContaining(["R:hard:14v10", "R:hard:15v10", "R:hard:15v9", "R:hard:15vA", "pairs:T,Tv5", "hard:13v3"]));
    expect(core.length).toBe(22);
    expect(indexPool(table, "all").length).toBeGreaterThan(core.length);
  });

  it("round-trips a mistake and focuses on both sides of one index", () => {
    const table = rules();
    const entry = indexList(table).find((candidate) => candidate.id === "hard:12v3")!;
    const question = buildIndexQuestion(entry, "basic", table, seeded(14))!;
    const hand = resolveIndex(question, table)!;
    expect(entryLabel(entry)).toBe("12 vs 3");
    expect(explainIndex(hand, table)).toMatch(/The index is stand at \+2 or higher, so at \+1 basic strategy holds/);
    expect(questionFromMistake(indexMistake(hand, "S", table))).toEqual(question);
    const focused = focusQuestions(entry, table, seeded(15));
    expect(new Set(focused.map((item) => item.side))).toEqual(new Set(["index", "basic"]));
  });
});

describe("count ladders", () => {
  it("match countLadder for a two-card hand and switch at the stand index for a drawn one", () => {
    const table = rules();
    const ref = { section: "hard" as const, row: "16", dealer: "10" as const };
    expect(handLadder(table, ref, { canDouble: true, canSplit: false, canSurrender: true })).toEqual(countLadder(table, ref));
    expect(handLadder(table, ref, { canDouble: false, canSplit: false, canSurrender: false }).map((segment) => [segment.from, segment.to, segment.action])).toEqual([[-6, -1, "H"], [0, 10, "S"]]);
  });
});
