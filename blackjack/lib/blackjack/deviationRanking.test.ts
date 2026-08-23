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
  it("covers every row of both catalogs in every profile, and nothing else", () => {
    // Both directions matter. A missing key is an unmeasured row; a leftover key
    // is an artifact generated against a different catalog, which is how a stale
    // regeneration slips through — under the old positional ids it did, and every
    // row quietly read its neighbour's numbers instead of failing here.
    for (const [profile, catalog] of PROFILES) {
      expect(Object.keys(DEVIATION_RANKING[profile]).sort(), profile).toEqual(catalog.map((row) => row.id).sort());
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
   * The H17 chart cells that cost money in a game offering surrender, taught as
   * printed rather than quietly corrected.
   *
   * 15 v 10 and 16 v 9: the chart surrenders them at the *bottom* of the count
   * and plays the hand above, where basic strategy surrenders at every count.
   * 15 v 10 costs about 0.16 units per 100 rounds that way, because it hits a
   * 15 versus a ten at +1 to +3 with a raised bet out. Their stand cells price
   * negative for a second reason: each row is measured standalone against basic
   * strategy, so the stand is scored against a surrender the chart has closed.
   *
   * 17 v A: the chart's unconditional surrender, and a genuinely marginal play
   * — worth -0.002 ± 0.001 per 100 rounds against standing. It measured
   * negative before this catalog was rebuilt too, and only cleared the interval
   * check by a hair; the tighter run resolves it as a small real loss.
   */
  const CHART_COSTS_MONEY = (row: (typeof H17_PRO_DEVIATIONS)[number], profile: DeviationRankingProfile) =>
    profile === "h17-ls" && [["15", "10"], ["16", "9"], ["17", "A"]].some(([hand, dealer]) => row.hand === hand && row.dealer === dealer);

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

  it("keeps the loss-making cells to the ones the exemption names", () => {
    // The exemption must not quietly widen: if one of these turns positive, or
    // a rewrite makes another row negative, this fails and the exemption gets
    // re-examined rather than inherited.
    for (const [profile, catalog] of PROFILES) {
      const negative = catalog
        .filter((row) => DEVIATION_RANKING[profile][row.id][0] < 0)
        .map((row) => `${row.hand} v ${row.dealer} ${row.deviationAction}`)
        .sort();
      expect(negative, profile).toEqual(profile === "h17-ls"
        ? ["15 v 10 R", "15 v 10 S", "16 v 9 R", "16 v 9 S", "17 v A R"]
        : []);
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
