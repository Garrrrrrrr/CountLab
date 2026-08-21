import { describe, expect, it } from "vitest";
import { H17_PRO_DEVIATIONS } from "./apToolboxH17Pro";
import { resolveDeviation } from "./deviations";

const h17LateSurrender = { dealerHitsSoft17: true, lateSurrender: true };
const h17NoSurrender = { dealerHitsSoft17: true, lateSurrender: false };

describe("AP Toolbox H17 Pro table", () => {
  it("contains all 34 supplied decisions and key boundaries", () => {
    expect(H17_PRO_DEVIATIONS).toHaveLength(34);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "Insurance")?.index).toBe(3);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "10,10" && row.dealer === "4")?.index).toBe(7);
    expect(H17_PRO_DEVIATIONS.filter((row) => row.always)).toHaveLength(5);
  });

  it("applies starred stand indices only where surrender is unavailable", () => {
    // Standing on 15/16 versus a ten is worth about -0.53 to -0.58 at every
    // true count, so it never beats surrender's flat -0.50. The star is honoured
    // where the table (or the split hand) offers no surrender, and ignored where
    // it does. See the note on `overridesSurrender` and priceCell in deviationEv.
    expect(resolveDeviation("R", "16", "10", 0, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "10", 4, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "10", -1, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "10", 0, h17NoSurrender).action).toBe("S");
    expect(resolveDeviation("H", "15", "10", 3, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "15", "10", 4, h17NoSurrender).action).toBe("S");
  });

  it("uses threshold surrender only for an H17 game offering late surrender", () => {
    expect(resolveDeviation("H", "14", "10", 2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "14", "10", 3, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "14", "10", 3, h17NoSurrender).action).toBe("H");
    // The S17 chart carries the same 14 v 10 surrender index, and resolveDeviation
    // picks the chart matching the dealer rule when no catalog is supplied.
    expect(resolveDeviation("H", "14", "10", 2, { dealerHitsSoft17: false, lateSurrender: true }).action).toBe("H");
    expect(resolveDeviation("H", "14", "10", 3, { dealerHitsSoft17: false, lateSurrender: true }).action).toBe("R");
  });

  it("plays two-sided cells on both sides of their index, inclusive at the index", () => {
    // Basic strategy already makes these plays at TC 0, so the index is where
    // the chart reverts rather than where it departs. The chart prints these
    // as e.g. "-1-": the reverted play holds at that count too, not just below it.
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "13", "2", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "13", "2", 0, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "4", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 1, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "5", -3, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "5", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "5", -1, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("D", "11", "A", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("D", "11", "A", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("D", "11", "A", 0, h17LateSurrender).action).toBe("D");
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).belowIndex).toBe(true);
  });

  it("leaves one-sided cells and S17 tables untouched", () => {
    expect(resolveDeviation("H", "12", "2", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "12", "2", 3, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("R", "16", "A", 2, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "A", 3, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "A", 3, h17NoSurrender).action).toBe("S");
    expect(resolveDeviation("S", "13", "2", -4, { dealerHitsSoft17: false, lateSurrender: true }).action).toBe("S");
  });

  it("resolves overlapping surrender and stand cells", () => {
    // Below its surrender index the chart hits, which beats surrendering by
    // about a point of EV; at and above it, surrender holds at every count.
    expect(resolveDeviation("R", "16", "9", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "9", -1, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "9", 5, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "15", "10", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("R", "15", "10", 0, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "15", "10", 4, h17LateSurrender).action).toBe("R");
    // With no surrender the same two cells fall back to the hit/stand indices.
    expect(resolveDeviation("H", "16", "9", 4, h17NoSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "9", 5, h17NoSurrender).action).toBe("S");
  });
});
