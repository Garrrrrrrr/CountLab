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
  ["directory"],
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
  ["admin", "directory"],
  ...Object.keys(LEGACY_REDIRECTS).map((route) => route.split("/")),
];

export type Destination = readonly [name: string, href: string, icon: string, area: "Practice" | "Analyze" | "Games" | "Reference" | "Utility"];
export const TOOL_ROUTES: readonly Destination[] = [
  ["Full Shoe", "/training/full-shoe", "fa-shoe-prints", "Practice"], ["Daily Checklist", "/training/checklist", "fa-list-check", "Practice"], ["Running Count", "/training/running-count", "fa-bolt", "Practice"], ["True Count", "/training/true-count", "fa-divide", "Practice"], ["Basic Strategy", "/training/basic-strategy", "fa-layer-group", "Practice"], ["Deviations", "/training/deviations", "fa-code-branch", "Practice"], ["H17 Chart", "/training/h17-chart", "fa-table-cells", "Practice"], ["Deck Estimation", "/training/deck-estimation", "fa-ruler", "Practice"], ["Counting Benchmark", "/training/benchmark", "fa-medal", "Practice"], ["Test Out", "/training/test-out", "fa-award", "Practice"],
  ["Game & Bankroll Lab", "/cvcx", "fa-chart-area", "Analyze"], ["Game Directory", "/directory", "fa-map-location-dot", "Analyze"], ["Bet Spread Recommender", "/bet-spread-recommender", "fa-layer-group", "Analyze"], ["Session Simulator", "/simulation", "fa-wave-square", "Analyze"], ["Session Journal", "/journal", "fa-book", "Analyze"], ["Compare Scenarios", "/compare", "fa-code-compare", "Analyze"], ["Trip Planner", "/trip-planner", "fa-plane-departure", "Analyze"],
  ["Double Down Madness", "/double-down-madness", "fa-bolt", "Games"], ["Ultimate Texas Hold'em", "/ultimate-texas-holdem", "fa-clover", "Games"], ["Chase the Flush", "/chase-flush", "fa-diamond", "Games"],
  ["Strategy charts", "/reference", "fa-table-cells", "Reference"],
  ["Dashboard", "/dashboard", "fa-house", "Utility"], ["Statistics", "/statistics", "fa-chart-line", "Utility"], ["Settings", "/settings", "fa-gear", "Utility"],
];

export const ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/": "Practice blackjack counting, learn the right decisions, and explore bankroll risk with free interactive tools.",
  "/cvcx": "Build a table profile and bet ramp, then compare expected return, bankroll requirements, and risk.",
  "/directory": "Find published casino games by location, table limits, reported rules, and report date.",
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
  "/reference/deviations": "Hi-Lo index plays ranked by value, shown on the strategy grid for your table rules.",
  "/reference/h17-chart": "The complete H17 strategy chart with every index play marked in its cell.",
  "/dashboard": "Your training overview: streaks, accuracy, and the next skill to practice.",
  "/training/full-shoe": "Count, bet, and play a complete shoe with live coaching or a silent graded checkout.",
  "/training/checklist": "A focused daily routine across counting, strategy, and deviations.",
  "/training/running-count": "Keep the Hi-Lo running count through realistic card groups and interruptions.",
  "/training/true-count": "Convert running counts into true counts using the decks remaining.",
  "/training/basic-strategy": "Drill every hard, soft, pair, and surrender decision until it is automatic.",
  "/training/deviations": "Learn exactly when the true count changes the basic-strategy play.",
  "/training/h17-chart": "Recall the complete H17 chart cell by cell against the clock.",
  "/training/deck-estimation": "Estimate the decks in the discard tray before you divide.",
  "/training/benchmark": "Review counting speed and accuracy, then open the drill that needs work.",
  "/training/test-out": "A timed exam across every skill, scored section by section.",
  "/statistics": "Accuracy, speed, and trends across every drill you have completed.",
  "/settings": "Theme, table rules, counting defaults, privacy choices, and backups.",
  "/terms": "The terms that apply when you use CountLab.",
  "/privacy": "What CountLab stores, what its privacy-minimized analytics record, and how to delete it.",
};
export function routeInfo(path: string) {
  const title = TOOL_ROUTES.find((entry) => entry[1] === path)?.[0] ?? ({ "/": "Blackjack practice and analysis", "/signin": "Sign in", "/practice": "Practice", "/analyze": "Analyze", "/play": "Games", "/terms": "Terms of Service", "/privacy": "Privacy Policy", "/admin": "Product analytics", "/reference/deviations": "Index deviation chart", "/reference/h17-chart": "H17 deviation chart" } as Record<string, string>)[path] ?? path.split("/").filter(Boolean).join(" \u00b7 ");
  return { title, description: ROUTE_DESCRIPTIONS[path] ?? `${title}: interactive blackjack practice and analysis in CountLab.` };
}
/** True for any statically generated route, so unknown URLs can fall through to the 404 page. */
export const isKnownRoute = (path: string) => ROUTES.some((segments) => `/${segments.join("/")}` === path);
export const isPublicRoute = (path: string) => ["/", "/practice", "/analyze", "/directory", "/play", "/terms", "/privacy"].includes(path) || path === "/reference" || path.startsWith("/reference/");

/** The four top-level areas, in navigation order. */
export const AREAS = [
  { name: "Practice", href: "/practice", icon: "fa-bolt" },
  { name: "Analyze", href: "/analyze", icon: "fa-chart-area" },
  { name: "Games", href: "/play", icon: "fa-dice" },
  { name: "Reference", href: "/reference", icon: "fa-book-open" },
] as const;
export type AreaName = (typeof AREAS)[number]["name"];

/** The area a path belongs to, for breadcrumbs and active navigation. */
export function routeArea(path: string): (typeof AREAS)[number] | undefined {
  const direct = AREAS.find((area) => area.href === path);
  if (direct) return direct;
  if (path.startsWith("/reference/")) return AREAS[3];
  const tool = TOOL_ROUTES.find((entry) => entry[1] === path);
  return tool ? AREAS.find((area) => area.name === tool[3]) : undefined;
}

/** A compact page name for the app header; long SEO titles stay in metadata. */
export function headerTitle(path: string) {
  if (path === "/") return "Home";
  return routeInfo(path).title;
}

/**
 * Tool search ranks name matches ahead of description matches, so "trip"
 * lands on Trip Planner before any tool that merely mentions a trip.
 */
export function searchTools(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...TOOL_ROUTES];
  const scored = TOOL_ROUTES.map((entry) => {
    const [name, href, , area] = entry;
    const title = name.toLowerCase();
    const score = title.startsWith(needle) ? 0
      : title.split(/\s+/).some((word) => word.startsWith(needle)) ? 1
      : title.includes(needle) ? 2
      : `${area} ${href}`.toLowerCase().includes(needle) ? 3
      : (ROUTE_DESCRIPTIONS[href] ?? "").toLowerCase().includes(needle) ? 4
      : -1;
    return { entry, score };
  }).filter((result) => result.score >= 0);
  return scored.sort((a, b) => a.score - b.score).map((result) => result.entry);
}
