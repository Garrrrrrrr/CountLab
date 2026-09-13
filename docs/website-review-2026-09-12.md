# CountLab website review

Reviewed September 12, 2026.

CountLab has substantial functionality and a useful Practice / Analyze / Games / Reference structure. The highest-value next work is protecting saved data, completing the theme and accessibility systems, and giving new users a clearer first session. Adding more tools should come after those improvements.

## Scope and evidence

This is a source and production-export review covering the route inventory, shared shell, authentication, dashboard, training, reference, analysis, table-game labs, statistics, settings, privacy, installation, and admin analytics. It is not an independent mathematical audit of every game engine.

- `npm test`: 54 test files and 577 tests passed in the local run.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript, static export, and service-worker generation.
- Inspected generated HTML for the home, reference, and privacy pages.
- No connected browser was available. Live layouts, touch interactions, keyboard behavior, and authenticated Supabase flows were not exercised; existing end-to-end tests were inspected but not run. Local Supabase environment variables are absent, so build success does not validate account connectivity.
- Findings below distinguish source-confirmed behavior from proposed product changes. No application code was changed for this review.
- Concurrent edits to `journal.ts`, `sync.ts`, and `schema.sql` appeared during the review. They introduce revision timestamps, deletion markers, and date-based retention. Findings 2 and 3 acknowledge that work. The successful checks above preceded those edits and do not validate the final state of that separate work.

## Fix first

### 1. Isolate each account's local data

**Priority: critical. Source-confirmed account isolation problem.**

`AuthProvider` retains the device cache on sign-out and calls `pushLocalDataToRemote()` before pulling on the next sign-in. Journal collection keys do not include an account ID. Consequently, after account A signs out, guest mode or account B can read A's cached records. The upload path also treats that shared cache as belonging to the current account.

Database row-level security can reject overwriting existing rows owned by A, but does not isolate the browser cache. Settings and previously unsynced records also need explicit ownership; this is not a reason to weaken database policies.

Use separate account and guest namespaces, keep pending writes attached to their original owner, and make guest-to-account migration a deliberate operation. Preserve unsynced data in A's private namespace without exposing it to B. Cancel or invalidate outstanding synchronization when identity changes.

Validate: A signs out with both synced and unsynced records; guest and B see neither; signing back into A restores its pending work. Repeat with an upload in progress.

Evidence: [AuthProvider.tsx](../blackjack/lib/supabase/AuthProvider.tsx), [sync.ts](../blackjack/lib/supabase/sync.ts), [journal.ts](../blackjack/lib/blackjack/journal.ts).

### 2. Make journal synchronization preserve edits and deletions

**Priority: high. Partial fixes appeared during the review; remaining reliability work needs validation.**

The initial implementation concatenated remote rows before local rows and kept the first matching ID, allowing stale remote data to overwrite a newer local edit and failing to propagate deletions. Concurrent edits now add revision comparison and local/remote deletion markers, addressing that design directly. Those changes require the matching database migration and multi-device verification before this issue can be considered resolved.

Remaining concerns in the observed changes: failed remote deletes still only log an error, and `pushAllToRemote` does not replay the local deletion markers. Many Supabase errors are returned as values and logged without rejecting the synchronization promise. `runSync` can subsequently label the operation “synced.” The journal UI also labels the idle state “Synced.”

Complete the revision/deletion work with a persistent queue of pending operations and server-side protection against older writes replacing newer ones. Reconcile only acknowledged writes, expose failed/pending state accurately, and retry without losing local edits. Do not simply replace the entire cache with a remote snapshot: that would lose unsynced records.

Validate concurrent edits, offline edits followed by a poll, deletion on another device, rejected writes, reconnect, and account switching.

Evidence: [journal.ts](../blackjack/lib/blackjack/journal.ts), [sync.ts](../blackjack/lib/supabase/sync.ts), [SessionJournal.tsx](../blackjack/components/SessionJournal.tsx).

### 3. Preserve complete journal history

**Priority: high. Source-confirmed retention problem.**

Journal sessions and transactions are capped at 500 each; bankrolls are capped at 20. The initial implementation truncated by array position. Concurrent changes improve retention ordering by date and introduce pruning notifications, but still discard records beyond those limits. Adding session 501 can evict an older local session, and importing a large backup can displace existing history. Reports and exports then operate on an incomplete collection. For guests, the evicted local record has no cloud copy.

Keep complete durable history with paginated display and database reads. If a product limit is intentional, explain it and prevent destructive truncation. Imports should preview additions, duplicates, and conflicts and preserve the previous data if the import cannot complete.

Validate at 499, 500, and 501 records and with a backup larger than the existing collection. Career totals and exported history should remain complete.

Evidence: [journal.ts](../blackjack/lib/blackjack/journal.ts), [journalAnalysis.ts](../blackjack/lib/blackjack/journalAnalysis.ts).

### 4. Finish the light-theme migration

**Priority: high. Source-confirmed color conflict; rendered appearance still needs verification.**

The light theme defines dark text tokens, while the sidebar, privacy banner, and install/update notices retain hard-coded dark backgrounds. Global CSS remaps zinc and white text classes to those dark tokens. This produces dark text on dark surfaces outside the forced-dark game routes. Bright emerald text also remains on light panels: the declared emerald-400 and raised-paper colors have approximately 1.8:1 contrast.

Give dark surfaces their own foreground/background tokens or make them follow the selected theme. Replace broad utility-class overrides with semantic colors for body text, muted text, links, statuses, and actions. Apply the saved theme before first paint, including on the authentication screen; theme application currently lives inside the gated app shell.

Validate light, dark, and system themes across authentication, navigation, consent, forms, charts, and games. Measure rendered contrast after opacity and overlays are applied.

Evidence: [globals.css](../blackjack/app/globals.css), [AppShell.tsx](../blackjack/components/AppShell.tsx), [AnalyticsConsent.tsx](../blackjack/components/AnalyticsConsent.tsx).

### 5. Prevent stale Ultimate Texas Hold'em recommendations

**Priority: high. Source-confirmed asynchronous state mismatch.**

The analyzer accepts worker responses when their ID matches the latest calculation. Changing cards, stage, or dealer information clears the visible result but does not invalidate that request ID. Inputs remain editable during calculation, so an earlier hand's response can appear beneath a different hand.

Invalidate pending responses on every meaningful input change or bind each result to an immutable input snapshot. Add cancellation and worker-error recovery, and show which hand a result belongs to.

Validate by starting an expensive opening analysis, changing the hand, and allowing the original response to finish. That response must not become the current recommendation.

Evidence: [UTHLab.tsx](../blackjack/components/UTHLab.tsx), especially the worker callback, `clear`, and input handlers.

## Improve the experience across the site

| Area | Recommended improvement | Reason / evidence |
|---|---|---|
| Home and authentication | Add a public introduction with a prominent “Try a drill” action, a preview, and a concise explanation of account benefits. | The default experience is a sign-in form; guest access exists but follows sign-in, Google, sign-up, and password-reset actions. |
| Dashboard and onboarding | Offer beginner and experienced-user starting paths. Track completed actions rather than clicked links. | First-time recommendations emphasize Full Shoe. Onboarding marks a task done as soon as its link is visited, even if no drill, journal entry, or saved ramp is completed. |
| Practice and exams | Extend the existing skill lanes into a short recommended session, with difficulty, duration, and a relevant next drill. | There is already a useful range of drills and mastery tracking. A suggested sequence would reduce the choice burden without restricting experienced users. |
| Statistics | Filter trends by drill, rules, and date; show sample counts; distinguish “not measured” from zero. | The latest-20 chart mixes drill types. No recent attempts produces 0% accuracy, and no deck estimate can appear as 0.00 decks of error. Those states have different meanings. |
| Analyze landing | Add one sentence explaining the job of each tool and a suggested sequence. | Current cards largely say “Open tool.” Users need help choosing among the lab, recommender, simulator, comparison, and trip planner. |
| Analysis tools | Share a versioned scenario across lab, simulator, comparison, trip planner, and journal, with explicit overrides. | Some preset and simulator handoffs already exist, but defaults and state are still distributed across components. Expand those working handoffs rather than creating a second preset system. |
| Trip planner | Let users select the journal bankroll to import, and show its name and balance. | `useJournalBankroll` currently totals all journal sessions and transactions. Multiple bankrolls, including archived ones, can therefore be combined without a selection. |
| Game labs | Keep consistent Play / Strategy / Analyzer entry points and make modes linkable. Present calculation method and uncertainty beside the decision, with technical detail expandable. | DDM, Chase, and UTH already distinguish several exact and approximate methods; terminology and tab implementations vary. Preserve those distinctions. |
| Reference | Make charts directly accessible without guest selection, retain visible rule context, and support a compact print/share view with the selected rules. | Charts are an obvious entry point for visitors. The current authentication gate blocks their content initially. |
| Settings and accounts | Make account status and backup state easy to reach. Add a guided account-deletion request or self-service flow with export first. | Sync status is buried in settings/journal. Full account deletion currently requires an email request according to the privacy page. |
| Mobile | Coordinate consent, install, update, and action overlays; defer install promotion until after useful activity. | Install and update notices share position and z-index; consent and action docks add more fixed layers. Collision is a source-derived risk requiring device testing. |
| Admin analytics | Add clear freshness, partial-data, and consent-coverage indicators alongside existing analytics. | This is a proposed enhancement: distinguish a real usage change from unavailable or incomplete telemetry. Live admin data was not inspected. |

## Accessibility and navigation

The shared controls already provide many labels, visible focus styles, and sizeable tap targets. Complete that foundation:

- The closed mobile sidebar is moved offscreen with a transform but its links remain keyboard-focusable. Make the closed mobile drawer inert/hidden while preserving normal desktop navigation.
- The command palette declares itself modal but lacks a focus trap, focus restoration, and arrow-key result navigation. Add a visible close control and prevent interaction with the background.
- Shared and game-specific tabs use tab roles without the full keyboard and tab-panel relationships. Implement roving focus, arrow keys, and linked panels. Follow the [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- Consolidate modal behavior around the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). The existing confirmation modal provides a useful starting point but its focusable-element query should exclude disabled/hidden controls and handle initial focus safely.
- Replace links wrapping `<Button>` with a single styled link. Add a skip link and remove the nested `<main>` in the reference component.
- Use full suit names in accessible labels rather than “s,” “h,” “d,” and “c.” Announce calculation errors/completion and expose simulation progress semantically.

Evidence: [AppShell.tsx](../blackjack/components/AppShell.tsx), [ui.tsx](../blackjack/components/ui.tsx), [ConfirmModal.tsx](../blackjack/components/ConfirmModal.tsx), [StrategyChartPage.tsx](../blackjack/components/StrategyChartPage.tsx).

## Loading, search visibility, and maintainability

**Render useful public content.** The generated home and reference HTML contain no visible content headings because the authentication gate returns nothing while loading. All inspected routes have the same title, “CountLab · Blackjack Training.” Add public static content, route-specific titles/descriptions/canonicals, and a visible loading state for authenticated pages. Keep private workspaces out of the public discovery strategy. This is an export observation, not a claim about current search rankings.

**Load Full Shoe on first use.** The shell renders the dynamically imported game even when its wrapper is hidden. The privacy export actually includes the hidden game's markup. Mount it on first entry to Full Shoe, then preserve it as needed for session continuity. Measure resulting bundle and startup savings; no runtime performance score was measured here.

**Sync changes, not the whole journal.** `pushAllToRemote` uploads all cached journal sessions and transactions with 2.1 seconds between records on startup/sign-in. Five hundred records incur roughly 17.5 minutes of deliberate delay before network time. Use a durable queue of changed records and incremental reconciliation, and prevent overlapping sync runs.

**Consolidate route metadata.** Routes, area cards, command-palette entries, component mappings, and metadata are spread across files. A shared registry can prevent drift; the unused practice-area list still names the legacy proficiency-test route. Split unusually dense components, especially UTH, into readable state, worker, and presentation modules.

**Keep the existing release checks and add targeted coverage.** CI already runs unit tests, lint, end-to-end tests, and a production build. Extend coverage to account switching, multi-device synchronization, large imports, stale worker results, theme combinations, and keyboard navigation. The local build's missing Supabase configuration must be resolved before validating authentication and cloud sync.

## Suggested order

1. Account isolation, synchronization correctness, history retention, and stale analyzer results.
2. Theme/readability fixes and shared keyboard/overlay behavior.
3. Public home/reference experience, onboarding completion, and route metadata.
4. Shared scenarios, clearer statistics, and incremental loading/sync optimizations.

After implementation, validate the actual rendered site on desktop, narrow phones, iOS Safari, and Android Chrome, including offline/reconnect and two-account/two-device scenarios. The current source review cannot substitute for those checks.
