# Website improvements — September 12, 2026

Implemented in the local CountLab workspace. Existing journal and bankroll-health work was preserved and integrated. Nothing was published or applied to a live database.

## Changes

| Area | Implemented behavior |
| --- | --- |
| Account ownership | Guest and each account have separate local caches. Switching accounts resets mounted app state and invalidates pending work. Guest imports require an explicit choice in Settings. Unattributed legacy history is retained for deliberate recovery. |
| Journal sync | Local edits carry revisions; older remote copies cannot overwrite newer edits. Deleted records retain durable snapshots and retry until acknowledged, including deletion before first upload. Successful unchanged uploads are skipped. Database triggers reject stale updates and stale resurrection. |
| History | Removed the 500-session/transaction and 20-bankroll retention caps. Remote reads paginate beyond 1,000 rows. Browser storage capacity remains the practical local limit. |
| Settings and backups | Delayed settings reads preserve pending edits. Full backup imports preview counts, merge records, and restore prior storage if writing fails. Settings provides guest-history import, legacy recovery, and an account-deletion email draft. |
| First visit | Public home page, one-click guest drills, public reference charts and printable charts. Practice offers suggested beginner and experienced sessions. Onboarding checks completed actions instead of page visits. |
| Navigation and accessibility | Inert closed mobile drawer, focus containment and restoration, keyboard tool search, skip link, tab keyboard controls and panel associations, single-element button links, readable suit labels, semantic progress indicators. |
| Themes | Semantic foreground/background and status colors across the app, theme initialization before paint, consistent chrome, print styles. |
| Analysis | Saved Lab scenarios can be loaded into simulation, comparison, trip planning, and journal entry. Unsupported simulator rules are explained before loading. Trip planning uses a selected journal bankroll. |
| Statistics | Drill, time, and rule filters; single-drill trend comparisons; missing measurements shown explicitly. New Full Shoe records identify their actual table rules. |
| Games | Linkable mode tabs and cancellation/request checks that discard stale UTH calculations after input changes. |
| Notices and analytics | Install and update notices wait behind consent and avoid training/game routes. Install prompts require prior practice. Admin analytics identifies refresh time and incomplete data coverage. |
| Public exports and loading | Route-specific metadata and canonicals, public sitemap entries, useful public HTML, visible private-page loading state, and Full Shoe mounted only after first use. |

## Database release dependency

Apply [20260912_journal_revisions.sql](../blackjack/supabase/migrations/20260912_journal_revisions.sql) to the existing Supabase project before releasing this client. The same definitions are included in `supabase/schema.sql` for new installations.

The transaction adds `updated_at` and `deleted_at` to the three journal tables, backfills missing revisions from `created_at`, and installs triggers rejecting older updates. It retains existing rows and is rerunnable. Revision ordering uses device timestamps; substantially incorrect device clocks still need consideration when investigating a conflict.

The workspace has neither `NEXT_PUBLIC_SUPABASE_URL` nor `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured. Consequently, production database application, real authentication, and two-device synchronization were not exercised. Before deployment, use configured accounts to verify an offline edit/delete followed by reconnection, a sign-out during upload, and another account signing in on that device. Native iOS Safari and Android installation/offline behavior also need device testing; the automated mobile projects use Chromium emulation.

## Validation

Unit coverage includes account separation/migration, cancelled uploads, deletion before upload, failed-deletion retry, settings read races, revision merging, and histories exceeding the former cap. End-to-end coverage includes public guest access, keyboard search/tabs, delayed UTH responses, scenario handoff, statistics filtering, light/dark navigation contrast, and the existing journal, training, and chart flows.

Final checks: 601 unit tests passed; the full end-to-end suite passed 61 tests with 29 existing project-specific skips. Six guest/scenario checks were rerun after the final migration adjustment and passed. Lint, TypeScript/production build, and whitespace validation passed. Exported home, practice, reference, privacy, and terms pages contain public headings and their own titles/canonicals, without hidden Full Shoe markup. No runtime speedup, complete accessibility certification, or live-cloud result is claimed from these local checks.
