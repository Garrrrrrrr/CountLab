import { describe, expect, it } from "vitest";
import { H17_PRO_DEVIATIONS } from "./h17Pro";
import { S17_PRO_DEVIATIONS } from "./s17Pro";
import { deviationTransition } from "./deviations";
import { DEVIATION_RANKING, DEVIATION_RANKING_METADATA, DeviationRankingProfile } from "./deviationRanking";

const PROFILES: Array<[DeviationRankingProfile, typeof H17_PRO_DEVIATIONS, boolean, boolean]> = [
  ["h17-ls", H17_PRO_DEVIATIONS, true, true],
  ["h17-no-ls", H17_PRO_DEVIATIONS, true, false],
  ["s17-ls", S17_PRO_DEVIATIONS, false, true],
  ["s17-no-ls", S17_PRO_DEVIATIONS, false, false],
];

describe("deviation ranking artifact", () => {
  it("covers every row of both catalogs in every profile", () => {
    for (const [profile, catalog] of PROFILES) {
      for (const row of catalog) expect(DEVIATION_RANKING[profile][row.id], `${profile} ${row.id}`).toBeDefined();
    }
  });

  it("agrees with the resolver about which rows change a play", () => {
    // The reference table renders a transition from the resolver and an EV from
    // the artifact. If those two disagree a row shows a departure it never
    // makes, or shows "no effect" next to a nonzero EV.
    for (const [profile, catalog, dealerHitsSoft17, lateSurrender] of PROFILES) {
      for (const row of catalog) {
        const { changesPlay } = deviationTransition(row, { dealerHitsSoft17, lateSurrender });
        const [, , triggersPer100] = DEVIATION_RANKING[profile][row.id];
        expect(triggersPer100 > 0, `${profile} ${row.hand} v ${row.dealer}`).toBe(changesPlay);
      }
    }
  });

  /**
   * The H17 chart's own surrender cells for 15 v 10 and 16 v 9, which the app
   * teaches as printed: it surrenders them at the *bottom* of the count and
   * plays the hand above, where basic strategy surrenders at every count. As
   * printed, both lose money in a game that offers surrender — 15 v 10 by about
   * 0.17 units per 100 rounds, because it hits a 15 versus a ten at +1 to +3
   * with a raised bet out. Their stand cells price negative for a second
   * reason: each row is measured standalone against basic strategy, so the
   * stand is scored against a surrender the chart has already closed off.
   */
  const CHART_COSTS_MONEY = (row: (typeof H17_PRO_DEVIATIONS)[number], profile: DeviationRankingProfile) =>
    profile === "h17-ls" && ((row.hand === "15" && row.dealer === "10") || (row.hand === "16" && row.dealer === "9"));

  it("prices every live departure as a gain, within its own interval", () => {
    // A correct index catalog cannot contain a play that loses money against
    // basic strategy. The previous paired-session method returned negative
    // values for a third of the catalog, which is what flagged it as noise.
    for (const [profile, catalog] of PROFILES) {
      for (const row of catalog) {
        const [evPer100, standardError, triggersPer100] = DEVIATION_RANKING[profile][row.id];
        if (triggersPer100 === 0) {
          expect([evPer100, standardError], `${profile} ${row.id}`).toEqual([0, 0]);
          continue;
        }
        if (CHART_COSTS_MONEY(row, profile)) continue;
        expect(evPer100 + 3 * standardError, `${profile} ${row.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("still prices the chart's two loss-making cells as losses", () => {
    // The exemption above is for two named cells and must not quietly widen: if
    // one of them turns positive, or a rewrite makes another row negative, this
    // fails and the exemption gets re-examined rather than inherited.
    const negative = H17_PRO_DEVIATIONS.filter((row) => DEVIATION_RANKING["h17-ls"][row.id][0] < 0);
    expect(negative.map((row) => `${row.hand} v ${row.dealer} ${row.deviationAction}`).sort()).toEqual([
      "15 v 10 R", "15 v 10 S", "16 v 9 R", "16 v 9 S",
    ]);
  });

  it("resolves each play far more precisely than the spread it is ranking", () => {
    for (const [profile] of PROFILES) {
      const rows = Object.values(DEVIATION_RANKING[profile]);
      const widest = Math.max(...rows.map(([, standardError]) => 1.96 * standardError));
      const spread = Math.max(...rows.map(([ev]) => ev)) - Math.min(...rows.map(([ev]) => ev));
      expect(widest, profile).toBeLessThan(spread / 10);
    }
  });

  it("records the run that produced it", () => {
    expect(DEVIATION_RANKING_METADATA.rounds).toBeGreaterThanOrEqual(10_000_000);
    expect(DEVIATION_RANKING_METADATA.replications).toBeGreaterThanOrEqual(100);
    expect(DEVIATION_RANKING_METADATA.ramp).toBe("1-12");
  });
});
