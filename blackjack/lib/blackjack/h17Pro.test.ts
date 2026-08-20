import { describe, expect, it } from "vitest";
import {
  applyH17Deviation,
  H17_PRO_DEVIATIONS,
} from "./h17Pro";
import { resolveDeviation } from "./deviations";

const h17LateSurrender = { dealerHitsSoft17: true, lateSurrender: true };

describe("H17 Pro table", () => {
  it("contains all 34 supplied decisions and key boundaries", () => {
    expect(H17_PRO_DEVIATIONS).toHaveLength(34);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "Insurance")?.index).toBe(3);
    expect(H17_PRO_DEVIATIONS.find((row) => row.hand === "10,10" && row.dealer === "4")?.index).toBe(7);
    expect(H17_PRO_DEVIATIONS.filter((row) => row.always)).toHaveLength(5);
  });

  it("lets starred stand indices replace a late-surrender basic play", () => {
    const sixteenVsTen = H17_PRO_DEVIATIONS.find((row) => row.hand === "16" && row.dealer === "10" && row.deviationAction === "S")!;
    const fifteenVsTen = H17_PRO_DEVIATIONS.find((row) => row.hand === "15" && row.dealer === "10" && row.deviationAction === "S")!;
    expect(applyH17Deviation(sixteenVsTen, "R", 0, h17LateSurrender)).toBe("S");
    expect(applyH17Deviation(fifteenVsTen, "R", 3, h17LateSurrender)).toBe("R");
    expect(applyH17Deviation(fifteenVsTen, "R", 4, h17LateSurrender)).toBe("S");
  });

  it("uses threshold surrender only for an H17 game offering late surrender", () => {
    const fourteenVsTen = H17_PRO_DEVIATIONS.find((row) => row.hand === "14" && row.dealer === "10")!;
    expect(applyH17Deviation(fourteenVsTen, "H", 3, h17LateSurrender)).toBe("R");
    expect(applyH17Deviation(fourteenVsTen, "H", 3, { dealerHitsSoft17: true, lateSurrender: false })).toBe("H");
    expect(applyH17Deviation(fourteenVsTen, "H", 3, { dealerHitsSoft17: false, lateSurrender: true })).toBe("H");
  });

  it("plays two-sided cells on both sides of their index", () => {
    // Basic strategy already makes these plays at TC 0, so the index is where
    // the chart reverts rather than where it departs.
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "13", "2", -1, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "4", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "4", 0, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "12", "5", -3, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("S", "12", "5", -2, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("D", "11", "A", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("D", "11", "A", -1, h17LateSurrender).action).toBe("D");
    expect(resolveDeviation("S", "13", "2", -2, h17LateSurrender).belowIndex).toBe(true);
  });

  it("leaves one-sided cells and S17 tables untouched", () => {
    expect(resolveDeviation("H", "12", "2", 0, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "12", "2", 3, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("R", "16", "A", 2, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "16", "A", 3, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("S", "13", "2", -4, { dealerHitsSoft17: false, lateSurrender: true }).action).toBe("S");
  });

  it("resolves overlapping surrender and stand cells by chart precedence", () => {
    expect(resolveDeviation("R", "16", "9", -2, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("H", "16", "9", -1, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("H", "16", "9", 5, h17LateSurrender).action).toBe("S");
    expect(resolveDeviation("R", "15", "10", -1, h17LateSurrender).action).toBe("H");
    expect(resolveDeviation("R", "15", "10", 0, h17LateSurrender).action).toBe("R");
    expect(resolveDeviation("R", "15", "10", 4, h17LateSurrender).action).toBe("S");
  });
});
