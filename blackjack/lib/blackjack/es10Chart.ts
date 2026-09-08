import { BJA_H17_SECTIONS, section } from "./bjaH17Chart";
import type { ChartSection } from "./bjaH17Chart";

export type ChartSurrenderRule = "late" | "early10";

export const CHART_SURRENDER_LABEL: Record<ChartSurrenderRule, string> = {
  late: "Late surrender",
  early10: "Early surrender vs 10",
};

/**
 * The H17 chart's surrender table for a game dealing early surrender against a
 * ten and late surrender everywhere else.
 *
 * Only the ten column moves. Where the dealer cannot hold a natural the two
 * rules are the same decision, so the 8, 9 and ace columns are the Blackjack
 * Apprenticeship chart exactly as printed, copied across unchanged.
 *
 * PROVENANCE, which is mixed and deliberately so:
 *
 *  - 8, 9 and A columns: Blackjack Apprenticeship H17 chart (2018), as printed.
 *  - 10 column: Stanford Wong, Professional Blackjack, table 32 (p. 91).
 *  - 8,8 v 9 `7+`: Wong table 33. The BJA chart omits every 8,8 surrender; this
 *    variant fills the row in, because under this rule 8,8 v 10 is a decision
 *    you make every shoe and a row with one cell in it reads as an error.
 *  - 8,8 v A `SUR`: this app's own strategy grid and the published H17 charts
 *    surrender it; Wong's table 33 leaves it blank. Printed as a surrender so
 *    that the chart drill and the strategy chart cannot teach opposite things
 *    about the same cell — `es10Chart.test.ts` resolves it through the shared
 *    catalog and would fail on `N`.
 *
 * CONVENTION. The chart prints the count at which the play departs from the
 * cell's basic-strategy background, so a cell this rule already surrenders
 * prints the *low* count at which you stop surrendering and play the hand out.
 * That is Wong's index minus one: his 16 v 10 of `-5` ("surrender at -5 or
 * above") is printed here as `-6-` ("play it out at -6 or below"). The chart
 * itself contains a worked example of the same translation under late
 * surrender — it prints 16 v 9 as `-1-` where Wong's table 33 gives that cell
 * `0`.
 *
 * Because that translation is where an error would hide, it is not asserted:
 * `es10Chart.test.ts` resolves every ten-column cell through the shared
 * `earlySurrender.ts` catalog at its index and one either side, so the chart
 * drill and the play drill cannot drift apart.
 *
 * Rows run further than the late-surrender table's. Hard 13 and 12 have no
 * late-surrender entry on this chart at all, but surrender against a ten at
 * `3+` and `8+` once the dealer's natural is on the table.
 */
const ES10_SURRENDER = section("surrender", "Early surrender vs 10", `
  17   N  N  N  N  N  N  N   N    5+   SUR
  16   N  N  N  N  N  N  4+  -1-  -6-  SUR
  15   N  N  N  N  N  N  N   2+   -3-  -1+
  14   N  N  N  N  N  N  N   N   -1-   N
  13   N  N  N  N  N  N  N   N    3+   N
  12   N  N  N  N  N  N  N   N    8+   N
  8,8  N  N  N  N  N  N  N   7+   -3-  SUR
`);

/**
 * The pair, soft and hard tables are shared with the printed chart.
 *
 * Early surrender against a ten does not move a hit, stand, double or split
 * decision: it only takes hands off the table earlier. The hard table's starred
 * stand indices on 16 and 15 v 10 stay printed for the same reason they do
 * under late surrender — they are the answer wherever the surrender is refused.
 */
export const ES10_H17_SECTIONS: readonly ChartSection[] = BJA_H17_SECTIONS.map((chartSection) =>
  chartSection.id === "surrender" ? ES10_SURRENDER : chartSection);

export const chartSections = (rule: ChartSurrenderRule): readonly ChartSection[] =>
  rule === "early10" ? ES10_H17_SECTIONS : BJA_H17_SECTIONS;
