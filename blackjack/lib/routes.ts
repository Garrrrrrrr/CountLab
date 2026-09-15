/**
 * Paths that used to render the Game & Bankroll Lab under their own name. They
 * still resolve, so old bookmarks keep working, but they redirect rather than
 * serving a third copy of the same page — and they stay out of the sitemap so
 * search engines are not offered the same content at three URLs.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  analysis: "/cvcx",
  bankroll: "/cvcx",
  "reference/basic-strategy": "/reference",
  // The timed true-count benchmark this path used to serve is now the
  // "Quick True Count" preset of the configurable test-out exam.
  "training/proficiency-test": "/training/test-out",
};

/** Every statically-generated route, as slug segments. Shared by the catch-all
 * page's generateStaticParams and by app/sitemap.ts, so they can't drift. */
export const ROUTES: string[][] = [
  [],
  ["dashboard"],
  ["signin"],
  ["practice"],
  ["analyze"],
  ["play"],
  ["cvcx"],
  ["simulation"],
  ["journal"],
  ["compare"],
  ["trip-planner"],
  ["bet-spread-recommender"],
  ["double-down-madness"],
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
  ["training", "test-out"],
  ["reference"],
  ["reference", "deviations"],
  ["reference", "h17-chart"],
  ["statistics"],
  ["settings"],
  ["terms"],
  ["privacy"],
  ["admin"],
  ...Object.keys(LEGACY_REDIRECTS).map((route) => route.split("/")),
];

export type Destination = readonly [name: string, href: string, icon: string, area: "Practice" | "Analyze" | "Games" | "Reference" | "Utility"];
export const TOOL_ROUTES: readonly Destination[] = [
  ["Full Shoe", "/training/full-shoe", "fa-shoe-prints", "Practice"], ["Daily Checklist", "/training/checklist", "fa-list-check", "Practice"], ["Running Count", "/training/running-count", "fa-bolt", "Practice"], ["True Count", "/training/true-count", "fa-divide", "Practice"], ["Basic Strategy", "/training/basic-strategy", "fa-layer-group", "Practice"], ["Deviations", "/training/deviations", "fa-code-branch", "Practice"], ["H17 Chart", "/training/h17-chart", "fa-table-cells", "Practice"], ["Deck Estimation", "/training/deck-estimation", "fa-ruler", "Practice"], ["Counting Benchmark", "/training/benchmark", "fa-medal", "Practice"], ["Test Out", "/training/test-out", "fa-award", "Practice"],
  ["Game & Bankroll Lab", "/cvcx", "fa-chart-area", "Analyze"], ["Bet Spread Recommender", "/bet-spread-recommender", "fa-layer-group", "Analyze"], ["Session Simulator", "/simulation", "fa-wave-square", "Analyze"], ["Session Journal", "/journal", "fa-book", "Analyze"], ["Compare Scenarios", "/compare", "fa-code-compare", "Analyze"], ["Trip Planner", "/trip-planner", "fa-plane-departure", "Analyze"],
  ["Double Down Madness", "/double-down-madness", "fa-bolt", "Games"], ["Ultimate Texas Hold'em", "/ultimate-texas-holdem", "fa-clover", "Games"], ["Chase the Flush", "/chase-flush", "fa-diamond", "Games"],
  ["Strategy charts", "/reference", "fa-table-cells", "Reference"],
  ["Dashboard", "/dashboard", "fa-house", "Utility"], ["Statistics", "/statistics", "fa-chart-line", "Utility"], ["Settings", "/settings", "fa-gear", "Utility"],
];

export const ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/": "Practice blackjack counting, learn the right decisions, and explore bankroll risk with free interactive tools.",
  "/cvcx": "Build a table profile and bet ramp, then compare expected return, bankroll requirements, and risk.",
  "/bet-spread-recommender": "Compare candidate spreads for your bankroll and preferred risk level.",
  "/simulation": "Stress-test a saved game through reproducible simulations and inspect possible outcomes.",
  "/journal": "Record sessions and transactions, then compare actual results with your expected performance.",
  "/compare": "Compare games and bet ramps side by side to understand which assumptions change the result.",
  "/trip-planner": "Choose a bankroll and estimate the range of outcomes over your next trip.",
  "/practice": "Start with running count, learn strategy, and combine your skills in a full shoe.",
  "/analyze": "Build a game, test its variance, compare alternatives, and plan a trip.",
  "/play": "Practice Double Down Madness, Ultimate Texas Hold'em, and Chase the Flush.",
  "/double-down-madness": "Practice one-card blackjack, repeated doubles, and composition-dependent decisions through a full shoe.",
  "/ultimate-texas-holdem": "Learn when to raise, check, or fold, and compare standard play with exposed-card analysis.",
  "/chase-flush": "Practice flush decisions across three betting stages and analyze the value of one exposed dealer card.",
  "/reference": "Interactive basic strategy and index deviation charts with explicit table rules.",
};
export function routeInfo(path: string) {
  const title = TOOL_ROUTES.find((entry) => entry[1] === path)?.[0] ?? ({ "/": "Blackjack practice and analysis", "/signin": "Sign in", "/practice": "Practice", "/analyze": "Analyze", "/play": "Games", "/terms": "Terms of Service", "/privacy": "Privacy Policy", "/admin": "Product analytics", "/reference/deviations": "Index deviation chart", "/reference/h17-chart": "H17 deviation chart" } as Record<string, string>)[path] ?? path.split("/").filter(Boolean).join(" \u00b7 ");
  return { title, description: ROUTE_DESCRIPTIONS[path] ?? `${title}: interactive blackjack practice and analysis in CountLab.` };
}
export const isPublicRoute = (path: string) => ["/", "/practice", "/analyze", "/play", "/terms", "/privacy"].includes(path) || path === "/reference" || path.startsWith("/reference/");
