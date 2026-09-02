import { describe, expect, it } from "vitest";
import { BJA_H17_SECTIONS, CHART_DEALERS, cellKey } from "./bjaH17Chart";
import { STRATEGY_ROWS, STRATEGY_TABLES, deckClass } from "./strategyTables";
import { CHART_CODES, StrategySectionId, chartCell, chartCode } from "./strategyChart";

describe("strategy tables", () => {
  it("maps deck counts to their chart class", () => {
    expect(deckClass(1)).toBe("1");
    expect(deckClass(2)).toBe("2");
    for (const decks of [4, 6, 8]) expect(deckClass(decks)).toBe("4plus");
  });

  it("gives every grid a complete, well-formed cell for every row and dealer", () => {
    for (const [key, cells] of Object.entries(STRATEGY_TABLES)) {
      let counted = 0;
      for (const section of ["pairs", "soft", "hard"] as StrategySectionId[]) {
        for (const row of STRATEGY_ROWS[section]) {
          for (const dealer of CHART_DEALERS) {
            const code = cells.get(`${section}:${row}v${dealer}`);
            expect(code, `${key} ${section} ${row} v ${dealer}`).toBeDefined();
            expect(CHART_CODES).toContain(code!);
            counted += 1;
          }
        }
      }
      expect(cells.size, `${key} has stray cells`).toBe(counted);
      expect(counted).toBe(280);
    }
  });
});

describe("agreement with the audited BJA H17 transcription", () => {
  const rules = { decks: 6, dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const noDas = { ...rules, doubleAfterSplit: false };

  it("matches every non-index cell of the printed chart", () => {
    const mismatches: string[] = [];
    for (const section of BJA_H17_SECTIONS) {
      if (section.id === "surrender") continue; // handled by the Rh/Rs/Rp codes, not a separate grid
      for (const row of section.rows) {
        for (const dealer of CHART_DEALERS) {
          const token = section.cells.get(cellKey(section.id, row, dealer))!;
          if (token.kind === "index") continue; // an index cell's basic play is only knowable via deviationTransition — circular
          const ours = chartCell(rules, section.id === "pairs" ? "pairs" : section.id === "soft" ? "soft" : "hard", row, dealer);
          const label = `${section.id} ${row} v ${dealer}`;
          if (section.id === "pairs") {
            if (token.value === "Y" && ours.action !== "P") mismatches.push(`${label}: chart says split, table says ${ours.action}`);
            if (token.value === "Y/N" && ours.code !== "Ph") mismatches.push(`${label}: chart says DAS-only split, table code is ${ours.code}`);
            if (token.value === "N" && chartCell(noDas, "pairs", row, dealer).action === "P") mismatches.push(`${label}: chart says never split`);
          } else if (["H", "S", "D", "Ds"].includes(token.value)) {
            const expected = token.value === "Ds" ? "D" : token.value === "D" ? "D" : token.value;
            if (ours.action !== expected) mismatches.push(`${label}: chart says ${token.value}, table says ${ours.action}`);
          }
        }
      }
    }
    // 8,8 v A: the printed chart splits, this table surrenders. Correct for a
    // 4-8 deck H17 game that offers late surrender; the printed chart's own
    // surrender table simply has no pairs row to carry it.
    expect(mismatches).toEqual(["pairs 8,8 v A: chart says split, table says R"]);
  });
});

describe("deck-class differences", () => {
  const base = { dealerHitsSoft17: true, doubleAfterSplit: true, surrender: "late" as const, doubleRule: "any" as const, europeanNoHoleCard: false };
  const differences = (decks: number) => {
    const out: string[] = [];
    for (const section of ["pairs", "soft", "hard"] as const) {
      for (const row of STRATEGY_ROWS[section]) {
        for (const dealer of CHART_DEALERS) {
          const few = chartCode({ ...base, decks }, section, row, dealer);
          const many = chartCode({ ...base, decks: 6 }, section, row, dealer);
          if (few !== many) out.push(`${section}:${row}v${dealer} ${many}->${few}`);
        }
      }
    }
    return out;
  };

  it("lists the double-deck H17 departures from the 4-8 deck chart", () => {
    expect(differences(2)).toEqual([
      "pairs:7,7v8 H->Ph",
      "pairs:6,6v2 Ph->P",
      "pairs:6,6v7 H->Ph",
      "soft:A,7v2 Ds->S",
      "hard:17vA S->Rs",
      "hard:16v9 Rh->H",
      "hard:9v2 H->D",
    ]);
  });

  it("has more single-deck H17 departures than double deck", () => {
    expect(differences(1).length).toBeGreaterThan(differences(2).length);
  });
});
