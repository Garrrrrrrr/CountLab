# Game directory implementation plan

Prepared September 22, 2026. Scope: implementation design and delivery notes.

Implementation status: the directory UI, admin workflows, importer, database migration, and tests described below are now implemented in the repository. The migration and staged CBJN data still require review and deployment to the target Supabase project before records can be published.

Build a searchable casino and game directory in CountLab, initially seeded from `original_132.pdf`, with complete location and game management for existing admins. Use Supabase as the shared database and MapLibre GL JS with MapTiler for maps and address search.

Confirmed access: everyone can browse published records without signing in; existing admins can manage all records.

## 1. Findings that shape the implementation

- CountLab is a Next.js static export deployed to GitHub Pages. Supabase already provides authentication, an `admin_users` allowlist, the `is_admin()` SQL function, and a `useIsAdmin()` UI hook. Reuse these.
- Routes are explicitly generated in `blackjack/lib/routes.ts` and rendered through `blackjack/components/DynamicPage.tsx`. New locations must appear from database reads without requiring a website build.
- The existing `AuthGate` uses `isPublicRoute()` to allow browsing without login. Add `/directory` there and enforce admin editing in the database as well as the UI.
- The supplied PDF has 55 pages: introductory material and definitions on pages 1-2, listings on pages 3-52, a rule key on page 54, and operator abbreviations on page 55. Listings cover the United States, Canada, and the Bahamas. The report has extractable text, so OCR should be unnecessary except as a fallback for extraction defects.
- Individual casinos have multiple game offerings. Each row represents a group of tables with particular rules and limits, rather than one physical table.
- The issue is dated September 2026, but regional report dates range back to August 2025. Import time must never become a false verification date.
- `cut` means decks remaining undealt. Store this original measurement and derive penetration as `(decks - cut) / decks`. For example, six decks with a 1.5-deck cut means 75% penetration.
- Regional notes affect interpretation. Alberta's described no-hole-card procedure loses only original bets to dealer blackjack; this differs from the legend's ENHC rule, under which added double/split wagers also lose. Preserve both dealer procedure and wager treatment.
- The report includes Spanish 21 and excludes 6:5, continuous shuffler games, and many variants. Absence from this source does not establish that a casino has no such games.
- Page 2 identifies the material as private use and restricts resale without written permission. Resolve permission for public website publication before publishing the imported dataset. The plan and import preparation can proceed while that is resolved.

The repository changes are ready for Supabase review and deployment. The supplied CBJN source remains private and imported rows remain drafts until publication permission and admin review are complete.

## 2. User experience

Add **Game Directory** to the Analyze area, navigation, and tool search.

Use `/directory/` for browsing and `/directory/?location=<uuid>` for shareable location details. Add `/admin/directory/` for management, with query parameters for a selected location or import. These fixed routes work with the current static host and allow newly added locations to work immediately.

Desktop: searchable results alongside a map. Mobile: list/map toggle with a detail sheet. The list remains fully usable if map loading fails or geolocation is declined.

The first release includes:

- Search by casino name, alternate name, city, state/province, or country.
- Filters for game type, deck count, table minimum and currency, H17/S17, payout, DAS, surrender, penetration, mid-shoe entry, and report freshness.
- Sort by name, distance when available, minimum within a selected currency, and report date. Avoid calling a game "best" based only on house edge or penetration.
- One map marker per location, clustered when zoomed out. The map and results use the same filters. Multiple rule filters must match the same game offering at a casino.
- Casino details with address, directions, operational status, reported conditions, and a table of distinct game offerings. Each game shows applicable source/report date and any later verification date.
- Expandable explanations of rule abbreviations, variable penetration, unusual wager restrictions, and unknown fields.
- A configurable stale-data indicator, initially after six months from the reported month or last actual verification. Show "Reported Aug 2026" when only a month is known.
- Separate "not listed in this source", "no currently reported games", and "closed" states. Casino operating status, game availability, and publication status are separate concepts.

Maintain query filters in the URL. Request device location only when the user selects "Near me"; keep the device coordinates in memory for this interaction.

## 3. Admin workflows

Every existing admin can add, edit, delete, restore, and manage games at any location, regardless of who created it.

**Add location:** search by venue name/address, choose a candidate, verify its address and map pin, and enter game details. Always provide manual name/address/coordinate entry and pin placement, so additions work even when the provider lacks the venue or is unavailable. Coordinates may remain unverified; such records can appear in the list without an exact map marker.

**Edit location or games:** edit the location profile independently of its game rows. Add multiple games, copy an existing game as a starting point, mark availability, and save as draft or publish. Validate on the server. Use a version number to detect another admin's intervening edit and offer reload/reconciliation instead of silently overwriting it.

**Delete:** offer an explicit Delete action for a game or an entire location. Confirm the location name and number of affected games. Default to a recoverable deletion which immediately removes it and its games from reader results. Provide an admin Trash view to restore or permanently delete records. A transactional purge deletes child records safely while retaining a minimal audit event. A closed casino can instead retain its historical record using operating status.

**Review:** show queues for incomplete imports, ambiguous geocoding, unknown rule tokens, possible duplicates, and old reports. Provide an edit history with actor, time, change reason, and before/after values.

Keep raw imported commentary and internal admin notes in admin-only storage. Publish reviewed notes suitable for readers; keep report dates and attribution attached. Imported editorial claims should not silently become verified CountLab assertions.

## 4. Data model

Use stable UUIDs. Keep filtering fields typed; use JSON only for flexible extra rules and source payloads.

| Entity | Main contents |
| --- | --- |
| `directory_locations` | Name, aliases, operator, country, subdivision, city, address, website, coordinates, coordinate quality/source, operating status, publication status, timestamps, version, deletion timestamp |
| `directory_games` | Location FK, game type, table count, decks, decks cut, minimum/maximum, currency, payout, H17/S17, doubling rules, split rules, surrender mode, dealer procedure, dealer-blackjack wager treatment, entry restrictions, dealing/shuffle method, reported house edge percent, availability, publication status, version |
| `directory_sources` | Source type, issue/report label, issue month, file hash or source URL, publication clearance/audience metadata; source files and evidence remain private |
| `directory_observations` | Source and location/game references, reported month/day with precision, imported-at and actually-verified-at fields, source page/row, normalized original values, provenance of inferred defaults |
| `directory_notes` | Location/game references, note category, text, provenance and audience; separate admin notes from reader notes through RLS or dedicated private tables |
| `directory_import_batches` / `directory_import_rows` | File hash, parser version, staged rows, validation problems, reconciliation decisions, reviewer and import outcome |
| `directory_audit_log` | Database-generated actor, timestamp, action, record references, reason and before/after snapshot; admins can read, clients cannot rewrite history |

Games need nullable fields for genuinely unknown information. CBJN defaults can populate values only when the source's documented baseline applies. For example, its ordinary blackjack baseline pays 3:2 and disallows DAS unless overridden. Manual entries and future data sources must not automatically inherit those assumptions.

Store surrender as an enum covering late, early, early-except-ace, mixed exceptions, none, and unknown. Store split limits and resplitting aces separately. Preserve special rules that current calculators cannot represent. Keep `Spanish 21` distinct from conventional blackjack.

Store `reported_house_edge_pct` explicitly as percentage points: `0.40` means 0.40%, not 40%. Do not present it as a newly calculated edge or a player's counting advantage.

Use currency codes and preserve uncertain or multiple accepted currencies. Geography alone is insufficient where notes describe cross-border or dual-currency play. Source grouping areas may also differ from the casino's actual municipality; keep both when useful.

Database checks cover coordinate bounds, paired latitude/longitude, valid monetary ranges, nonnegative table counts, deck/cut consistency, allowed statuses, and foreign keys. Publishing requires resolved mandatory fields, valid provenance, and appropriate source clearance. Historical source observations remain unchanged when admins edit current records.

## 5. Import process

1. Read the PDF locally; record its hash, issue label, and parser version. Keep the PDF and full extracted dataset outside git and the static output. Add explicit ignore entries during implementation. The publisher also mentions an Excel edition, which can be supported for future imports; the supplied PDF is sufficient for this first pipeline.
2. Extract words with coordinates and font information. Parse column positions and bold casino headings; do not split plain text on whitespace alone. Handle Las Vegas's different layout, repeated location prefixes, truncated row names, and headings/records continuing onto the next page.
3. Parse pages 3-52 into staged locations and games. Carry regional date and note context across pages. Use the rule key and operator legend for normalization. Review introductory updates for exceptions; do not import the reporter list or general advertisements as directory records.
4. Retain full heading names and aliases for clipped names. Record every candidate row as imported, rejected with a reason, or awaiting review. Produce page/region totals and a reconciliation report; do not claim a reliable location count before this pass.
5. Apply source-specific baseline rules, then explicit row overrides and applicable regional exceptions. Preserve the raw rule string privately. Unknown tokens, ambiguous dates/currencies, and extraction failures enter review instead of receiving guessed values.
6. Match against existing locations using name/aliases, actual address, and region. Warn on similar nearby venues. Never merge casinos solely because they share a brand. Geocode each new location once, with regional context; require review of ambiguous candidates. A city-center coordinate is not an exact casino position.
7. Preview changes in the admin import screen: new locations/games, changed values, unchanged rows, conflicts, and unresolved rows. The initial seed stays unpublished until reviewed. Reconcile all pages, visually inspect each layout and region, and check every flagged case.
8. Commit approved changes transactionally with audit events and an import-batch reference. Import identity uses source hash plus stable source-row identifiers so rerunning a file creates no duplicates. Subsequent issues propose updates against the prior source observation, preserving intervening admin changes for explicit resolution.
9. Never delete records just because they are absent from a later issue. Rollback a batch only where the imported version is still current; otherwise surface conflicts so rollback cannot erase later admin work.

## 6. Maps recommendation

Use **MapLibre GL JS** as the renderer and **MapTiler Cloud** for map tiles and place/address search. Use ordinary Google Maps directions links from CountLab's stored coordinates or address.

This suits a directory whose records and coordinates need to persist. MapLibre supports point clustering. MapTiler documents permanent geocoding storage for most use cases and permits exported search results, subject to its terms and attribution requirements. Google Places imposes storage and display restrictions, which adds complexity if used as the directory's persistent venue database.

Serve map/search requests directly to MapTiler from the browser, with domain-restricted browser keys, debounced searches, provider quotas, and usage monitoring. Its current terms require a custom agreement for proxying end-user traffic, so do not introduce a Supabase proxy by default. A browser key is public; hiding the search UI from non-admins is not credential security. Use the documented batch-geocoding workflow for the initial import.

Keep provider identity and attribution with geocoded coordinates, and isolate the provider behind a small adapter. Only re-geocode after an address change or an explicit admin request. Lazy-load the map bundle. No tile bulk downloads or offline map package in the first release.

Select a production plan after checking expected traffic and whether the site's use qualifies for it. The current free offering is described for prototyping/personal/noncommercial use; do not assume production use is free. Cost depends on the chosen rendering integration's tile requests or sessions plus search usage and Supabase traffic.

Sources checked September 22, 2026:

- [MapLibre clustering example](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/)
- [MapTiler geocoding and permanent-storage FAQ](https://www.maptiler.com/search/)
- [MapTiler Cloud terms](https://www.maptiler.com/terms/cloud/)
- [MapTiler pricing](https://www.maptiler.com/cloud/pricing/)
- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

## 7. Access and application integration

Use Supabase RLS to enforce reader and admin access even for direct REST/API requests. Anonymous visitors, guests, and authenticated readers see published, undeleted records and reader-visible notes only; games must also have a visible parent location. Admins can manage every location/game. Import staging, raw source data, private notes, drafts and audit history remain admin-only. Nobody gains admin status through directory forms.

Mark `/directory` public in `isPublicRoute()` so browsing and public route metadata work without login. Keep `/admin/directory` private. The directory landing page can be indexed; query-based casino details are shareable but do not provide separately pre-rendered SEO pages. Dedicated indexed casino URLs can be a later hosting/rendering enhancement if desired.

Use server transactions/RPCs for multirow edits, delete/restore/purge, and import application. Check `is_admin()` inside privileged functions, lock down execution grants, fix their search path, and derive actor/timestamps from the session/database. Ordinary row operations can use RLS directly. Use database triggers for audit creation so API calls cannot bypass it. Service-role credentials must never enter the browser bundle.

Use paginated database queries and indexes for location search and common game filters. A shared query path must drive list counts and marker data; fetch lightweight markers separately from full game details. Add PostGIS if implementing indexed radius/viewport queries in the first release, and use actual distance only for verified coordinates. Bound result sizes and debounce map movement.

The static host needs no Next.js API routes. Supabase owns live data and write enforcement. Clear private admin state on sign-out and avoid persistent directory storage for the first release. The current service worker ignores cross-origin requests; preserve that behavior for Supabase and map services. Offline mode shows that live directory data is unavailable rather than presenting stale conditions as current.

Proposed files and touchpoints:

| Area | Files |
| --- | --- |
| Routes/navigation | `blackjack/lib/routes.ts`, `blackjack/components/DynamicPage.tsx`, `blackjack/components/AppShell.tsx` |
| Reader UI | New `blackjack/components/directory/` components for list, filters, details and map |
| Admin UI | New admin directory, location editor, game editor, import review and Trash components |
| Shared domain/data | New `blackjack/lib/directory/` types, validation, queries, rule labels, source normalization and map adapter |
| Database | A versioned SQL migration plus corresponding updates to `blackjack/supabase/schema.sql` |
| Import | Local parser and validation scripts under `blackjack/scripts/directory/`; private scratch inputs/outputs |
| Configuration | Map browser key in build configuration and `.github/workflows/deploy.yml`; usage limits in provider console |
| Verification | Import/domain tests, database permission tests, and Playwright directory flows |

Read the installed Next.js guides required by `blackjack/AGENTS.md` before implementing UI changes.

## 8. Delivery sequence and acceptance

| Phase | Deliverable | Completion condition |
| --- | --- | --- |
| 1. Foundation | Schema, policies, query helpers, public directory shell, admin editors | Everyone can browse published records; admins can create/edit/delete/restore locations and games; direct non-admin writes are rejected |
| 2. Seed preparation | PDF parser, rule normalization, staged import and review | Every candidate listing is reconciled; ambiguities are visible; duplicate import is harmless |
| 3. Directory and maps | Search, filters, location details, map, geocoding and manual additions | Desktop/mobile work; a new casino is immediately accessible through a shared URL without deployment |
| 4. Release validation | Reviewed initial seed, production configuration, deployment checks | Intended publication rights resolved, import approved, RLS tests pass and deployed flows work |
| 5. Tool integration | "Analyze this game" and links into saved scenarios, trip planning and journal | Supported rules transfer faithfully; unsupported rules are clearly identified rather than silently changed |

Test the meaningful failure cases:

- Anonymous, guest, member, and admin direct API reads/writes, including draft/deleted child records and private notes.
- Cross-admin editing, stale version conflicts, transactional multirow save, location deletion with games, restore, and permanent removal.
- Repeated imports, identical brand names in different cities, split-page records, old report months, missing currency, and unusual rule tokens.
- Cut conversion, percentage units, Alberta original-bet treatment, Spanish 21, mixed surrender modes, and Winnipeg-style wager constraints.
- All game filters applying to the same offering; list/map consistency; pagination; missing coordinates; denied geolocation; map/provider errors.
- Direct links to a newly created location after a browser refresh on the static deployment; deleted/unknown IDs show a useful unavailable state.
- No source PDF, private import output, service-role secret, or admin-only note in build artifacts or anonymous responses.

Run the repository's existing test, lint, build and end-to-end gates, plus database policy tests against a test Supabase environment. Preserve existing analytics and training flows.

Defer user submissions, community ratings, photographs, automatic recurring imports, and route optimization until the admin-maintained directory is reliable. Keep later calculator integration behind a compatibility adapter: an imported casino edge is not enough to produce a valid counting EV estimate, and regional rules must not be coerced into unsupported calculator settings.
