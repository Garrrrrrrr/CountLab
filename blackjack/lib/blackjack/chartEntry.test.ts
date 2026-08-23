import { describe, expect, it } from "vitest";
import { BJA_H17_SECTIONS, CHART_DEALERS, cellKey, formatToken } from "./bjaH17Chart";
import { displayBuffer, explainToken, feedKey, gradeChart, parseEntry, SECTION_LETTERS, sectionLegend, tokensEqual } from "./chartEntry";

/** Types a whole string into one cell and returns the final buffer + disposition. */
const type = (section: Parameters<typeof feedKey>[0], keys: string) =>
  [...keys].reduce(
    (state, key) => feedKey(section, state.buffer, key),
    { buffer: "", disposition: "pending" } as ReturnType<typeof feedKey>,
  );

describe("feedKey", () => {
  it("commits a one-key answer and advances", () => {
    expect(feedKey("hard", "", "s")).toEqual({ buffer: "s", disposition: "commit" });
    expect(feedKey("hard", "", "h")).toEqual({ buffer: "h", disposition: "commit" });
    expect(feedKey("hard", "", "d")).toEqual({ buffer: "d", disposition: "commit" });
    expect(feedKey("surrender", "", "r")).toEqual({ buffer: "r", disposition: "commit" });
    expect(feedKey("surrender", "", "n")).toEqual({ buffer: "n", disposition: "commit" });
    expect(feedKey("pairs", "", "n")).toEqual({ buffer: "n", disposition: "commit" });
  });

  it("commits pairs' Y and soft's D immediately, same as every other single key", () => {
    expect(feedKey("pairs", "", "y")).toEqual({ buffer: "y", disposition: "commit" });
    expect(feedKey("soft", "", "d")).toEqual({ buffer: "d", disposition: "commit" });
  });

  it("enters a two-part answer with Shift on the trigger letter, in one keystroke", () => {
    expect(feedKey("pairs", "", "y", true)).toEqual({ buffer: "yn", disposition: "commit" });
    expect(feedKey("soft", "", "d", true)).toEqual({ buffer: "ds", disposition: "commit" });
    // Shift only means something on an empty buffer, for a section that has a compound.
    expect(feedKey("pairs", "", "n", true)).toEqual({ buffer: "n", disposition: "commit" });
    expect(feedKey("hard", "", "d", true)).toEqual({ buffer: "d", disposition: "commit" });
  });

  it("no longer builds a two-part answer by typing its letters one after another", () => {
    expect(feedKey("pairs", "y", "n")).toEqual({ buffer: "y", disposition: "ignore" });
    expect(feedKey("soft", "d", "s")).toEqual({ buffer: "d", disposition: "ignore" });
  });

  it("ignores keys outside the section's alphabet", () => {
    expect(feedKey("hard", "", "p")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "", "y")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "d", "s")).toEqual({ buffer: "d", disposition: "ignore" });
    expect(feedKey("surrender", "", "s")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("pairs", "y", "y")).toEqual({ buffer: "y", disposition: "ignore" });
    expect(feedKey("soft", "", "r")).toEqual({ buffer: "", disposition: "ignore" });
  });

  it("is case-insensitive", () => {
    expect(feedKey("hard", "", "S")).toEqual({ buffer: "s", disposition: "commit" });
    expect(feedKey("pairs", "", "Y", true)).toEqual({ buffer: "yn", disposition: "commit" });
  });

  it("builds an index and commits on the sign", () => {
    expect(type("hard", "4+")).toEqual({ buffer: "4+", disposition: "commit" });
    expect(type("hard", "0-")).toEqual({ buffer: "0-", disposition: "commit" });
    expect(type("hard", "0+")).toEqual({ buffer: "0+", disposition: "commit" });
    expect(type("hard", "-1-")).toEqual({ buffer: "-1-", disposition: "commit" });
    expect(type("surrender", "-1+")).toEqual({ buffer: "-1+", disposition: "commit" });
    expect(type("pairs", "6+")).toEqual({ buffer: "6+", disposition: "commit" });
    expect(type("hard", "10+")).toEqual({ buffer: "10+", disposition: "commit" });
  });

  it("holds a partial index", () => {
    expect(feedKey("hard", "", "4")).toEqual({ buffer: "4", disposition: "pending" });
    expect(feedKey("hard", "", "-")).toEqual({ buffer: "-", disposition: "pending" });
    expect(feedKey("hard", "-", "1")).toEqual({ buffer: "-1", disposition: "pending" });
  });

  it("rejects index shapes the chart never prints", () => {
    expect(feedKey("hard", "", "+")).toEqual({ buffer: "", disposition: "ignore" });
    expect(feedKey("hard", "-", "+")).toEqual({ buffer: "-", disposition: "ignore" });
    expect(feedKey("hard", "10", "0")).toEqual({ buffer: "10", disposition: "ignore" });
    expect(feedKey("hard", "4", "s")).toEqual({ buffer: "4", disposition: "ignore" });
  });

  it("deletes backwards, then hands focus back", () => {
    expect(feedKey("hard", "4+", "Backspace")).toEqual({ buffer: "4", disposition: "pending" });
    expect(feedKey("hard", "4", "Backspace")).toEqual({ buffer: "", disposition: "pending" });
    expect(feedKey("hard", "", "Backspace")).toEqual({ buffer: "", disposition: "back" });
  });

  it("ignores non-character keys", () => {
    expect(feedKey("hard", "s", "Shift")).toEqual({ buffer: "s", disposition: "ignore" });
    expect(feedKey("hard", "s", "ArrowLeft")).toEqual({ buffer: "s", disposition: "ignore" });
  });
});

describe("parseEntry", () => {
  it("maps each section's letters to its printed token", () => {
    expect(parseEntry("pairs", "y")).toEqual({ kind: "action", value: "Y" });
    expect(parseEntry("pairs", "n")).toEqual({ kind: "action", value: "N" });
    expect(parseEntry("pairs", "yn")).toEqual({ kind: "action", value: "Y/N" });
    expect(parseEntry("soft", "ds")).toEqual({ kind: "action", value: "Ds" });
    expect(parseEntry("soft", "d")).toEqual({ kind: "action", value: "D" });
    expect(parseEntry("surrender", "r")).toEqual({ kind: "action", value: "SUR" });
  });

  it("refuses letters from another section", () => {
    expect(parseEntry("hard", "ds")).toBeNull();
    expect(parseEntry("hard", "y")).toBeNull();
    expect(parseEntry("surrender", "s")).toBeNull();
  });

  it("parses indexes in every section", () => {
    expect(parseEntry("hard", "-1-")).toEqual({ kind: "index", value: -1, when: "atOrBelow" });
    expect(parseEntry("surrender", "-1+")).toEqual({ kind: "index", value: -1, when: "atOrAbove" });
    expect(parseEntry("pairs", "6+")).toEqual({ kind: "index", value: 6, when: "atOrAbove" });
    expect(parseEntry("soft", "0-")).toEqual({ kind: "index", value: 0, when: "atOrBelow" });
  });

  it("returns null for an unfinished or nonsense buffer", () => {
    expect(parseEntry("hard", "")).toBeNull();
    expect(parseEntry("hard", "4")).toBeNull();
    expect(parseEntry("hard", "-")).toBeNull();
  });
});

describe("displayBuffer", () => {
  it("shows the printed form once the buffer parses", () => {
    expect(displayBuffer("pairs", "yn")).toBe("Y/N");
    expect(displayBuffer("soft", "ds")).toBe("Ds");
    expect(displayBuffer("surrender", "r")).toBe("SUR");
    expect(displayBuffer("hard", "-1-")).toBe("-1-");
  });

  it("echoes an unfinished buffer", () => {
    expect(displayBuffer("hard", "")).toBe("");
    expect(displayBuffer("hard", "4")).toBe("4");
    expect(displayBuffer("hard", "-")).toBe("-");
  });
});

describe("tokensEqual", () => {
  it("compares value and direction", () => {
    expect(tokensEqual({ kind: "index", value: 4, when: "atOrAbove" }, { kind: "index", value: 4, when: "atOrAbove" })).toBe(true);
    expect(tokensEqual({ kind: "index", value: 4, when: "atOrAbove" }, { kind: "index", value: 4, when: "atOrBelow" })).toBe(false);
    expect(tokensEqual({ kind: "action", value: "Y" }, { kind: "action", value: "Y/N" })).toBe(false);
    expect(tokensEqual(null, { kind: "action", value: "Y" })).toBe(false);
  });
});

describe("the grammar covers the chart", () => {
  it("can express every printed token in the section it appears in", () => {
    for (const chartSection of BJA_H17_SECTIONS) {
      const reachable = new Set<string>(
        SECTION_LETTERS[chartSection.id].map((buffer) => formatToken(parseEntry(chartSection.id, buffer)!)),
      );
      for (const row of chartSection.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = chartSection.cells.get(cellKey(chartSection.id, row, dealer))!;
          const printed = formatToken(token);
          const typable = token.kind === "index"
            ? parseEntry(chartSection.id, printed) !== null
            : reachable.has(printed);
          expect(typable, `${chartSection.id} ${row} v ${dealer} prints "${printed}"`).toBe(true);
        }
      }
    }
  });
});

const surrenderSection = BJA_H17_SECTIONS.filter((s) => s.id === "surrender");

describe("gradeChart", () => {
  it("counts an empty run as all skipped", () => {
    const grade = gradeChart(surrenderSection, {});
    expect(grade.total).toBe(40);
    expect(grade.answered).toBe(0);
    expect(grade.correct).toBe(0);
    expect(grade.skipped).toBe(40);
    expect(grade.wrong).toBe(0);
    expect(grade.bestStreak).toBe(0);
  });

  it("marks a cell correct only when value and direction match", () => {
    const grade = gradeChart(surrenderSection, {
      "surrender:16v9": "-1-",
      "surrender:16v10": "r",
      "surrender:15v9": "2-",
      "surrender:14v2": "n",
    });
    const at = (key: string) => grade.cells.find((cell) => cell.key === key)!;
    expect(at("surrender:16v9").correct).toBe(true);
    expect(at("surrender:16v10").correct).toBe(true);
    expect(at("surrender:15v9").correct).toBe(false);
    expect(at("surrender:15v9").expected).toBe("2+");
    expect(at("surrender:15v9").typed).toBe("2-");
    expect(at("surrender:14v2").correct).toBe(true);
    expect(grade.correct).toBe(3);
    expect(grade.wrong).toBe(1);
    expect(grade.skipped).toBe(36);
  });

  it("treats an unfinished buffer as a wrong answer, not a skip", () => {
    const grade = gradeChart(surrenderSection, { "surrender:16v8": "4" });
    const cell = grade.cells.find((entry) => entry.key === "surrender:16v8")!;
    expect(cell.answered).toBe(true);
    expect(cell.correct).toBe(false);
    expect(cell.typed).toBe("4");
    expect(grade.skipped).toBe(39);
  });

  it("measures the longest correct run in chart order", () => {
    const entries: Record<string, string> = {};
    for (const dealer of ["2", "3", "4", "5", "6", "7", "8"]) entries[`surrender:17v${dealer}`] = "n";
    // Breaks the run at 17 v 9, then resumes.
    entries["surrender:17v9"] = "r";
    entries["surrender:17vA"] = "r";
    const grade = gradeChart(surrenderSection, entries);
    expect(grade.bestStreak).toBe(7);
  });

  it("reports accuracy per section label", () => {
    const grade = gradeChart(surrenderSection, { "surrender:14v2": "n" });
    expect(grade.bySection).toEqual({ "Late surrender": { correct: 1, total: 40 } });
  });
});

describe("explainToken", () => {
  it("reads N differently in the split and surrender tables", () => {
    expect(explainToken("pairs", { kind: "action", value: "N" })).toBe("Do not split the pair.");
    expect(explainToken("surrender", { kind: "action", value: "N" })).toBe("Do not surrender.");
  });

  it("spells out the conditional actions", () => {
    expect(explainToken("pairs", { kind: "action", value: "Y/N" }))
      .toBe("Split only if double after split is offered.");
    expect(explainToken("soft", { kind: "action", value: "Ds" }))
      .toBe("Double if allowed, otherwise stand.");
  });

  it("states an index with its direction", () => {
    expect(explainToken("hard", { kind: "index", value: 4, when: "atOrAbove" }))
      .toBe("The chart prints 4+: the deviation applies at true count +4 and above.");
    expect(explainToken("hard", { kind: "index", value: -1, when: "atOrBelow" }))
      .toBe("The chart prints -1-: the deviation applies at true count -1 and below.");
  });

  it("uses the chart's running-count wording for the zero indexes", () => {
    expect(explainToken("hard", { kind: "index", value: 0, when: "atOrBelow" }))
      .toBe("The chart prints 0-: the deviation applies at any negative running count.");
    expect(explainToken("hard", { kind: "index", value: 0, when: "atOrAbove" }))
      .toBe("The chart prints 0+: the deviation applies at any positive running count.");
  });
});

describe("sectionLegend", () => {
  it("lists each section's keys with what they produce and what it means", () => {
    expect(sectionLegend("pairs")).toEqual([
      { keys: ["Y"], combo: false, shows: "Y", meaning: "split the pair" },
      { keys: ["N"], combo: false, shows: "N", meaning: "do not split the pair" },
      { keys: ["Shift", "Y"], combo: true, shows: "Y/N", meaning: "split only if double after split is offered" },
    ]);
    expect(sectionLegend("soft")).toEqual([
      { keys: ["H"], combo: false, shows: "H", meaning: "hit" },
      { keys: ["S"], combo: false, shows: "S", meaning: "stand" },
      { keys: ["D"], combo: false, shows: "D", meaning: "double if allowed, otherwise hit" },
      { keys: ["Shift", "D"], combo: true, shows: "Ds", meaning: "double if allowed, otherwise stand" },
    ]);
    expect(sectionLegend("hard")).toEqual([
      { keys: ["H"], combo: false, shows: "H", meaning: "hit" },
      { keys: ["S"], combo: false, shows: "S", meaning: "stand" },
      { keys: ["D"], combo: false, shows: "D", meaning: "double if allowed, otherwise hit" },
    ]);
    expect(sectionLegend("surrender")).toEqual([
      { keys: ["R"], combo: false, shows: "SUR", meaning: "surrender" },
      { keys: ["N"], combo: false, shows: "N", meaning: "don't surrender" },
    ]);
  });

  it("stays in step with the grammar", () => {
    // Every legend entry must be typable: feeding its key (with Shift for a
    // combo entry) into an empty buffer has to commit and parse back to what
    // the legend promises.
    for (const section of ["pairs", "soft", "hard", "surrender"] as const) {
      for (const entry of sectionLegend(section)) {
        const trigger = (entry.combo ? entry.keys[1] : entry.keys[0]).toLowerCase();
        const result = feedKey(section, "", trigger, entry.combo);
        expect(result.disposition, `${section} ${entry.keys.join("+")}`).toBe("commit");
        expect(formatToken(parseEntry(section, result.buffer)!), `${section} ${entry.keys.join("+")}`).toBe(entry.shows);
      }
    }
  });
});
