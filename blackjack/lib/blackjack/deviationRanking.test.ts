import { describe, expect, it } from "vitest";
import { H17_PRO_DEVIATIONS } from "./apToolboxH17Pro";
import { S17_PRO_DEVIATIONS } from "./apToolboxS17Pro";
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

  it("prices every live departure as a gain, within its own interval", () => {
    // A correct index catalog cannot contain a play that loses money against
    // basic strategy. The previous paired-session method returned negative
    // values for a third of the catalog, which is what flagged it as noise.
    for (const [profile] of PROFILES) {
      for (const [id, [evPer100, standardError, triggersPer100]] of Object.entries(DEVIATION_RANKING[profile])) {
        if (triggersPer100 === 0) {
          expect([evPer100, standardError], `${profile} ${id}`).toEqual([0, 0]);
          continue;
        }
        expect(evPer100 + 3 * standardError, `${profile} ${id}`).toBeGreaterThan(0);
      }
    }
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
