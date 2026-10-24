# CountLab design system and build rules

Read this before building any page. The goal: every screen feels like one
product, works one-handed on a 320px phone, and never contradicts another
screen about a blackjack decision.

## Stack

- Next.js 16 static export (`output: "export"`), App Router. Every route is a
  server `page.tsx` that renders one client feature component from
  `features/<area>/`. No server code, no API routes. `useSearchParams` needs a
  `<Suspense>` boundary.
- Tailwind 3 with the tokens below. No CSS-in-JS, no new dependencies.
- Icons: `lucide-react` only (`import { Timer } from "lucide-react"`), always
  `aria-hidden` unless the icon is the only label.
- Charts: `recharts` (already installed) for line/bar charts.

## Tokens (Tailwind class names)

| Purpose | Classes |
| --- | --- |
| Page / raised / inset surfaces | `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-3` |
| Text: primary / secondary / faint | `text-ink`, `text-ink-2`, `text-ink-3` |
| Hairlines | `border-line`, `border-line-strong`, `divide-line` |
| Brand (gold): primary buttons, anything about the count | `bg-brand text-brand-ink`, `text-brand-text` for gold text |
| Status | `text-pos` / `bg-pos`, `neg`, `warn`, `info` (use `/10` fills: `bg-pos/10`) |
| Blackjack actions | `ACTION_FILL[action]` from `@/components/blackjack/actions` (H grey, S red, D green, P blue, R violet) |
| Table felt (game screens) | `bg-felt`, `bg-felt-2` |

Light and dark are handled by the tokens: never write `dark:` variants or raw
hex colours in feature code (playing cards are the one exception, and they
live in `components/blackjack/PlayingCard.tsx`). Numbers that change or line
up get `tnum`. Section labels use `eyebrow`.

## Components

`@/components/ui`: `Button`, `ButtonLink`, `IconButton`, `Card`, `CardTitle`,
`PageHeader`, `Stat`, `Badge`, `Callout`, `EmptyState`, `ProgressBar`,
`Skeleton`, `Kbd`, `List`/`ListRow`, `Segmented`, `Toggle`, `Stepper`,
`TextField`, `SelectField`, `TextArea`, `Field`, `Tabs`, `Sheet` (bottom sheet
on phones, dialog on desktop), `ConfirmSheet`, `toast()`, `announce()`.

`@/components/blackjack`: `PlayingCard`, `CardRow`, `ActionPad` (H/S/D/P/R
buttons with keyboard keys), `ActionChip`, `NumberPad` + `AnswerDisplay`
(count entry with a real ± key), `TrayPhoto` (real discard-tray photos).

`@/components/drill/DrillKit`: `DrillSetup`, `SetupGroup`, `PresetPicker`,
`PlayFrame` + `PlayDock`, `Feedback`, `DrillSummary`, `ScoreDial`,
`MistakeList`, `ResumeBanner`, `formatClock`.

If you need something generic that is missing, build it inside your feature
folder first. Only add to `components/ui` when two features need it.

## Layout and mobile rules

- Design at 390px first, then check 320px and 1440px. No horizontal page
  scroll at 320px, ever. Wide tables scroll inside their own container.
- The shell provides the page gutter (16px phones, 24px tablet, 40px desktop)
  and clears the tab bar (`pb-tabbar`). Do not add outer padding.
- Tap targets are at least 44px tall. Inputs use 16px text (iOS zooms on
  smaller). Primary actions sit at the bottom on phones (thumb zone).
- Anything `fixed`/`sticky` to the bottom must clear the tab bar:
  `style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b))" }}`.
- Drills and the full-shoe table go full screen while playing: wrap play in
  `PlayFrame` (it turns on focus mode, which hides the tab bar and sidebar and
  sets `--tabbar-h` to 0). The setup and summary screens keep the chrome.
- One primary (gold) button per screen. Secondary actions use
  `variant="secondary"` or `ghost`.
- Use `Sheet` for edit forms and details instead of new pages.

## Copy

Plain, short, sentence case. Say "true count" in sentences ("TC" is fine in
dense UI like a HUD). Explain a term the first time it appears with one clause,
not a tooltip maze. Numbers: `+3`, `−1` (a real minus sign `−`), money with
the reader's own units. No exclamation marks, no "Oops".

## Data and state

- Saved settings: `useSettings()` from `@/lib/hooks/useSettings` gives
  `{ settings, ready, update }`. Table rules for strategy:
  `rulesFromSettings(settings)` from `@/lib/strategy`.
- Drill history: `storage.addSession(makeSession(drill, questions, correct,
  totalMs, bestStreak, mistakes, categories, metrics))` from
  `@/lib/statistics/storage`. Use the existing `DrillType` names so old history
  still shows: "Running Count", "True Count", "Deck Estimation",
  "Basic Strategy", "Deviations", "H17 Chart" (chart recall), "Full Shoe".
- Resume: `storage.saveProgress(drill, state)` / `storage.progress(drill)` /
  `storage.clearProgress(drill)`.
- Never write directly to `localStorage` for user data: the storage modules
  scope it per account and sync it.
- `useSessions(drill?)` from `@/lib/hooks/useSessions` for history.

## Strategy answers

Every hit/stand/double/split/surrender/insurance answer comes from
`@/lib/strategy`: `decideHand` for live hands, `cellDecision` for chart cells,
`takeInsurance`, `buildChart`, `indexList`, `countLadder`, `explainDecision`.
Do not reimplement strategy, and do not import the grids in
`lib/blackjack/strategyTables.ts` directly.

## Discard-tray photos

Real photos, never drawings. `TRAY_PHOTOS`, `trayPhotoFor(discarded)`,
`trayPhotosForShoe(decks)`, `drawTrayPhoto(decks, seen)` from
`@/lib/blackjack/deckPhotos`; render with `<TrayPhoto photo={...} />`. Each
photo's `discarded` is the decks in the tray; decks remaining is the shoe size
minus that.

## Accessibility

Every control has a visible or `aria-label` name. Live results go through
`announce()` or a `role="status"` region. Focus moves to the new heading when
a phase changes (the drill kit does this). Keyboard shortcuts never fire while
typing in an input. Respect reduced motion (global CSS already does).

## Analytics

`track(event, properties)` from `@/lib/analytics/track` accepts the existing
event names (`drill_started`, `drill_completed`, `running_count_answered`, …;
see the switch in that file). Never send emails, notes or exact money.

## Verify before you hand back

From `blackjack/`: `npx tsc --noEmit -p tsconfig.json`, `npm run lint`,
`npm test`, `npm run build`. Then serve the export
(`PORT=31xx node scripts/serve-export.mjs`) and screenshot your pages with
Playwright at 320, 390 and 1440px in light and dark
(`page.emulateMedia({ colorScheme: "dark" })`), and actually look at them.
