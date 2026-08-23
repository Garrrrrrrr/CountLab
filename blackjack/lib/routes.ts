/**
 * Paths that used to render the Game & Bankroll Lab under their own name. They
 * still resolve, so old bookmarks keep working, but they redirect rather than
 * serving a third copy of the same page — and they stay out of the sitemap so
 * search engines are not offered the same content at three URLs.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  analysis: "/cvcx",
  bankroll: "/cvcx",
};

/** Every statically-generated route, as slug segments. Shared by the catch-all
 * page's generateStaticParams and by app/sitemap.ts, so they can't drift. */
export const ROUTES: string[][] = [
  [],
  ["dashboard"],
  ["cvcx"],
  ["simulation"],
  ["journal"],
  ["compare"],
  ["trip-planner"],
  ["bet-spread-recommender"],
  ["chase-flush"],
  ["ultimate-texas-holdem"],
  ["training", "checklist"],
  ["training", "running-count"],
  ["training", "true-count"],
  ["training", "basic-strategy"],
  ["training", "deviations"],
  ["training", "h17-chart"],
  ["training", "full-shoe"],
  ["training", "deck-estimation"],
  ["training", "benchmark"],
  ["training", "proficiency-test"],
  ["reference"],
  ["reference", "basic-strategy"],
  ["reference", "deviations"],
  ["statistics"],
  ["settings"],
  ["terms"],
  ["privacy"],
  ["admin"],
  ...Object.keys(LEGACY_REDIRECTS).map((route) => [route]),
];
