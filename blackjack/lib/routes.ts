/**
 * The site map. Navigation, page titles, descriptions, the sitemap and the
 * redirects for old URLs all read from here, so they cannot drift apart.
 */

export type Drill = {
  slug: string;
  href: string;
  name: string;
  short: string;
  blurb: string;
  skill: "count" | "play" | "combined";
  /** Shows a discard-tray photo, so the hub can say so. */
  usesTrayPhotos?: boolean;
};

export const DRILLS: readonly Drill[] = [
  { slug: "running-count", href: "/train/running-count", name: "Running Count", short: "Running count", blurb: "Keep the Hi-Lo count through single cards, pairs and full rounds at the speed you choose.", skill: "count" },
  { slug: "deck-estimation", href: "/train/deck-estimation", name: "Deck Estimation", short: "Deck estimation", blurb: "Read real photos of the discard tray and estimate the decks left in the shoe.", skill: "count", usesTrayPhotos: true },
  { slug: "true-count", href: "/train/true-count", name: "True Count", short: "True count", blurb: "Divide the running count by the decks left, estimating them from a tray photo or given outright.", skill: "count", usesTrayPhotos: true },
  { slug: "basic-strategy", href: "/train/basic-strategy", name: "Basic Strategy", short: "Basic strategy", blurb: "Every hard, soft, pair and surrender decision for your table rules until it is automatic.", skill: "play" },
  { slug: "deviations", href: "/train/deviations", name: "Index Plays", short: "Index plays", blurb: "Learn exactly when the true count changes the play, on both sides of every index.", skill: "play" },
  { slug: "chart-recall", href: "/train/chart-recall", name: "Chart Recall", short: "Chart recall", blurb: "Fill in the whole chart from memory, indices included, one cell at a time.", skill: "play" },
  { slug: "bet-ramp", href: "/train/bet-ramp", name: "Bet Ramp", short: "Bet ramp", blurb: "From the true count to the bet on your own ramp, including when to leave the table.", skill: "count" },
  { slug: "full-shoe", href: "/train/full-shoe", name: "Full Shoe", short: "Full shoe", blurb: "Count, bet and play a whole shoe at a live table, with a coach or as a silent graded checkout.", skill: "combined", usesTrayPhotos: true },
];

export type NavItem = { href: string; name: string; short: string; icon: "train" | "charts" | "calculator" | "journal" | "progress" | "settings" };

/** The five destinations on the phone tab bar and at the top of the desktop sidebar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/train", name: "Train", short: "Train", icon: "train" },
  { href: "/charts", name: "Charts", short: "Charts", icon: "charts" },
  { href: "/calculator", name: "Calculator", short: "Calc", icon: "calculator" },
  { href: "/journal", name: "Journal", short: "Journal", icon: "journal" },
  { href: "/progress", name: "Progress", short: "Progress", icon: "progress" },
];

type PageInfo = { title: string; description: string; public?: boolean };

export const PAGES: Record<string, PageInfo> = {
  "/": { title: "Card counting trainer and blackjack charts", description: "Train Hi-Lo counting with real discard-tray photos, check accurate strategy and index charts for your exact rules, size your bankroll and log every session.", public: true },
  "/train": { title: "Train", description: "Counting, deck estimation, true count, strategy and index drills, and full-shoe practice with a graded checkout." },
  "/charts": { title: "Strategy charts", description: "Basic strategy and Hi-Lo index plays for your exact table rules: decks, H17 or S17, double after split, late or early surrender.", public: true },
  "/charts/indices": { title: "Index plays", description: "Every Hi-Lo index play for your table rules, ranked by how much it is worth, with the count where the play changes.", public: true },
  "/charts/pocket": { title: "Pocket chart", description: "Basic strategy and Wong's index numbers for your table rules on one card, to print or save to your phone.", public: true },
  "/calculator": { title: "Calculator", description: "Expected win, standard deviation, risk of ruin and bankroll needs for your game and bet ramp." },
  "/journal": { title: "Journal", description: "Log casino sessions and bankroll movements, then compare your results with what the game should pay." },
  "/progress": { title: "Progress", description: "Accuracy, speed and readiness across every drill, and what to practise next." },
  "/settings": { title: "Settings", description: "Theme, table rules, counting defaults, account, backups and privacy." },
  "/signin": { title: "Sign in", description: "Sign in to back up and sync your training, journal and settings across devices.", public: true },
  "/terms": { title: "Terms of Service", description: "The terms that apply when you use CountLab.", public: true },
  "/privacy": { title: "Privacy Policy", description: "What CountLab stores, what its privacy-minimized analytics record, and how to delete it.", public: true },
  "/admin": { title: "Product analytics", description: "Aggregate product analytics for administrators." },
  ...Object.fromEntries(DRILLS.map((drill) => [drill.href, { title: drill.name, description: drill.blurb }])),
};

/**
 * Old URLs and where they live now. Static hosting cannot answer with a 301,
 * so each of these is exported as a tiny page that replaces itself with the
 * new address, keeping the query string and hash (sign-in links carry tokens
 * in both).
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/dashboard": "/progress",
  "/statistics": "/progress",
  "/practice": "/train",
  "/training/checklist": "/train",
  "/training/benchmark": "/progress",
  "/training/test-out": "/train/full-shoe",
  "/training/proficiency-test": "/train/full-shoe",
  "/training/running-count": "/train/running-count",
  "/training/true-count": "/train/true-count",
  "/training/deck-estimation": "/train/deck-estimation",
  "/training/basic-strategy": "/train/basic-strategy",
  "/training/deviations": "/train/deviations",
  "/training/h17-chart": "/train/chart-recall",
  "/training/full-shoe": "/train/full-shoe",
  "/reference": "/charts",
  "/reference/basic-strategy": "/charts",
  "/reference/deviations": "/charts/indices",
  "/reference/h17-chart": "/charts",
  "/cvcx": "/calculator",
  "/analysis": "/calculator",
  "/bankroll": "/calculator",
  "/analyze": "/calculator",
  "/bet-spread-recommender": "/calculator",
  "/compare": "/calculator",
  "/trip-planner": "/calculator",
  "/simulation": "/calculator",
  "/play": "/train",
  "/double-down-madness": "/",
  "/ultimate-texas-holdem": "/",
  "/chase-flush": "/",
  "/directory": "/",
  "/admin/directory": "/admin",
};

/** GitHub Pages serves `/x/`, `/x` and `/x/index.html` from one file, so all three are one route. */
export const normalizePath = (pathname: string) => pathname.replace(/\/(index\.html)?$/, "") || "/";

export function pageInfo(path: string): PageInfo {
  return PAGES[normalizePath(path)] ?? { title: "CountLab", description: PAGES["/"].description };
}

/** Pages that work with nothing stored: no account wait, and indexed by search engines. */
export const isPublicPath = (path: string) => Boolean(PAGES[normalizePath(path)]?.public);

/** Which primary destination a path sits under, for the active tab. */
export function activeSection(path: string): NavItem | undefined {
  const normalized = normalizePath(path);
  return PRIMARY_NAV.find((item) => normalized === item.href || normalized.startsWith(`${item.href}/`));
}

export const drillBySlug = (slug: string) => DRILLS.find((drill) => drill.slug === slug);

/** Drill pages hide the tab bar while a session is running; this is their route prefix. */
export const isDrillPath = (path: string) => normalizePath(path).startsWith("/train/");
