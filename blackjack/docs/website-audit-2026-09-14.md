# CountLab website audit and improvement plan

Reviewed **14 September 2026**, against the live site at **https://countlab.ca** and the local source at commit `7bc3c0b`.

The first priority is restoring calculations that fail in production. Next, fix the shared styling defects that make selected tabs, game headings, and entered drill answers difficult to read. Then address narrow-phone clipping and simplify the entry points into training and analysis. The site already has substantial functionality; these improvements should make that functionality dependable and easier to use.

## Implementation follow-up (15 September 2026)

The implementation addresses the confirmed defects and the core journey improvements below. The original observations are retained as the baseline.

- **Calculations:** traced the bootstrap failure to service-worker responses replacing the worker URL and dropping its fragment. Worker responses now preserve the original request URL. Calculators create workers on demand, handle startup/message errors, and allow recovery; simulations and analyzers can terminate cancelled work. Late responses are ignored.
- **Shared UI:** fixed game-shell background, selected tabs and button variants, and drill input colors. Added navigation current-page semantics and a mobile tab scroll cue.
- **Small phones:** constrained game grids and cards, stacked recommender values, and removed intrinsic panel overflow. Browser assertions check control bounds, not just document width; screenshots cover 320px.
- **First session:** Home, Dashboard, Practice, and onboarding point to a 20-card starter with four checkpoints. In-progress sessions are preserved. The experience choice persists, the longer checklist appears after the first session, and completion links to the next skill. The benchmark routine now describes a progress review.
- **Analysis:** moved scenario controls below page introductions, collapsed their form, and labeled saved snapshots versus current edits. Added the analysis sequence, distinct game descriptions, clearer outcome-range terminology, and visible Trip Planner assumptions.
- **Accounts:** removed duplicate guest entry, explained explicit history transfer, and added a snapshot preview before import. Journal fields have persistent labels. Import verification uses isolated local history and preserves existing sessions.
- **Release checks:** CI builds before browser tests, serves the exact export, and checks a live cached/offline calculation after deployment. No production data is written by these checks.

Validation includes 603 unit tests, lint, static export, desktop/mobile browser coverage, fixed-hand UTH/Chase/DDM calculations, both simulation modes, worker failure/retry, cancellation, offline UTH calculation, theme contrast, saved-scenario transfer, import merging, exam completion, and Full Shoe checkout. The final full browser run passed 97 tests with 29 intentional device-specific skips; the expanded 320px control checks also passed on all three projects. Release outcome is recorded in the delivery message.

Still requiring an external test setup: real email/Google authentication and recovery, cross-device sync and sync-failure recovery, actual account deletion, authorized admin analytics, and physical Safari/Android installation/update behavior. Local Supabase credentials are absent. These checks remain open; browser emulation and local import tests do not establish that they passed. Numerical models and legal content have not been independently re-audited.

## What was checked

- Loaded all **33 primary routes** at **1440, 390, and 320 CSS pixels** wide: 99 page visits, with screenshots and browser-error capture. All returned HTTP 200; `/admin` correctly showed an access message to a guest.
- Checked all four legacy redirects and an unknown URL, which displayed the site's missing-page screen.
- Exercised guest entry, tool search, reference keyboard navigation, drill starts and answers, chart entry, exam setup, game setup/dealing, game subpages, both simulator modes, hand analysis, scenario transfer, journal persistence, saved drill statistics, theme switching, and the guest-to-sign-in screen.
- Reviewed routing, shared controls, styling, worker initialization, authentication UI, and the deployment/test configuration.
- Ran the existing unit suite: **55 files, 601 tests passed**. Local tests reported that Supabase environment variables were absent; this is a local setup limitation, not evidence of a live authentication failure.

This was a guest workflow and interface audit. Authenticated sign-up/sign-in completion, email recovery, cross-device sync, account deletion, admin analytics, installation/offline updates, physical iOS/Android behavior, and exhaustive game/exam completion remain unverified. No accounts were created or emails sent. Guest test entries existed only in isolated browser contexts. Numerical models were not independently re-audited.

Saved evidence: [route results](website-audit-2026-09-14/route-results.json), [workflow results](website-audit-2026-09-14/workflow-results.json), and screenshots linked below. Initial automation selector and page-readiness timeouts were investigated separately and were not counted as website defects.

## Prioritized work

### 1. P0 — Restore production workers and calculation results

**Confirmed behavior:**

- On `/simulation`, **Real shoes** and **Fast approximation** both produced `Missing worker bootstrap config` and remained at **“Simulating... 0%”** with no results during the observation period.
- On `/ultimate-texas-holdem/#analyzer`, calculating the supplied river hand displayed **“Calculation stopped unexpectedly. Try again.”**
- Chase the Flush dealt cards, but its coach remained at **“Calculating EV…”**. Its Analyzer likewise entered background calculation after worker bootstrap errors without producing a result during the check.
- The same bootstrap exception occurred on Full Shoe and DDM pages. Setup/buy-in worked; this does not establish that their entire games are broken. Their worker-dependent analysis needs explicit verification.

The exception stack points to the deployed `turbopack-worker-2ru9m5gbh1na6.js` bootstrap. This implicates production worker initialization; the precise packaging cause still needs diagnosis.

**Plan:** reproduce against a locally served production export, inspect the emitted worker URLs/bootstrap contract, and correct the build or worker integration. Standardize worker startup, `error`/`messageerror` handling, cancellation, and retry. Clear busy indicators after failure and display an actionable error. Create workers only when the associated calculation is needed; static strategy tabs currently also trigger worker errors.

**Acceptance:** both simulator modes finish a small deterministic run; each game analyzer returns a result for a fixed simple hand; worker startup failures produce an error and a working retry rather than indefinite progress. Cancellation leaves the next run usable. No worker bootstrap exceptions occur in these checks.

**Likely files:** [SessionSimulator.tsx](../components/SessionSimulator.tsx), [UTHLab.tsx](../components/UTHLab.tsx), [ChaseFlushLab.tsx](../components/ChaseFlushLab.tsx), the game components, [workers](../workers), [next.config.ts](../next.config.ts).

**Evidence:** [simulator at 0%](website-audit-2026-09-14/flow-simulation-shoes.png), [UTH calculation failure](website-audit-2026-09-14/flow-uth-analyzer.png).

### 2. P1 — Fix shared contrast and theme defects

**Confirmed behavior:**

- DDM, UTH, Chase the Flush, and Full Shoe use pale headings on a pale page background in light mode. Game navigation/header text also loses contrast.
- Selected reference/game tabs are nearly invisible in both themes. Measured selected-tab colors were `#ecefe8` on `#f6f8f3` in light mode and `#101915` on `#16211c` in dark mode.
- True Count accepts typed answers, but the entered `2` and `-1` are white on a light field. The shared drill input class contains hardcoded `text-white`, so running count, deck estimation, and exam inputs using that class need the same review.

**Plan:** give the game shell a background that matches its scoped dark colors, or let its outer shell follow the chosen theme. Make selected/unselected styles explicit variants in shared controls. Remove conflicting background classes between `GhostButton` and `Tabs`. Replace hardcoded drill input colors with theme variables. Review focused, selected, disabled, error, and hover states together.

**Acceptance:** normal-size text and entered values meet a 4.5:1 contrast target; large headings meet 3:1. Selected tabs remain readable and visibly selected in light, dark, and system modes. Verify actual computed colors after hydration and theme switching, not just class names.

**Likely files:** [globals.css](../app/globals.css), [AppShell.tsx](../components/AppShell.tsx), [ui.tsx](../components/ui.tsx), [DrillKit.tsx](../components/DrillKit.tsx).

**Evidence:** [light-mode DDM](website-audit-2026-09-14/1440-double-down-madness.png), [light reference tabs](website-audit-2026-09-14/390-reference.png), [dark reference tabs](website-audit-2026-09-14/flow-dark-reference.png), [typed drill answers](website-audit-2026-09-14/flow-true-count-input.png).

### 3. P1 — Fix narrow-phone clipping

**Confirmed behavior:** at 320px, the Bet Spread Recommender's targets, candidate spreads, and detailed ramp extend beyond the right edge, cutting off values. UTH's table and supporting panels also extend beyond the viewport. The global horizontal clipping prevents users from recovering content by scrolling the page sideways.

**Plan:** fix intrinsic grid/flex sizing, add `min-width: 0` where needed, and stack dense value/label pairs sooner. Keep card rows and genuinely wide charts in their own horizontal scrollers. Check expanded panels as well as their collapsed states. Add a visible scroll cue for reference charts and tab rails, where horizontal scrolling is intentional.

**Acceptance:** at 320/375/390/430px, every primary action and displayed result is reachable; panels fit within the viewport; horizontal scrolling is confined to clearly identified tables/card rows. Check long scenario names, expanded settings, and mobile action docks. A document-width assertion alone is insufficient because `overflow-x: clip` can hide the defect.

**Likely files:** [BankrollRecommender.tsx](../components/BankrollRecommender.tsx), [UTHTableGame.tsx](../components/UTHTableGame.tsx), [CasinoGameUI.tsx](../components/CasinoGameUI.tsx), shared panel/grid styles.

**Evidence:** [clipped recommender](website-audit-2026-09-14/320-bet-spread-recommender.png), [clipped UTH table](website-audit-2026-09-14/320-ultimate-texas-holdem.png).

### 4. P1 — Test the exported site before deployment

**Confirmed gap:** the deployment workflow runs browser tests against `next dev`, then builds the static export. The unit suite passes despite the live worker and contrast failures. Existing theme coverage checks a header link, which does not cover selected tabs, scoped game themes, or drill input values.

**Plan:** build once, serve `out/`, and run a focused production acceptance suite against that exact artifact before uploading it. Retain useful development-mode tests. Add fixed-hand worker checks, a small run in both simulation modes, shared-theme assertions, and mobile clipping checks. Fail on unexpected page/worker errors. Add a short deployed-site check after release to detect asset/caching differences.

**Acceptance:** deliberately breaking worker initialization, selected-tab contrast, or a 320px result panel makes the corresponding pre-deployment check fail. Record screenshots/traces on failure. Tests verify completed results, not merely headings or enabled buttons.

**Likely files:** [deploy.yml](../../.github/workflows/deploy.yml), [playwright.config.ts](../playwright.config.ts), [e2e](../e2e).

### 5. P2 — Give beginners one coherent first session

**Observed friction:** Practice suggests a ten-minute routine, but Dashboard's fresh checklist recommends **200 basic-strategy hands** while another card says to start with running count. Onboarding's “Try a counting drill” links to True Count; the homepage uses Running Count. The experienced routine labels Counting Benchmark as a two-minute activity, but that page is a progress overview rather than a timed test. The beginner/experienced selection resets when the hub remounts.

**Plan:** use one initial recommendation across Home, Dashboard, Practice, and onboarding. Offer a short, concrete starter preset with a clear finish, then link the completion summary to the next skill. Separate a beginner routine from the longer daily checklist. Persist the experience preference. Rename the benchmark overview or give it an explicit timed-test start action.

**Acceptance:** a new guest can complete the suggested first session without deciding among competing starting points; completion updates the dashboard and leads to the next drill. Experienced users retain direct access to every tool. The advertised time matches the activity reached by each routine link.

**Likely files:** [HomePage.tsx](../components/HomePage.tsx), [PracticeHub.tsx](../components/PracticeHub.tsx), [Onboarding.tsx](../components/Onboarding.tsx), [DynamicPage.tsx](../components/DynamicPage.tsx), [CountingDrills.tsx](../components/CountingDrills.tsx).

### 6. P2 — Make saved scenarios an easier analysis workflow

**Observed friction:** on a fresh mobile Lab visit, a large empty saved-scenario form precedes the page title and results. Users see a disabled Load action and a save form before understanding what they are analyzing. The existing cross-tool scenario transfer is valuable and worked: a saved `$12,345` bankroll reached Trip Planner correctly.

**Plan:** put the page purpose and active scenario summary first. Collapse the empty library to a compact “Load saved scenario” action, and place saving near the inputs/results it applies to. Clearly label saved versus edited inputs. Make the Analyze hub show a useful sequence: build game → simulate → compare/plan → log results. Use distinct descriptions for the game cards instead of repeating “Explore this game and its strategy.”

**Acceptance:** first-time users reach a useful default model before dealing with the library. A saved scenario carries supported rules, bankroll, unit, ramp, and hand schedule across destinations. Unsupported configurations remain explicitly rejected. Saving a copy versus updating an existing scenario is unambiguous.

**Likely files:** [ScenarioPicker.tsx](../components/ScenarioPicker.tsx), [DynamicPage.tsx](../components/DynamicPage.tsx), the analysis pages.

### 7. P2 — Clarify statistical labels and model context

**Observed inconsistency:** Lab describes outcome ranges, while Trip Planner and the populated Journal label variability bands **“95% CI.”** Those displays describe modeled outcome variation, which users can confuse with uncertainty in the estimate of average EV. Analysis tools also have their own rules while the header shows training defaults; the current accessible header explanation is more informative than its compact visual badge.

**Plan:** use “95% modeled outcome range” for outcome bands and reserve confidence-interval language for estimated coefficients/means. Keep net result versus ending bankroll explicit. Give each analysis result a compact, visible rules/model summary and place approximation limits beside the affected result. Preserve the existing detailed methodology for users who want it.

**Acceptance:** the same concept has the same name across Lab, Simulator, Journal, Compare, and Trip Planner. A user can identify whether a range describes outcomes or estimation uncertainty, which bankroll/result it refers to, and which game rules produced it.

**Likely files:** [TripPlanner.tsx](../components/TripPlanner.tsx), [SessionJournal.tsx](../components/SessionJournal.tsx), shared result components.

### 8. P2 — Finish account and accessibility verification

**Observed friction:** the sign-in screen offers guest entry twice. A guest is told to sign in for backup, but Settings also correctly states that guest history is separate and does not automatically transfer. The distinction needs to be clear at the moment a guest decides to create an account. Some Journal fields rely on placeholders, and desktop navigation does not expose the same `aria-current` state as mobile navigation.

**Plan:** use one guest action, explain how existing guest work can be transferred, and offer an explicit opt-in import with a preview of affected records. Preserve account isolation. Add persistent accessible labels to placeholder-only fields and consistent current-page semantics. Verify keyboard focus and return-to-trigger behavior for menus, dialogs, and chart interactions.

**Acceptance:** with a dedicated test account, verify email and Google sign-in, recovery, guest data preservation/import, cross-device sync, failed-sync recovery, export/import, and account deletion. Test admin access with both authorized and ordinary accounts. Complete a keyboard and real mobile Safari pass. These are verification requirements, not claims that the untested flows are broken.

**Likely files:** [AuthGate.tsx](../components/AuthGate.tsx), [AuthProvider.tsx](../lib/supabase/AuthProvider.tsx), [AccountDataTools.tsx](../components/AccountDataTools.tsx), [AppShell.tsx](../components/AppShell.tsx), [SessionJournal.tsx](../components/SessionJournal.tsx).

## Suggested delivery sequence

Effort estimates are approximate engineering days, including focused verification; worker diagnosis and authenticated testing may change them.

| Stage | Work | Estimate | Exit condition |
|---|---|---:|---|
| Restore reliability | Item 1 plus production worker checks from item 4 | 2–4 days | Simulations and fixed-hand analyzers finish on the exported build |
| Repair shared UI | Items 2–3 plus contrast/mobile checks from item 4 | 2–3 days | Readable states in both themes; usable narrow-phone results |
| Improve core journeys | Items 5–7 | 3–5 days | Coherent starter session, simpler scenario flow, consistent result labels |
| Complete release confidence | Item 8 and remaining deployed/offline/device checks | 2–3 days | Account, sync, accessibility, and device verification recorded |

Do the reliability and shared UI work before adding more calculators or redesigning individual pages. Shared fixes reach many routes at once.

## Coverage by area

| Area and routes | Result of runthrough | Follow-up |
|---|---|---|
| Home `/`, Dashboard `/dashboard`, Practice `/practice` | Clear entry into guest training; all render across checked widths | Unify the first-session recommendation |
| Analyze `/analyze`, Games `/play` | Destination links and descriptions render | Show an analysis sequence; distinguish game descriptions |
| `/cvcx` | Results render; scenario save and transfer exercised | Theme consistency, library placement, production scenario regressions |
| `/simulation` | Both calculation modes fail to produce results after worker bootstrap error | P0 worker repair |
| `/journal` | Created a bankroll, logged a `$125` result, and verified persistence after reload | Labels, outcome-range terminology, later edit/export/import verification |
| `/compare`, `/trip-planner`, `/bet-spread-recommender` | Default results render; Trip Planner loads a saved Lab bankroll | Mobile sizing; result terminology; deeper multi-scenario interaction checks |
| `/double-down-madness` | Buy-in and all six tabs inspected; aggregate EV calculator renders | Worker-dependent hand analysis/coaching; light theme |
| `/ultimate-texas-holdem` | Deal action and four tabs inspected; Analyzer displays a calculation error | Worker repair, light theme, 320px sizing |
| `/chase-flush` | Deal action and all five tabs inspected; calculation/coach stuck after worker errors | Worker repair and light theme |
| `/training/running-count`, `/training/true-count`, `/training/deck-estimation` | Start actions work; typed True Count values checked | Shared input contrast; full completion and mobile keyboard checks |
| `/training/basic-strategy`, `/training/deviations` | Answers advance and show previous-hand explanations; ended deviation drill appears in Statistics | Preserve feedback and saved-history behavior |
| `/training/h17-chart` | Chart renders; keyboard entry updates filled count | Theme review; retain deliberate chart scrolling and improve its cues |
| `/training/full-shoe` | Setup and buy-in work; worker bootstrap error observed | Verify complete coached/checkout shoes after worker repair |
| `/training/checklist`, `/training/benchmark`, `/training/test-out` | Render; exam starts at first-section briefing | Coherent beginner routine; benchmark naming; full exam completion later |
| `/reference`, `/reference/deviations`, `/reference/h17-chart` | Charts render; keyboard tab navigation works | Selected-tab contrast in both themes; mobile scroll cues |
| `/statistics`, `/settings` | Saved drill visible; theme setting works | Preserve missing-measurement labels; verify filtering and import/export more deeply |
| `/signin`, `/terms`, `/privacy`, `/admin` | Sign-in UI and legal pages inspected; guest admin access denied | Authenticated workflows and legal-content review remain outside this pass |
| Four legacy URLs and an unknown URL | Redirect destinations and missing-page recovery render | Include in production route smoke checks |
