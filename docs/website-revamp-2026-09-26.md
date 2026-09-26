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
