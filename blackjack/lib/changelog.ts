/**
 * The update log at /changelog, newest first, written from the git history
 * for readers rather than developers. Screenshots live in public/changelog-shots/
 * and are retaken with `node scripts/changelog-shots.mjs` against a running export.
 */

export type ChangelogShot = { src: string; alt: string; caption: string; phone?: boolean };

export type ChangelogEntry = {
  id: string;
  /** ISO date of the last day the release covers; `from` when it spans several days. */
  date: string;
  from?: string;
  title: string;
  summary: string;
  tags: readonly ("new" | "improved" | "fixed" | "removed")[];
  shots?: readonly ChangelogShot[];
  groups: readonly { title: string; items: readonly string[] }[];
};

// The dates are calendar days, so format them in UTC to keep them from shifting a day west of Greenwich.
const day = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...options });

export function entryDate({ date, from }: Pick<ChangelogEntry, "date" | "from">) {
  if (!from) return day(date, { month: "long", day: "numeric", year: "numeric" });
  const sameMonth = from.slice(0, 7) === date.slice(0, 7);
  return `${day(from, { month: "long", day: "numeric" })}–${sameMonth ? day(date, { day: "numeric" }) : day(date, { month: "long", day: "numeric" })}, ${date.slice(0, 4)}`;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "2026-10-24-drills",
    date: "2026-10-24",
    title: "New drills and a full UI audit",
    summary: "A Bet Ramp drill, flash and distraction modes for Running Count, a whole-shoe benchmark, spaced review of missed strategy plays, and Full Shoe table limits, casino pace and back-counting.",
    tags: ["new", "improved", "fixed"],
    shots: [
      { src: "/changelog-shots/bet-ramp-phone.jpg", alt: "The Bet Ramp drill asking for the bet at a true count", caption: "Bet Ramp: the true count, your unit and ramp, and the bet you would put out.", phone: true },
      { src: "/changelog-shots/running-count-phone.jpg", alt: "Running Count setup with flash, shoe count-down and distraction options", caption: "Running Count's new flash and whole-shoe modes.", phone: true },
      { src: "/changelog-shots/full-shoe-phone.jpg", alt: "The Full Shoe practice table on a phone", caption: "Full Shoe now enforces table limits and can time each decision.", phone: true },
    ],
    groups: [
      {
        title: "New drills and modes",
        items: [
          "Bet Ramp: given a true count and your unit, put out the bet your ramp calls for, or leave the table where it sits out. It uses the ramp you last saved in the Calculator, or a 1–8 preset.",
          "Running Count Flash: two to six cards appear for under a second, then you give their net count.",
          "Running Count Distract me: every so often a quick sum or a word from the floor stops the cards, as it would at a real table.",
          "Shoe count-down: deal a whole 2-, 4- or 6-deck shoe at your own pace with one check at the end, and keep a best time per shoe size.",
          "Review due: missed plays in Basic Strategy, Index Plays and Chart Recall come back after 1, 3, 7 and 16 days, and the Train hub shows how many are due.",
          "Index Plays has quick sets for insurance alone and the Fab 4 surrenders.",
          "Deck Estimation can ask for decks played as well as decks left.",
          "Every drill summary can save its misses as a CSV, with your answer, the right one and why.",
        ],
      },
      {
        title: "Full Shoe",
        items: [
          "Bets must sit between the table minimum and maximum, and the dock says why Deal is off. The chip rack only offers chips that fit your unit.",
          "An optional time limit per decision, with a countdown; the report shows seconds per decision and hands per hour.",
          "Back-counting: watch while the other seats play, and every sit-in or leave is graded against your entry and exit counts.",
          "A cover note lists bets that more than doubled from one round to the next.",
          "Ending a shoe mid-round no longer grades the unfinished round, so the score and the mistakes list agree.",
        ],
      },
      {
        title: "Fixes from the audit",
        items: [
          "Phone controls, chart cells and text links all have 44px touch targets; strips that scroll sideways fade at the edge.",
          "Action pad labels scale so Surrender fits from 320px up, and nothing on the felt jumps when feedback appears.",
          "Running count misses name the kind of slip: a sign flip, off by one or two, or a count lost after a break.",
          "Number pads leave out keys the answer cannot use.",
          "Charts footnote the two cells where basic strategy and Wong never agree (two-deck 6,6 v 7 and no-hole-card 8,8 v 10).",
          "Backup and CSV file names use your local date, not tomorrow's in the evening.",
          "The 404 page has a proper title.",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-cvcx",
    date: "2026-10-24",
    title: "Optimal betting and goal-or-bust risk",
    summary: "The Calculator's suggested ramp now maximises SCORE the way CVCX does, and the trip outlook gives the chance of reaching a win goal before going broke.",
    tags: ["new", "improved"],
    shots: [{ src: "/changelog-shots/calculator.jpg", alt: "The Calculator with the game, bankroll and ramp cards beside the results", caption: "The Calculator on a desktop: the game, bankroll and ramp on the left, results on the right." }],
    groups: [
      {
        title: "Calculator",
        items: [
          "Optimal betting weights each count by its edge over its variance and picks the scale that gives the highest SCORE within your spread. On the default game a 1–8 ramp goes from 8.7 to 15.5 SCORE.",
          "Goal or bust: the chance of hitting a win goal before losing the bankroll, for the trip and with no time limit. The formula is checked against a simulated walk.",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-pocket",
    date: "2026-10-24",
    title: "Pocket chart",
    summary: "Basic strategy and Wong's index numbers for your rules on one card, to print on a 6×4 index card or save to your phone's photos.",
    tags: ["new"],
    shots: [{ src: "/changelog-shots/pocket-chart.jpg", alt: "The pocket chart with hard, soft, pair and surrender tables on one card", caption: "Every table on one card, drawn from the same data as the charts." }],
    groups: [
      {
        title: "Charts",
        items: [
          "One card with the hard, soft, pair and surrender tables plus insurance, drawn from the same cells as the charts page.",
          "Download chart on the charts page: on a phone it opens the share sheet so Save Image puts it in your photos; on a computer it downloads a PNG.",
          "Print only the Illustrious 18 and Fab 4 if you prefer a shorter card.",
          "Printing stays light even when your device is in dark mode.",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-wong",
    date: "2026-10-24",
    title: "Every index from Wong's Professional Blackjack",
    summary: "Every count-based play on the site now comes from Stanford Wong's High-Low tables, transcribed with the table and page for each number.",
    tags: ["improved", "fixed"],
    shots: [{ src: "/changelog-shots/charts-indices.jpg", alt: "The strategy chart in index view with Wong's numbers under each cell", caption: "The index view: basic strategy in each cell and Wong's number where the count changes the play." }],
    groups: [
      {
        title: "Index numbers",
        items: [
          "Hit, stand, double and split from Wong's appendix tables (one deck, and the four-deck tables for two to eight decks, as he directs), plus his two-card rows for unsplit pairs.",
          "Early and late surrender from tables 32 and 33, and the no-hole-card game from table 30.",
          "Insurance now depends on the deck count: +1.4 for one deck up to +3.1 for eight.",
          "This replaces the earlier mix of the BJA chart, the Illustrious 18 and Fab 4 values and simulated rows. A test checks the transcription against Wong's summary tables cell by cell.",
          "Where basic strategy surrenders a hand that Wong never surrenders (H17 17 v A and 8,8 v A), the chart says so.",
          "Single- and double-deck surrender cells have their own count thresholds.",
        ],
      },
    ],
  },
  {
    id: "2026-10-24-remake",
    date: "2026-10-24",
    title: "CountLab, rebuilt",
    summary: "A ground-up remake: a new design, five clear destinations, and one strategy engine behind the charts, drills and practice table.",
    tags: ["new", "improved", "fixed", "removed"],
    shots: [
      { src: "/changelog-shots/home.jpg", alt: "The CountLab home page with a count demo and the four tools", caption: "The new home page, with a ten-second count demo." },
      { src: "/changelog-shots/train-phone.jpg", alt: "The Train hub on a phone listing drills by skill", caption: "Train groups every drill by skill and suggests what to do next.", phone: true },
    ],
    groups: [
      {
        title: "Design and navigation",
        items: [
          "New light and dark themes, type and icons, with one set of buttons, sheets and controls everywhere.",
          "Five destinations: Train, Charts, Calculator, Journal and Progress, on a phone tab bar or a desktop sidebar. Drills hide the bar while you play.",
          "Every old address redirects to its new home, keeping sign-in links working.",
        ],
      },
      {
        title: "One strategy engine",
        items: [
          "Charts, drills and Full Shoe all read one decision engine, so they can never disagree.",
          "An exact finite-deck basic strategy calculator now holds every clear-cut cell for 180 rule sets.",
          "Fixed plays found in two audits, among them: 17 v A surrenders in 4–8 deck H17, single-deck H17 15 v A surrenders, double-deck S17 11 v A doubles, H17 soft 19 v 6 doubles at 0, and 5,5 and 7,7 v 10 follow their totals.",
        ],
      },
      {
        title: "Rebuilt tools",
        items: [
          "Charts for any rules (decks, H17 or S17, DAS, surrender, restricted doubling, no hole card) in basic, index and at-a-count views; tap a cell to see its play at every count. Rules can be shared in the address.",
          "The Calculator puts the game, bankroll and ramp beside live results, with a trip outlook, comparisons, Suggest a ramp, saved scenarios and venues, and a hand-off to the Journal.",
          "The Journal opens on an overview of results against expected value, with sheets for logging sessions, bankrolls, cash, venues and data.",
          "Full Shoe is a full-screen felt with the real discard-tray photo, up to five seats, coached and silent checkout modes, and a graded report with every round replayable.",
          "Running Count, True Count, Deck Estimation, Basic Strategy, Index Plays and Chart Recall were rebuilt on one drill kit.",
          "New Progress and Settings pages: 30-day stats, readiness targets and weak spots; settings save instantly, with backup and restore.",
          "Printable charts on two landscape pages.",
        ],
      },
      {
        title: "Retired",
        items: ["The side table games (Chase the Flush, Ultimate Texas Hold'em, Double Down Madness), the casino directory, the session simulator, the trip planner, Test Out and the daily checklist. Their addresses now lead to the closest tool."],
      },
    ],
  },
  {
    id: "2026-10-19-full-shoe-phones",
    date: "2026-10-19",
    title: "Full Shoe on phones",
    summary: "The practice table fits a phone without scrolling.",
    tags: ["improved"],
    groups: [
      {
        title: "Full Shoe",
        items: [
          "Phones show the real discard-tray photo on the felt instead of far below it.",
          "Chips, undo, clear and repeat sit in the dock beside Deal, so betting needs no scroll.",
          "Hit, Stand, Double, Split and Surrender fit on two rows and no longer cover the hand.",
        ],
      },
    ],
  },
  {
    id: "2026-09-26-revamp",
    date: "2026-09-26",
    title: "Site revamp",
    summary: "A full light theme, a new shell and home page, and redesigns of the bankroll lab, charts, journal and every drill.",
    tags: ["new", "improved", "fixed"],
    groups: [
      {
        title: "Site",
        items: [
          "A complete light theme alongside dark, with an instant toggle.",
          "Breadcrumbs, an account pill, a footer with legal links and a tool search that matches descriptions.",
          "A home page with an interactive Hi-Lo count-along demo and a live chart preview.",
          "Unknown addresses show a 404 instead of a sign-in form.",
        ],
      },
      {
        title: "Redesigned tools",
        items: [
          "The Game & Bankroll Lab became a guided workspace, with Undo for bulk changes.",
          "The strategy chart pages were rebuilt around one live chart with an explanation card per cell.",
          "The Session Journal became an overview with sheets.",
          "All counting and strategy drills moved onto a shared drill kit, opening each phase at its top on small phones.",
        ],
      },
      {
        title: "Fixes",
        items: ["Hands with several aces count as soft while one ace can still be 11, so 6,A,A is soft 18 and an H17 dealer with A,A,5 hits."],
      },
    ],
  },
  {
    id: "2026-09-23-directory",
    date: "2026-09-23",
    from: "2026-09-22",
    title: "Casino directory and journal recovery",
    summary: "A casino directory with a map, and safeguards for journal records.",
    tags: ["new"],
    groups: [
      {
        title: "Directory (retired in the October remake)",
        items: [
          "A directory of casinos and their games with a map, clickable pins and an expanded map view.",
          "Only real casino venues are pinned, cross-checked against their localities.",
        ],
      },
      {
        title: "Journal",
        items: ["A read-only recovery audit that checks journal history and backups before any correction."],
      },
    ],
  },
  {
    id: "2026-09-15-fixes",
    date: "2026-09-15",
    from: "2026-09-11",
    title: "Calculation and stability fixes",
    summary: "Heavier calculations moved off the main thread, and a round of fixes from a full site audit.",
    tags: ["fixed", "improved"],
    groups: [
      {
        title: "Fixes",
        items: [
          "Production calculations run in a worker, so long jobs no longer freeze the page.",
          "Full Shoe no longer stacks cards in the wrong order.",
          "Tabs respond to the keyboard even before the page has finished loading.",
          "Many journal and app improvements, including steadier sign-in and storage.",
        ],
      },
    ],
  },
  {
    id: "2026-09-08-early-surrender",
    date: "2026-09-08",
    from: "2026-09-05",
    title: "Early surrender and saved shoes",
    summary: "Early surrender against a ten in the charts and drills, and every Full Shoe kept for review.",
    tags: ["new", "fixed"],
    groups: [
      {
        title: "Charts and drills",
        items: [
          "Early surrender vs 10 (late surrender against everything else) in the chart and the drills, with Wong's table 32 indices.",
          "Fixed the surrender list: early surrender never touches 16 v 9, and 7,7 and 14 v 10 were missing.",
          "Fixed 16 v 9 and 15 v 10 surrender indices, which had been read backwards.",
          "Once a hand can no longer surrender, the no-surrender index applies.",
        ],
      },
      {
        title: "Full Shoe",
        items: [
          "Each finished shoe is saved, graded hand by hand, and can be reopened later.",
          "Saved shoes sync to your account.",
        ],
      },
      {
        title: "Journal",
        items: ["Better casino and date handling, notes visible on each session, and stats against expected value."],
      },
    ],
  },
  {
    id: "2026-09-02-charts",
    date: "2026-09-02",
    from: "2026-08-31",
    title: "Configurable strategy charts",
    summary: "Basic strategy charts for one to eight decks and any common rules, the Illustrious 18 on the chart, and a proficiency exam.",
    tags: ["new", "fixed"],
    groups: [
      {
        title: "Charts",
        items: [
          "An interactive chart for one, two and four to eight decks, with restricted doubling, early surrender and the no-hole-card adjustment.",
          "The Illustrious 18 shown on the chart, and a deviations tab.",
          "High-contrast colours and 44px cells on phones.",
        ],
      },
      {
        title: "Training",
        items: ["Test Out: a configurable exam whose sections each have their own clock and pass mark, so a strong count cannot hide a weak index game."],
      },
      {
        title: "Data",
        items: ["A corrected H17 simulation curve, and fixes to basic strategy."],
      },
    ],
  },
  {
    id: "2026-08-25-index-ev",
    date: "2026-08-25",
    from: "2026-08-23",
    title: "Index values re-measured",
    summary: "The index ranking was re-priced after the soft-20 doubles were added.",
    tags: ["improved"],
    groups: [
      {
        title: "Data",
        items: [
          "Every index's value re-measured over 250 million rounds.",
          "Double Down Madness got its own count indices and penetration study.",
        ],
      },
    ],
  },
  {
    id: "2026-08-22-h17-pwa",
    date: "2026-08-22",
    title: "Chart Recall, home-screen app and daily checklist",
    summary: "Fill in the whole H17 chart from memory, install CountLab on an iPhone home screen, and follow a daily practice routine.",
    tags: ["new", "improved"],
    groups: [
      {
        title: "New",
        items: [
          "The H17 chart recall drill: type the chart cell by cell, with a token pad on phones and live grading.",
          "CountLab as an iPhone home-screen app that works offline.",
          "A daily practice checklist that ticks itself off as you practise.",
        ],
      },
      {
        title: "Phones",
        items: ["A mobile pass across the site, keeping the chart's hand column and dealer 2 visible as you scroll."],
      },
    ],
  },
  {
    id: "2026-08-20-journal-sync",
    date: "2026-08-20",
    from: "2026-08-19",
    title: "Journal editing and safer sync",
    summary: "Edit logged sessions, and sync that never loses a record.",
    tags: ["new", "fixed"],
    groups: [
      {
        title: "Journal",
        items: [
          "Edit sessions after logging them, with a simpler logging flow.",
          "Sign-in can no longer lose journal records, imports skip duplicates, and duplicate bankrolls merge.",
          "Changes on one device show up on your others.",
          "Sync retries and shows its errors.",
        ],
      },
      {
        title: "Site",
        items: ["The countlab.ca address, and Google sign-in returns you to where you were."],
      },
    ],
  },
  {
    id: "2026-08-17-calculator",
    date: "2026-08-17",
    from: "2026-08-15",
    title: "Calculator and index tiers",
    summary: "The first bankroll calculator, a bet spread recommender, and index sets ranked by value.",
    tags: ["new"],
    groups: [
      {
        title: "New",
        items: [
          "A calculator for expected win, standard deviation and risk of ruin, with a bet spread recommender.",
          "Index tiers: the plays ranked by what each is worth, with sets from the I18 and Fab 4 up to the full list.",
          "Trip planning, scenario comparison and spaced repetition in the drills.",
          "Privacy-minded product analytics, with consent.",
        ],
      },
    ],
  },
  {
    id: "2026-08-14-accounts",
    date: "2026-08-14",
    title: "Accounts and countlab.ca",
    summary: "CountLab moved to its own site with real accounts.",
    tags: ["new"],
    groups: [
      {
        title: "New",
        items: [
          "Sign in with email or Google; settings, drills and the journal sync across devices.",
          "Terms of Service and a Privacy Policy.",
          "A card-by-card shoe simulator with every hand open for inspection.",
        ],
      },
    ],
  },
  {
    id: "2026-08-13-launch",
    date: "2026-08-13",
    from: "2026-08-12",
    title: "CountLab launches",
    summary: "The first version: a Hi-Lo trainer with a full blackjack game and bankroll tools.",
    tags: ["new"],
    groups: [
      {
        title: "New",
        items: [
          "Running count, true count and strategy drills.",
          "A full blackjack shoe to play through with counting.",
          "Core bankroll and risk calculations.",
          "Chase the Flush and Ultimate Texas Hold'em labs.",
        ],
      },
    ],
  },
];
