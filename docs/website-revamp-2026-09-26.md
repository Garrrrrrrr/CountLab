# Website revamp — September 26, 2026

A full pass over the live export at desktop (1440px) and phone (390px, 320px) widths in both themes, followed by the fixes and redesigns below. Math engines, sync, and account data handling were not changed.

## What was wrong

- **Light theme was only half finished.** About 380 utility classes assumed a dark page (`bg-black/20`, `bg-white/[.05]`, `border-white/[.07]`, …). In light mode they became muddy grey blocks (Lab summary cards, onboarding checklist, simulator workload bar, settings privacy row) or disappeared entirely (sidebar selection, header pills, "Find a tool" border). The mobile action dock was always near-black, so light-theme pages got a dark bar with dark-on-dark text.
- **Broken icon tiles** on the Analyze and Games landing pages: the tile classes sat on the Font Awesome `<i>` element, whose own `display` won, producing tall empty capsules. The simulator's empty state used a Font Awesome Pro icon (`fa-cards-blank`) that does not exist in the free set.
- **Navigation dead ends.** Unknown URLs showed visitors a sign-in form instead of a 404. A guest choosing "sign in" at `/signin` saw the dashboard, not the form. The header's "Home" button carried a stale comment about leaving for a portfolio and duplicated the logo with a different destination.
- **Settings** hid its only Save button inside the Experience panel, below unrelated sections, and a theme change did nothing until saved.
- **Dashboard** told new users they had "0%" accuracy.
- Index tags and the `Ds` chart token used dark-amber text on near-black in light mode.
- Admin-only import code shipped in every visitor's bundle; dead code (`HiLoReference`), debug logs (`.playwright-mcp/`), and Python bytecode were tracked in git.

## What changed

| Area | Change |
| --- | --- |
| Theme system | New `overlay` and `well` Tailwind colors backed by CSS variables: identical to the old white/black values in dark mode, ink-tinted and alpha-scaled in light mode. A codemod moved 341 usages; modal scrims and rings on saturated chart chips stay literal. Dark tokens are declared once for the explicit dark theme and the casino floor, which also now gets the dark count colors. |
| App shell | Breadcrumb header (area › page), one-click light/dark toggle that saves without touching unsaved rule edits or onboarding, account pill with sync state, logo links home, sidebar account card, footer with Terms/Privacy/Contact, five-item phone nav including Dashboard. Tool search matches descriptions and ranks name matches first, shows a one-line description per result, and uses a real scrim. |
| Home | Two-column hero with an interactive Hi-Lo "count along" demo (deal, quiz, reveal); figures read live from the audited metadata (116.5B rounds, 9 profiles); a four-step learning path; a real strategy-chart preview rendered from the chart engine; analysis and games sections; a closing starter-drill CTA; JSON-LD `WebApplication` data. |
| Sign-in | Split layout with account benefits on desktop, brand-first single column on phones, guest entry that works from `/signin`, styled loading state, and links home. |
| Analyze / Games | Rebuilt cards with working icon tiles. Analyze shows a numbered suggested order plus the directory; each game links straight to its Play / Strategy / Analyzer / … tab. |
| Dashboard / 404 / errors | "—" and "Not measured yet" instead of 0%; a single friendlier 404 with area shortcuts (no hydration mismatch); error screen uses theme tokens. |
| Settings | Theme picker applies immediately; appearance and experience switches share one panel; a sticky bar appears only with unsaved changes (Save / Discard) and confirms saves. The draft follows background sync updates unless the reader is mid-edit. |
| Phones | The action dock follows the theme and publishes its height so the footer is never trapped underneath it. |
| Hygiene | Admin import panel lazy-loaded; decorative icons marked `aria-hidden`; shared `ACTION_STYLE` module; guard for browsers that resolve service-worker registration without a registration; removed tracked debug logs and bytecode and ignored them going forward. |

## Pre-deploy review

Before pushing to main, four independent reviewers examined the diff for logic, theme, routing, and accessibility/test defects. A separate skeptic tried to refute each finding: 5 of 10 were confirmed and fixed.

- `/dashboard/index.html`-style URLs skipped the sign-in gate after the 404 change. Paths are now normalized in one helper (`normalizePath`) shared by the gate and the shell.
- Unknown URLs under a real area (e.g. `/reference/typo/`) failed to hydrate because the breadcrumb derived an area from the path. Unknown paths now get no area.
- The settings draft stopped following outside changes after a mid-edit theme change plus Save, so a later sync could show a false "unsaved changes" bar. Theme is now excluded from the draft comparison, and the draft realigns on save.
- The count demo's eyebrow text and hidden-count placeholder were below WCAG contrast. The demo also announced the count twice. Colors and live regions are fixed.
- Header pills are back to 44px touch targets.

Each of the first three has an e2e regression test that failed on the pre-fix build.

## Validation

- `npm test`: 59 files, 616 tests passed. `npm run lint` and `npm run build` passed.
- Full Playwright suite against the static export: 119 passed, 0 failed, 43 intentional device-specific skips. New `e2e/site-revamp.spec.ts` covers the count demo, theme toggle persistence, 404s for visitors (with no hydration errors), private-route gating at every URL spelling, guest access to the sign-in form, landing-page deep links, the settings save bar (including a header theme change mid-edit and a later outside change), description search, and 320px overflow plus footer-versus-dock overlap.
- Screenshots of all routes in both themes at 1440px and 390px, plus 320px header, drawer, palette, and sign-in views, were reviewed after the changes.

Not re-verified here: authenticated sign-in and sync against a real Supabase project (no credentials in this environment), physical iOS/Android devices, and the numerical models.

---

# Part 2 — tool redesigns and navigation

The first pass left the tools themselves as they were. The second pass rebuilt the five most-used ones and the sidebar on a shared kit, so each works the same way: one clear primary action, plain-language labels with help on demand, and layouts that fit a phone.

## Navigation

The sidebar used to put nearly every tool under two tabs, **Analyze** and **Practice**. It is now five collapsible groups named after what people come to do: **Practice**, **Plan & analyze**, **Track results**, **Table games** and **Reference**. The group you are in opens automatically, and the others remember whether you collapsed them. Each group with a landing page lists it first ("All drills", "Overview", "All games"). `lib/routes.ts` (`NAV_GROUPS`) is the single list behind the sidebar, tool search, breadcrumbs and page titles, so they can no longer drift apart.

A phone's bottom bar can't hold twenty tools. It keeps the four most-used destinations (Dashboard, Practice, Charts, Journal), and a **Menu** button opens the full grouped list.

## Shared kit

`components/ui.tsx` gained accessible segmented controls (native radios with a group name), toggletip help and term definitions, steppers, callouts, empty states, progress meters, a focus-managed `Sheet` (only the top dialog responds to Escape), toasts and a single live announcer. `components/drill/` is a kit for every drill: the same **Setup → Play → Summary** frame, a sticky progress bar, a feedback panel that explains each miss, a summary that ranks weak spots and suggests the next drill, and focus that moves to each new phase.

## Tools

| Tool | What it looks like now |
| --- | --- |
| Game & Bankroll Lab | Three numbered steps (Game, Bankroll, Bet ramp) beside a pinned Results card that answers "what do I win, how much does it swing, can my bankroll take it". Ramp presets, a step editor with steppers and a bar chart, an optimal-ramp builder that says what it trades away, a trip outlook, a ranked comparison with other games, and a scenario/venue library. On phones the steps become tabs, with a compact results bar pinned above the bottom nav. |
| Session Journal | An overview (results vs expectation, bankroll health, chart) with **Log session** as the one primary action. Logging asks only for date, hours and won/lost plus an amount; the game comes preloaded from your last session, a saved venue, a Lab scenario or a Simulator setup, behind "Change game". Sessions, venues, cash movements and import/export are tabs; editing and deposits open in sheets, with unsaved-changes guards. |
| Strategy charts | A one-line rules bar, a color key, and four clearly titled tables (hard, soft, pairs, surrender first). Any cell explains its play in plain words; the index view marks every count-based change and ranks them. Links go straight into the matching drills. |
| Counting drills | Named session presets (Starter, One-deck speed, Six-deck casino, …) with a customize panel, a progress card with the benchmark target, a numeric answer pad, and summaries that show where counts drifted. |
| Strategy drills | One setup (Mixed / Weak spots / Tricky, round length), action buttons with keyboard keys, a feedback panel that shows the hand's place on the chart, and a summary by hand type with "See it on the chart" links. |

## How it was built and checked

Each tool was redesigned from a written spec in its own git worktree, with its own unit and end-to-end tests, then merged. The merged tree was reviewed for accessibility, cross-tool handoffs (Lab scenarios into the Journal, Simulator and other tools; chart ↔ drill links; drills → Statistics and Dashboard), visual consistency in both themes at 1440, 390 and 320px, and dead code.

## Post-merge review

Two reviewers exercised the merged build in a browser: one for accessibility (axe on every redesigned route in both themes at 1440 and 390px, keyboard-only runs of every drill, sheet and menu), one for cross-tool flows (every internal link, scenario handoffs, directory → Lab, drills → Statistics/Dashboard/Checklist, Journal CRUD, chart ↔ drill links). A visual pass covered the same routes at 1440, 390 and 320px. Each finding was confirmed in the code before it was fixed:

- **Enter on a "More options" disclosure started the drill** instead of opening it (and on a summary, started a new round and lost the review). The page's Enter shortcut now ignores disclosures, tabs, options and switches.
- **Focus got lost** after closing tool search (it now returns to the button that opened it, including inside the phone menu), after closing a Journal sheet opened from the phone dock (the dock is hidden, not removed, while a sheet is open), and after pressing "Change" on a drill's one-line setup (focus moves to the first choice).
- **Tabbing through the Log session form without typing** asked "Discard this session?" on close: number fields reported a change on every blur. They now report only real changes.
- **"See it on the chart" from a drill opened the chart at the top.** The strategy and deviation charts now scroll to, focus and explain the named cell.
- Help tips now speak their text when opened; each toast is announced once (no nested live regions); the phone menu is a labelled modal dialog while open; the Journal's "scenario not found" notices are announced; two contrast misses (Lab penetration percentages in light, the Hi-Lo −1 value in dark) now pass AA; the closed phone menu no longer casts a shadow onto the page.
- Removed code the redesigns left unused (`CountRule`, `FieldCaption`, a stray type) and made the drill copy's spelling consistent.

Each keyboard and chart-link fix has an end-to-end regression test (`e2e/keyboard-focus.spec.ts`, and the chart-link case in `e2e/reference-charts.spec.ts`).

## Validation (part 2)

- `npm test`: 75 files, 852 tests passed. `npm run lint` and `npm run build` passed.
- Full Playwright suite against the static export: 341 passed, 0 failed, 220 intentional device-specific skips (561 total across desktop, iPhone SE and iPhone 13 projects). The five feature specs (`bankroll-lab`, `session-journal`, `reference-charts`, `counting-drills`, `strategy-drills`) plus `keyboard-focus` cover the redesigned tools end to end.
- Screenshots of the redesigned routes at 1440px (light), 390px (dark) and 320px (light), plus drill play phases on phones, were reviewed after the merge; no route overflows horizontally at 320px and none logs a console error.

Not re-verified here, as in part 1: real Supabase sign-in and sync, physical devices, and the numerical models. The EV, risk, simulation and strategy engines were not modified; the redesigns changed only drill and training helpers around them.
