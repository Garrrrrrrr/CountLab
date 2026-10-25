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
    id: "2026-10-25-chart-recall",
    date: "2026-10-25",
    title: "Chart Recall: four levels and typed counts",
    summary: "Chart Recall now goes from basic strategy to every index, with the Illustrious 18 and Fab 4 or your own pick of indices in between, and takes counts typed straight into the cells.",
    tags: ["new", "improved"],
    groups: [
      {
        title: "Chart Recall",
        items: [
          "Four levels: Basic strategy, All indices, I18 + Fab 4, and Custom. At I18 + Fab 4 and Custom, only those cells ask for an index; every other cell asks its basic play.",
          "Custom opens a list of every index for your rules, grouped by table, with I18 + Fab 4, All and None shortcuts. Your pick is remembered on this device.",
          "On a keyboard, type the count into a surrender cell: 5 means surrender at +5 or higher, and -5 or d5 means at −5. A lone - still means no surrender.",
          "In the hard, soft and pair tables, typing a count opens the index entry with it filled in, ready for the play.",
          "The resume banner says “1 cell”, not “1 cells”.",
        ],
      },
    ],
  },
  {
    id: "2026-10-25-fixes",
    date: "2026-10-25",
    title: "Hit-and-run pricing, saved shoes and easier reading",
    summary: "The Calculator now prices leaving a shoe you play from the top, saved Full Shoe reports keep their pace and back-counting plan, and faint text is easier to read.",
    tags: ["fixed", "improved"],
    groups: [
      {
        title: "Calculator",
        items: [
          "When you play every round, leaving at −1, −2 or −3 is now priced from simulated shoes. Before, the choice changed nothing. Leaving at 0 or +1 is no longer offered there, because a fresh shoe starts at 0.",
          "Each move to a fresh shoe counts as time without play: 5 minutes unless you set your own under Time to find a fresh shoe. The note under the ramp says how many rounds you play in each shoe.",
        ],
      },
      {
        title: "Journal",
        items: [
          "Clearing every detail on a session now clears it on your other devices too, instead of the old values coming back.",
          "Save stops at a details field with a typo, such as 350.5 rounds, rather than saving the session without it.",
          "Save and log another clears the details fields along with the rest of the form.",
          "A session's simulated shoes use the rounds you recorded, when you recorded them, and surrender early against a ten when the session was logged with early surrender.",
        ],
      },
      {
        title: "Full Shoe and charts",
        items: [
          "A saved shoe reopened from the list shows its pace and its sit-in and leave counts.",
          "The pocket chart prints on a single 4×6 card without cropping, and on one page of letter paper.",
        ],
      },
      {
        title: "Reading",
        items: [
          "Grey labels, green and blue badges, and labels on the table felt now meet the WCAG AA contrast ratio in light and dark.",
          "On the smallest phones, the Calculator's header no longer grows wider than the screen once you have a saved scenario, which had zoomed the page out and made taps miss. Save is an icon there, like Share.",
        ],
      },
    ],
  },
  {
    id: "2026-10-25-pocket-card",
    date: "2026-10-25",
    title: "A redesigned pocket chart, and truncated true counts",
    summary: "The pocket chart has a new layout and comes in light or dark, and new settings now truncate the true count, which is what Wong's indices assume.",
    tags: ["new", "improved", "fixed"],
    shots: [{ src: "/changelog-shots/pocket-dark.jpg", alt: "The redesigned pocket chart in dark colours, with hard, soft, pair and surrender panels and a key", caption: "The new pocket chart in dark colours, for six decks with early surrender." }],
    groups: [
      {
        title: "Pocket chart",
        items: [
          "A new layout: a header with your rules and the insurance count, a rounded panel for each table with a shaded dealer row, and two tall columns that fill a phone screen and print on a 4×6 card held upright.",
          "A Phone shape stacks every table in one long column to scroll through, and is the default on phones. Card keeps the two columns, and printing always uses it.",
          "Saved images are about 16 megapixels, the most a phone will draw, so the numbers stay sharp when you zoom in.",
          "Light or dark colours. Your choice is remembered on this device and Download chart on the charts page uses it too. Dark images get “-dark” in the file name, and printing always uses light.",
          "A How to read it panel explains the colours, the index strips, the purple surrender corner, and the dash a surrender cell shows when you surrender only at a high enough count.",
          "A Notes panel gives the insurance count, the always-hit and always-stand totals, that indices assume a truncated true count, and any footnotes for your rules.",
        ],
      },
      {
        title: "True count",
        items: [
          "New settings truncate the true count (−1.6 counts as −1, +2.8 as +2), as Wong's indices assume. Truncate is now listed first in Settings.",
          "If you have saved settings before, they keep the rounding they had; you can switch it in Settings → Counting.",
        ],
      },
      {
        title: "Fixes",
        items: ["On screens 1280–1360px wide, the Calculator's bet ramp steps stay inside their card."],
      },
    ],
  },
  {
    id: "2026-10-25-calculator-journal",
    date: "2026-10-25",
    title: "Calculator rules, back-counting and a richer journal",
    summary: "The Calculator now prices early surrender, one-, two- and four-deck games, table maximums and back-counting from fresh simulations, and setups can be shared as a link. The Journal records buy-in, cash-out, rounds and heat for each session.",
    tags: ["new", "improved", "fixed"],
    shots: [
      { src: "/changelog-shots/calculator-ramp.jpg", alt: "The Calculator's bet ramp card with the when-you-play, when-you-leave and table maximum controls", caption: "The bet ramp now says when you sit down, when you leave and the table maximum." },
      { src: "/changelog-shots/journal-log-phone.jpg", alt: "The Log session sheet on a phone with buy-in, cash-out, rounds played and heat fields", caption: "Logging a session with buy-in, cash-out and heat.", phone: true },
    ],
    groups: [
      {
        title: "Calculator",
        items: [
          "Surrender is now None, Late or Early vs 10, each priced from its own simulation of Wong's indices rather than adjusted from another game.",
          "One-, two- and four-deck games join six and eight decks, with their own penetration defaults and insurance thresholds.",
          "Back-counting: choose the count you sit down at (now down to −1) and the count you leave at. Hands per hour and the result use simulated shares of the shoe you actually play.",
          "A table maximum caps every bet in the ramp, and Suggest a ramp says when the best spread would need more than the table allows.",
          "Share sends the whole setup as a link; opening it loads the setup without touching your saved ones, and a broken link says so.",
          "Compare now has a Rules mode: your game beside each one-rule change (soft 17, surrender, DAS, resplitting aces, 6:5, no hole card, doubling), ranked by SCORE.",
          "The trip outlook adds the bankroll needed for several trips and how long, on average, it takes to double the bankroll, with the chance of doing so before going broke.",
          "Number fields show what is wrong as you type and put the last good value back if you leave a bad one, instead of silently clamping it.",
        ],
      },
      {
        title: "Journal",
        items: [
          "Sessions can record buy-in and cash-out (the result is worked out for you), rounds played, top bet and how much heat you felt.",
          "Expected results use the rounds you actually played when you enter them.",
          "Venues show heat by casino, so a casino that is getting warm stands out.",
          "The results chart can run by session or by hours played.",
          "Set a starting bankroll from the Cash tab; phones get a Cash button beside Log session.",
          "When your unit is too big for the bankroll, the overview names a unit a table will take or the deposit that makes it safe. Session badges only appear on unusual sessions.",
          "Game settings take early surrender and every deck count, and the default game is $15 with a 1–12 spread.",
        ],
      },
    ],
  },
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
          "Chart Recall's surrender table only asks against 8, 9, 10 and ace; nothing is surrendered against a lower card, so those cells come filled in.",
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
          "Each chart table is a single tab stop; the arrow keys move from cell to cell.",
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
