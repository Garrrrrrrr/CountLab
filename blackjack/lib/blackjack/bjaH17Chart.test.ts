import { describe, expect, it } from "vitest";
import {
  BJA_H17_SECTIONS,
  CHART_DEALERS,
  ChartSection,
  cellKey,
  formatToken,
} from "./bjaH17Chart";

const section = (id: string): ChartSection => {
  const found = BJA_H17_SECTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};
const cell = (id: string, row: string, dealer: string) =>
  formatToken(section(id).cells.get(cellKey(section(id).id, row, dealer))!);

describe("BJA H17 chart", () => {
  it("has the printed dealer upcards", () => {
    expect(CHART_DEALERS).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]);
  });

  it("has the printed row counts and a full grid for each", () => {
    expect(BJA_H17_SECTIONS.map((s) => [s.id, s.rows.length])).toEqual([
      ["pairs", 10],
      ["soft", 8],
      ["hard", 10],
      ["surrender", 4],
    ]);
    for (const chartSection of BJA_H17_SECTIONS) {
      expect(chartSection.cells.size).toBe(chartSection.rows.length * CHART_DEALERS.length);
    }
  });

  it("totals 320 cells", () => {
    const total = BJA_H17_SECTIONS.reduce((sum, chartSection) => sum + chartSection.cells.size, 0);
    expect(total).toBe(320);
  });

  it("keeps the printed cells and includes the supplied chart additions", () => {
    const indices: string[] = [];
    for (const chartSection of BJA_H17_SECTIONS) {
      for (const row of chartSection.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer))!;
          if (token.kind === "index") indices.push(`${chartSection.id} ${row}v${dealer} ${formatToken(token)}`);
        }
      }
    }
    expect(indices).toEqual([
      "pairs T,Tv4 6+",
      "pairs T,Tv5 5+",
      "pairs T,Tv6 4+",
      "pairs 9,9v7 3+",
      "soft A,9v4 6+",
      "soft A,9v5 5+",
      "soft A,9v6 4+",
      "soft A,8v4 3+",
      "soft A,8v5 1+",
      "soft A,8v6 0-",
      "soft A,6v2 1+",
      "hard 16v9 4+",
      "hard 16v10 0+",
      "hard 16vA 3+",
      "hard 15v10 4+",
      "hard 15vA 5+",
      "hard 13v2 -1-",
      "hard 13v3 -2+",
      "hard 12v2 3+",
      "hard 12v3 2+",
      "hard 12v4 0-",
      "hard 12v5 -2+",
      "hard 12v6 -3+",
      "hard 11vA -1+",
      "hard 10v10 4+",
      "hard 10vA 3+",
      "hard 9v2 1+",
      "hard 9v7 3+",
      "hard 8v6 2+",
      "surrender 16v8 4+",
      "surrender 16v9 -1-",
      "surrender 15v9 2+",
      "surrender 15v10 0-",
      "surrender 15vA -1+",
      "surrender 14v10 3+",
    ]);
  });

  it("preserves legacy cells while adding the requested cells", () => {
    // Surrender 15 v 10 and hard 15 v 10 disagree by design: the chart as
    // printed surrenders at TC <= 0, hits +1..+3, and stands at +4 and above.
    expect(cell("surrender", "15", "10")).toBe("0-");
    expect(cell("hard", "15", "10")).toBe("4+");
    expect(cell("surrender", "16", "9")).toBe("-1-");
    expect(cell("surrender", "17", "A")).toBe("SUR");
    expect(cell("surrender", "14", "10")).toBe("3+");
    expect(cell("pairs", "9,9", "7")).toBe("3+");
    expect(cell("pairs", "9,9", "8")).toBe("Y");
    expect(cell("pairs", "T,T", "4")).toBe("6+");
    expect(cell("pairs", "4,4", "5")).toBe("Y/N");
    expect(cell("soft", "A,9", "3")).toBe("S");
    expect(cell("soft", "A,9", "4")).toBe("6+");
    expect(cell("soft", "A,9", "6")).toBe("4+");
    expect(cell("soft", "A,7", "6")).toBe("Ds");
    expect(cell("soft", "A,7", "9")).toBe("H");
    expect(cell("hard", "8", "6")).toBe("2+");
    expect(cell("hard", "9", "7")).toBe("3+");
  });

  it("renders the complete legacy grid with the added cells", () => {
    const rendered = BJA_H17_SECTIONS.map((chartSection) => {
      const lines = chartSection.rows.map((row) =>
        `${row} ${CHART_DEALERS.map((dealer) =>
          formatToken(chartSection.cells.get(cellKey(chartSection.id, row, dealer))!)).join(" ")}`);
      return `${chartSection.label}\n${lines.join("\n")}`;
    }).join("\n\n");

    expect(rendered).toContain("9,9 Y Y Y Y Y 3+ Y Y N N");
    expect(rendered).toContain("13 -1- -2+ S S S H H H H H");
    expect(rendered).toContain("12 3+ 2+ 0- -2+ -3+ H H H H H");
    expect(rendered).toContain("14 N N N N N N N N 3+ N");
  });
});
