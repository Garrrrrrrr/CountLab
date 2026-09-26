import { describe, expect, it } from "vitest";
import { linkedCellKey, referenceHref } from "./referenceLinks";

describe("referenceHref", () => {
  it("names one cell with encoded parameters", () => {
    expect(referenceHref("strategy", { section: "soft", hand: "A,8", dealer: "10" })).toBe("/reference/?section=soft&hand=A%2C8&dealer=10");
    expect(referenceHref("deviations", { section: "hard", hand: "16", dealer: "10" })).toBe("/reference/deviations/?section=hard&hand=16&dealer=10");
    expect(referenceHref("h17", { section: "pairs", hand: "T,T", dealer: "A" })).toBe("/reference/h17-chart/?section=pairs&hand=T%2CT&dealer=A");
  });

  it("falls back to the bare chart path without a cell", () => {
    expect(referenceHref("strategy")).toBe("/reference");
    expect(referenceHref("deviations", null)).toBe("/reference/deviations");
    expect(referenceHref("h17")).toBe("/reference/h17-chart");
  });
});

describe("linkedCellKey", () => {
  it("reads back the cell a link names, in the charts' key format", () => {
    expect(linkedCellKey(new URL(referenceHref("strategy", { section: "soft", hand: "A,8", dealer: "10" }), "https://x.test").search)).toBe("soft:A,8v10");
    expect(linkedCellKey("?section=surrender&hand=15&dealer=A")).toBe("surrender:15vA");
  });

  it("names no cell when a parameter is missing or blank", () => {
    expect(linkedCellKey("")).toBeNull();
    expect(linkedCellKey("?section=hard&hand=16")).toBeNull();
    expect(linkedCellKey("?section=hard&hand=&dealer=10")).toBeNull();
  });
});
