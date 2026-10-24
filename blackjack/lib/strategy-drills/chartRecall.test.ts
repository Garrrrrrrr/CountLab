import { describe, expect, it } from "vitest";
import { buildChart, cellKey, DEFAULT_TABLE_RULES, type TableRules } from "@/lib/strategy";
import { availableTables, cellMistake, cleanEntries, entryMatches, formatEntry, gradeTable, recallTables, type CellEntry } from "./chartRecall";
import { playToken } from "./chartRow";
import { ALL_RULES, label } from "./testRules";

const rules = (patch: Partial<TableRules> = {}): TableRules => ({ ...DEFAULT_TABLE_RULES, ...patch });
const perfect = (tables: ReturnType<typeof recallTables>) => Object.fromEntries(tables.flatMap((table) => table.cells.map((cell) => [cell.key, cell.expected] as const)));

describe("chart recall", () => {
  it("expects exactly what buildChart prints, table by table", () => {
    for (const table of ALL_RULES) {
      const chart = buildChart(table);
      const tables = recallTables(table, "indices");
      expect(tables.map((entry) => entry.id), label(table)).toEqual(table.surrender === "none" ? ["hard", "soft", "pairs"] : ["surrender", "hard", "soft", "pairs"]);
      expect(availableTables(table)).toEqual(tables.map((entry) => entry.id));
      for (const recall of tables) {
        for (const cell of recall.cells) {
          expect(recall.baseKeys, `${label(table)} ${cell.key}`).toContain(cell.expected.base);
          if (recall.id === "surrender") {
            const rule = chart.surrender!.cells.get(cellKey(cell.ref));
            expect(cell.expected.base).toBe(rule?.basic ? "R" : "-");
            expect(cell.expected.dev?.at).toBe(rule && Number.isFinite(rule.at) ? rule.at : undefined);
          } else {
            const printed = chart.tables[recall.id].cells.get(cellKey(cell.ref))!;
            expect(cell.expected.base).toBe(playToken(printed.basic));
            // A play Wong makes at every count has no number to recall.
            expect(cell.expected.dev).toEqual(printed.index && Number.isFinite(printed.index.at) ? { play: printed.index.play, at: printed.index.at } : undefined);
          }
        }
      }
      // "Basic plays" asks for no counts at all.
      expect(recallTables(table, "basic").every((recall) => recall.cells.every((cell) => cell.expected.dev === undefined))).toBe(true);
    }
  });

  it("offers the same keys whatever the answers are, so a key never gives one away", () => {
    for (const table of ALL_RULES) {
      for (const recall of recallTables(table, "basic")) {
        const standard = { surrender: ["R", "-"], hard: ["H", "S", "D"], soft: ["H", "S", "D", "Ds"], pairs: ["H", "S", "D", "P"] }[recall.id];
        expect(recall.baseKeys, `${label(table)} ${recall.id}`).toEqual(expect.arrayContaining(standard));
      }
    }
  });

  it("grades a perfect chart at 100% and marks wrong and blank cells", () => {
    const table = rules();
    const tables = recallTables(table, "indices");
    const entries: Record<string, CellEntry> = perfect(tables);
    for (const recall of tables) expect(gradeTable(recall, entries, "indices").correct).toBe(recall.cells.length);

    const hard = tables.find((recall) => recall.id === "hard")!;
    const sixteen = `hard|${cellKey({ section: "hard", row: "16", dealer: "10" })}`;
    expect(entries[sixteen]).toEqual({ base: "H", dev: { play: "S", at: 0 } });
    // The right play with the wrong index is right at "Basic plays" and wrong "With indices".
    const wrongIndex = { ...entries, [sixteen]: { base: "H", dev: { play: "S" as const, at: 1 } } };
    expect(gradeTable(hard, wrongIndex, "indices").wrong).toBe(1);
    expect(gradeTable(hard, wrongIndex, "basic").wrong).toBe(0);
    // An index on a cell that has none is wrong too.
    const twelveTwo = `hard|${cellKey({ section: "hard", row: "17", dealer: "2" })}`;
    expect(entryMatches(entries[twelveTwo], { base: "S", dev: { play: "H", at: -3 } }, "indices")).toBe(false);

    const blank = { ...entries };
    delete blank[sixteen];
    const graded = gradeTable(hard, blank, "indices");
    expect(graded.blank).toBe(1);
    expect(graded.correct).toBe(hard.cells.length - 1);
    const miss = graded.cells.find((cell) => !cell.ok)!;
    const mistake = cellMistake(table, miss, hard);
    expect(mistake.userAnswer).toBe("(blank)");
    expect(mistake.correctAnswer).toBe("H · S 0↑");
    expect(mistake.explanation).toMatch(/stand at 0 or higher/);
  });

  it("asks the surrender table only where it is offered, with its thresholds", () => {
    const table = rules();
    const surrender = recallTables(table, "indices", ["surrender"])[0];
    const byKey = new Map(surrender.cells.map((cell) => [cell.key, cell.expected]));
    // Wong's table 33: late surrender 16 v 10 from -2.
    expect(byKey.get("surrender|hard:16v10")).toEqual({ base: "R", dev: { play: "R", at: -2 } });
    expect(byKey.get("surrender|hard:15v10")).toEqual({ base: "R", dev: { play: "R", at: 0 } });
    expect(byKey.get("surrender|hard:14v10")).toEqual({ base: "-", dev: { play: "R", at: 3 } });
    // Small dealer cards are never surrendered against, so they are shown, not asked.
    expect(surrender.cells.some((cell) => ["2", "3", "4", "5", "6", "7"].includes(cell.ref.dealer))).toBe(false);
    expect(surrender.rows.every((row) => row.cells.length === 10)).toBe(true);
    const shown = new Map(surrender.rows.flatMap((row) => row.cells).map((cell) => [cell.key, cell.expected]));
    expect(shown.get("surrender|hard:16v2")).toEqual({ base: "-", dev: undefined });
    expect(recallTables(rules({ surrender: "none" }), "indices", ["surrender"])).toEqual([]);
    expect(formatEntry({ base: "-", dev: { play: "R", at: 3 } }, "up")).toBe("— · R +3↑");
  });

  it("drops saved entries it does not recognise", () => {
    expect(cleanEntries({ "hard|hard:16v10": { base: "H", dev: { play: "S", at: 0 } }, junk: { base: "H" }, "soft|soft:A,7v3": { base: "Q" }, "pairs|pairs:8,8v10": "P" })).toEqual({ "hard|hard:16v10": { base: "H", dev: { play: "S", at: 0 } } });
  });
});
