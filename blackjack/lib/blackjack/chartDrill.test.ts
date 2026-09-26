import { describe, expect, it } from "vitest";
import { cellKeysOf, cellStatus, chartTableFor, gradeScope, indexCellKeys, sectionsFor, settledCounts, surrenderEntryKeys, withoutKeys } from "./chartDrill";

describe("chart scope", () => {
  it("fills the late table when the table has no surrender", () => {
    expect(chartTableFor("none")).toBe("late");
    expect(chartTableFor("late")).toBe("late");
    expect(chartTableFor("early")).toBe("early10");
  });

  it("counts the cells the setup cards promise", () => {
    expect(cellKeysOf(sectionsFor("all", "late"))).toHaveLength(320);
    expect(cellKeysOf(sectionsFor("all", "early10"))).toHaveLength(350);
    expect(cellKeysOf(sectionsFor("pairs", "late"))).toHaveLength(100);
    expect(cellKeysOf(sectionsFor("soft", "late"))).toHaveLength(80);
    expect(cellKeysOf(sectionsFor("surrender", "late"))).toHaveLength(40);
    expect(cellKeysOf(sectionsFor("surrender", "early10"))).toHaveLength(70);
  });

  it("finds the index cells", () => {
    const keys = indexCellKeys(sectionsFor("all", "late"));
    expect(keys).toContain("hard:16v10");
    expect(keys).toContain("pairs:T,Tv5");
    expect(keys).not.toContain("hard:17v2");
  });
});

describe("gradeScope", () => {
  const sections = sectionsFor("hard", "late");
  const entries = { "hard:17v2": "s", "hard:17v3": "h", "hard:16v10": "0+", "hard:16v9": "4+" };

  it("grades the whole selection without a subset", () => {
    const grade = gradeScope(sections, entries);
    expect(grade.total).toBe(100);
    expect(grade.correct).toBe(3);
    expect(grade.wrong).toBe(1);
  });

  it("grades only the subset, with its own best run and sections", () => {
    const only = new Set(["hard:16v9", "hard:16v10", "hard:15v10"]);
    const grade = gradeScope(sections, entries, only);
    expect(grade.total).toBe(3);
    expect(grade.correct).toBe(2);
    expect(grade.skipped).toBe(1);
    expect(grade.bestStreak).toBe(2);
    expect(grade.bySection).toEqual({ "Hard totals": { correct: 2, total: 3 } });
  });

  it("counts only finished entries as settled", () => {
    const grade = gradeScope(sections, { ...entries, "hard:15v10": "4" });
    expect(settledCounts(grade, { ...entries, "hard:15v10": "4" })).toEqual({ right: 3, wrong: 1 });
  });
});

describe("surrender entries", () => {
  it("finds and clears the shared surrender keys", () => {
    const entries = { "surrender:16v10": "r", "hard:16v10": "0+", "surrender:15v9": "" };
    expect(surrenderEntryKeys(entries)).toEqual(["surrender:16v10"]);
    expect(withoutKeys(entries, ["surrender:16v10"])).toEqual({ "hard:16v10": "0+", "surrender:15v9": "" });
  });

  it("describes checked cells", () => {
    expect(cellStatus({ answered: true, correct: true, expected: "S" })).toBe("Correct");
    expect(cellStatus({ answered: true, correct: false, expected: "4+" })).toBe("Wrong, the chart says 4+");
    expect(cellStatus({ answered: false, correct: false, expected: "S" })).toBe("Blank, the chart says S");
  });
});
