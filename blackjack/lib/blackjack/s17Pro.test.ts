import { describe, expect, it } from "vitest";
import { S17_PRO_DEVIATIONS } from "./s17Pro";
import { resolveDeviation } from "./deviations";

const s17LateSurrender = { dealerHitsSoft17: false, lateSurrender: true };

describe("S17 Pro table", () => {
  it("contains all 32 supplied decisions and key boundaries", () => {
    expect(S17_PRO_DEVIATIONS).toHaveLength(32);
    expect(S17_PRO_DEVIATIONS.find((row) => row.hand === "Insurance")?.index).toBe(3);
    expect(S17_PRO_DEVIATIONS.find((row) => row.hand === "10,10" && row.dealer === "6")?.index).toBe(5);
    expect(S17_PRO_DEVIATIONS.filter((row) => row.always)).toHaveLength(2);
  });

  it("adds the Soft 18 vs A and wider Soft 19 plays that only exist under S17", () => {
    expect(resolveDeviation("H", "Soft 18", "A", 0, s17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "Soft 18", "A", 1, s17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "Soft 19", "6", 0, s17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "Soft 19", "6", 1, s17LateSurrender).action).toBe("D");
  });

  it("plays two-sided cells on both sides of their index, inclusive at the index", () => {
    // 12 v 6 only carries an index under S17; H17's Pro chart plays it flat.
    expect(resolveDeviation("S", "12", "6", -2, s17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "6", -1, s17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "6", 0, s17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "4", 0, s17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 1, s17LateSurrender).action).toBe("S");
  });

  it("has no departure for hands the H17 Pro chart carries but S17 Pro does not", () => {
    // 13 v 2, 15 v A (always), 17 v A, and 8,8 v A are H17-only in the supplied charts.
    expect(resolveDeviation("S", "13", "2", -4, s17LateSurrender).action).toBe("S");
    expect(resolveDeviation("H", "17", "A", 5, s17LateSurrender).action).toBe("H");
  });

  it("surrenders 16 v 10 and 16 v A unconditionally, same as the H17 chart", () => {
    expect(resolveDeviation("R", "16", "10", -8, s17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "A", -8, s17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "A", -8, { dealerHitsSoft17: false, lateSurrender: false }).action).toBe("H");
  });

  it("resolves the overlapping 16 v 9 stand-vs-surrender cells, same mechanism as H17", () => {
    expect(resolveDeviation("R", "16", "9", -2, s17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "9", -1, s17LateSurrender).action).toBe("R");
    // Surrender holds above the stand index too: standing on 16 v 9 is worth
    // about -0.51 to -0.57 at every count, never the -0.50 of surrendering.
    expect(resolveDeviation("R", "16", "9", 5, s17LateSurrender).action).toBe("R");
    // Without surrender the starred stand index is the right play again.
    expect(resolveDeviation("H", "16", "9", 4, { dealerHitsSoft17: false, lateSurrender: false }).action).toBe("H");
    expect(resolveDeviation("H", "16", "9", 5, { dealerHitsSoft17: false, lateSurrender: false }).action).toBe("S");
  });

  it("is selected automatically for S17 tables and H17 Pro for H17 tables", () => {
    const h17 = resolveDeviation("H", "11", "A", 1, { dealerHitsSoft17: true, lateSurrender: true });
    const s17 = resolveDeviation("H", "11", "A", 1, { dealerHitsSoft17: false, lateSurrender: true });
    expect(h17.deviation?.index).toBe(-1);
    expect(s17.deviation?.index).toBe(1);
    expect(s17.action).toBe("D");
  });
});
