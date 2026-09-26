/**
 * Links from a drill to the chart cell a question was about.
 *
 * The reference pages open on their own tab from the bare path; the `section`,
 * `hand` and `dealer` parameters additionally name one cell for the page to
 * highlight. Row labels are the charts' own (`16`, `A,8`, `T,T`, `8,8`), so the
 * values are encoded with URLSearchParams: a comma is `%2C`. The strategy and
 * deviation charts open that cell's explanation; any other page still lands on
 * the right chart.
 */
export type ReferenceChart = "strategy" | "deviations" | "h17";

export interface ChartCell {
  /** `pairs`, `soft`, `hard` or `surrender`. */
  section: string;
  /** The chart's row label. */
  hand: string;
  /** `2` to `10`, or `A`. */
  dealer: string;
}

const PATH: Record<ReferenceChart, string> = {
  strategy: "/reference",
  deviations: "/reference/deviations",
  h17: "/reference/h17-chart",
};

export function referenceHref(chart: ReferenceChart, cell?: ChartCell | null): string {
  if (!cell) return PATH[chart];
  const params = new URLSearchParams({ section: cell.section, hand: cell.hand, dealer: cell.dealer });
  return `${PATH[chart]}/?${params.toString()}`;
}

/** The chart cell key (`section:handvdealer`) a link names, or null when it names none. */
export function linkedCellKey(search: string): string | null {
  const params = new URLSearchParams(search);
  const [section, hand, dealer] = ["section", "hand", "dealer"].map((name) => params.get(name)?.trim());
  return section && hand && dealer ? `${section}:${hand}v${dealer}` : null;
}
