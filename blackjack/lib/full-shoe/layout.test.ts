import { describe, expect, it } from "vitest";
import { pickCardSizes, rowWidth } from "./layout";

describe("felt card sizes", () => {
  it("gives a lone hand the biggest cards a 390×844 phone can hold", () => {
    expect(pickCardSizes({ width: 358, height: 590, dealerCards: 2, seats: [[2]], reserve: 72 })).toEqual({ dealer: "xl", player: "xl", overflow: false });
  });

  it("shrinks to fit a short 320×568 felt", () => {
    const layout = pickCardSizes({ width: 288, height: 270, dealerCards: 2, seats: [[2]], reserve: 60 });
    expect(layout.overflow).toBe(false);
    expect(["md", "sm"]).toContain(layout.player);
  });

  it("makes four split hands smaller and keeps them on the felt", () => {
    const four = [[3, 2, 2, 2]];
    const layout = pickCardSizes({ width: 358, height: 590, dealerCards: 2, seats: four, reserve: 72 });
    expect(layout.overflow).toBe(false);
    expect(rowWidth(layout.player, four)).toBeLessThanOrEqual(358);
    expect(["md", "sm"]).toContain(layout.player);
  });

  it("drops only the dealer's cards a size when the dealer draws a long hand", () => {
    const layout = pickCardSizes({ width: 358, height: 590, dealerCards: 6, seats: [[2]], reserve: 72 });
    expect(layout.player).toBe("xl");
    expect(layout.dealer).not.toBe("xl");
  });

  it("reports overflow when even the smallest cards cannot fit the row", () => {
    expect(pickCardSizes({ width: 200, height: 400, dealerCards: 2, seats: [[4, 4], [4, 4], [4, 4]] }).overflow).toBe(true);
  });
});
