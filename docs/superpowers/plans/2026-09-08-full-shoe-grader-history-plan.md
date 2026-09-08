# Full Shoe grader strip + synced saved-shoe history

All paths below are relative to the `blackjack/` Next.js app directory unless
stated otherwise. Run commands from `blackjack/`.

## Goal

Two user-facing changes to the Full Shoe trainer:

1. **Grader strip.** The shoe report shows a compact grid of green/red tiles,
   one per round played. Clicking a tile opens that hand in the existing hand
   replayer, so a player can find the hands they misplayed without paging
   through every hand.
2. **Saved shoe history.** Every completed shoe is archived so the player can
   reopen an old shoe's report and replayer later. The archive syncs to
   Supabase so it survives a device change.

## Global Constraints

- **TDD is mandatory.** Write the failing test, watch it fail for the right
  reason, then write the minimal code to pass. Never write production code
  before its test.
- **Follow existing patterns.** `lib/blackjack/journal.ts` is the template for
  a local-first store that syncs to Supabase (`StorageLike` injection,
  validators that drop malformed records, versioned blob, change event,
  `push*` / `deleteRemote*` / `mergeRemote*` / `pushAllToRemote`).
  `lib/blackjack/simulationLibrary.test.ts` is the template for testing one
  (the `MemoryStorage` fake + the injectable `store` parameter).
- **Do not use `git commit -a` or `git add -A`.** The working tree carries
  unrelated uncommitted work on `lib/blackjack/deviations.ts`,
  `lib/blackjack/deviations.test.ts`, `components/FullShoeGame.tsx`, and
  `e2e/full-shoe-checkout.spec.ts`. Stage only the specific files your task
  changes, by path. Never revert or stash someone else's edits; if your task
  edits one of those files, keep the existing uncommitted changes intact and
  add yours alongside.
- **Verification before completion.** `npm run lint` must pass with zero
  warnings (`--max-warnings=0`) and `npm test` must pass. Paste real command
  output in your report; never claim a pass you did not observe.
- Match the surrounding code's style: terse, dense, comments only where the
  reasoning is non-obvious. No new dependencies.

## Data shapes

The archive record, split into a light header and a heavy body so sign-in
does not download every round of every shoe:

```ts
/** The light half — what the saved-shoes list renders from. Under ~1KB. */
export interface SavedShoeHeader {
  id: string;                  // crypto.randomUUID()
  savedAt: string;             // ISO timestamp
  mode: FullShoeMode;          // "coached" | "checkout"
  completionReason: "shoe-complete" | "ended";
  table: {
    decks: number;
    dealerHitsSoft17: boolean;
    surrenderRule: SurrenderRule;
    stacked: boolean;
    penetration: number;
  };
  report: FullShoeReport;      // from lib/blackjack/fullShoeSession
}

/** A header plus its rounds, when the rounds are available locally. */
export interface SavedShoe extends SavedShoeHeader {
  rounds?: FullShoeLiveRound[];
}
```

## Retention policy

- **Local:** keep full records (header + rounds) for the newest `MAX_SHOES = 25`
  shoes *or* `MAX_BYTES = 2_000_000` of serialized JSON, whichever binds
  first, evicting oldest-first.
- **Remote:** keep the newest `MAX_REMOTE_SHOES = 50` rows per user, pruned
  client-side after each save.
- A shoe aged out of local storage is still listed from its remote header and
  its rounds are fetched on demand when the player opens it.

---

## Task 1 — Data layer: `summarizeHandGrades`, `shoeLibrary`, and the Supabase table

Three independent pieces, all pure library/SQL work with no UI.

### 1a. `summarizeHandGrades` in `lib/blackjack/fullShoeSession.ts`

Add and export:

```ts
export interface HandGrade {
  /** Index into shoe.hands — what HandReplayer's selected index uses. */
  index: number;
  roundInShoe: number;
  /** Decisions graded for this hand. 0 means the hand was never graded. */
  graded: number;
  /** How many of those decisions were wrong. */
  errors: number;
}

export function summarizeHandGrades(hands: readonly SimulatedHand[]): HandGrade[];
```

One entry per hand, in the order given. `graded` is `hand.decisions?.length ?? 0`;
`errors` counts decisions with `ok === false`.

Tests to add to `lib/blackjack/fullShoeSession.test.ts` (write them first, one
`it` per behavior):

- A hand whose decisions are all `ok` reports `errors: 0` with `graded` equal to
  the decision count.
- A hand with a mix reports the exact count of `ok === false` decisions.
- A hand with `decisions` undefined, and a hand with `decisions: []`, both
  report `graded: 0, errors: 0` — these are ungraded, not passing.
- An empty hand list returns an empty array.
- `index` matches the hand's position in the input array, and `roundInShoe`
  carries through, including when `roundInShoe` does not equal `index + 1`.

### 1b. `lib/blackjack/shoeLibrary.ts`

New module, modeled closely on `lib/blackjack/journal.ts`.

Constants: `SHOES_KEY = "countlab:full-shoe-reviews:v1"`,
`SHOE_LIBRARY_EVENT = "countlab-shoe-library"`, `MAX_SHOES = 25`,
`MAX_BYTES = 2_000_000`, `MAX_REMOTE_SHOES = 50`.

Exported `shoeLibrary` object with:

- `event` — the change event name, like `simulationLibrary.event`.
- `shoes(store?): SavedShoe[]` — newest first by `savedAt`, malformed records
  dropped by a validator.
- `save(shoe: Omit<SavedShoe, "id" | "savedAt">, store?, now?): SavedShoe` —
  assigns id and `savedAt`, writes locally, pushes to Supabase, prunes remote.
- `loadRounds(id, store?): Promise<FullShoeLiveRound[] | undefined>` — returns
  the local rounds when cached; otherwise selects just that row's `rounds`
  from Supabase, caches them locally, and returns them. Returns `undefined`
  when unavailable (no local copy, not signed in, or the row is gone).
- `deleteShoe(id, store?)` — removes locally and remotely.
- `mergeRemoteHeaders(headers: SavedShoeHeader[], store?)` — merges remote
  headers into the local cache without re-pushing them, deduping by id,
  **preserving any locally cached `rounds` for ids present in both**, sorted
  newest-first, then capped by the retention policy.
- `pushAllToRemote(store?)` — uploads locally cached shoes to the just
  signed-in account, spacing writes like `journalLibrary.pushAllToRemote`
  does (the rate limit is 30 writes/minute for this table).
- `clear(store?)` — removes the local key and fires the event.

Enforcement details:

- **Retention** is applied on every write: take the newest `MAX_SHOES`, then
  drop from the oldest end while the serialized payload exceeds `MAX_BYTES`.
- **Quota recovery:** `localStorage.setItem` throws `QuotaExceededError` when
  the device is full. Catch it, drop the oldest half of the retained records,
  and retry once. A full disk must degrade to fewer saved shoes, never throw
  out of the end-of-shoe path.
- All Supabase calls go through `observeApiRequest` and are skipped when
  `getCurrentUser()` returns nothing, exactly as `journal.ts` does. Failures
  log via `console.error` and never reject into the caller.

Tests in `lib/blackjack/shoeLibrary.test.ts` using a `MemoryStorage` fake
copied in shape from `simulationLibrary.test.ts`. Cover at minimum:

- Saved shoes come back newest-first with the id and `savedAt` assigned.
- The count cap keeps the newest `MAX_SHOES` and drops the oldest.
- The byte budget evicts oldest-first when records are large enough to exceed
  `MAX_BYTES` before the count cap binds.
- A `QuotaExceededError` on the first `setItem` results in a smaller retained
  set being written rather than a thrown error (use a fake store that throws
  once, then succeeds).
- `deleteShoe` removes only the target.
- Malformed and partial records in the stored blob are dropped by `shoes()`
  rather than crashing it.
- `mergeRemoteHeaders` dedupes by id and keeps locally cached `rounds` for a
  shoe whose header also arrives from the server.
- `loadRounds` returns locally cached rounds without touching the network.

Supabase-dependent paths (`pushAllToRemote`, the remote half of `loadRounds`)
need no test — there is no Supabase test harness in this repo, and
`journal.ts`'s equivalents are likewise untested.

### 1c. `supabase/schema.sql`

Append, matching the file's existing idempotent style and section ordering
(table with the other tables, index with the indexes, RLS enable with the RLS
enables, policies with the policies, rate-limit function and trigger with
those, size cap with the size caps):

```sql
create table if not exists full_shoe_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  saved_at timestamptz not null default now(),
  mode text not null,
  completion_reason text not null,
  table_rules jsonb not null,
  report jsonb not null,
  rounds jsonb not null,
  created_at timestamptz not null default now()
);
```

Plus: `full_shoe_reviews_user_id_idx` on `(user_id)`; `enable row level
security`; the four owner-only policies named in the file's convention
(`"full_shoe_reviews owner select"` and so on for insert/update/delete);
an `rl_full_shoe_reviews()` function calling
`enforce_rate_limit('full_shoe_reviews_write', 30, interval '1 minute')` with
its `before insert` trigger, matching the other `rl_*` functions exactly
(`language plpgsql security definer set search_path = public`); and
`alter table full_shoe_reviews add constraint full_shoe_reviews_size_limit
check (pg_column_size(rounds) < 400000);` guarded by the same
`drop constraint if exists` line the other size caps use.

An index supporting the newest-first prune, `(user_id, saved_at desc)`, is
worth adding next to the user_id index.

---

## Task 2 — Sync wiring

- `lib/supabase/sync.ts`: `pullRemoteData` gains a `full_shoe_reviews` select
  in its existing `Promise.all`, selecting **headers only** — the column list
  must exclude `rounds`. Map rows to `SavedShoeHeader` (snake_case →
  camelCase, as the other mappers do) and pass them to
  `shoeLibrary.mergeRemoteHeaders`. `clearLocalUserData` also clears the shoe
  library. `pushLocalDataToRemote` also pushes it.
- `lib/statistics/storage.ts`: add `"countlab:full-shoe-reviews:"` to
  `BACKUP_KEY_PREFIXES` so the archive rides along in export/import backups.

Verification for this task is `npm run lint` and `npm test` — there is no
Supabase test harness, and `sync.ts` has no existing test file.

---

## Task 3 — UI: grader strip, report extraction, saved-shoes panel

### 3a. Grader strip in `components/HandReplayer.tsx`

Above the existing replayer grid, render a tile per hand from
`summarizeHandGrades(shoe.hands)`:

- Green when `graded > 0 && errors === 0`, red when `errors > 0`, neutral grey
  when `graded === 0`.
- Each tile shows the round number; red tiles also show the error count.
- The currently selected hand gets a visible ring.
- Clicking a tile sets `selectedHandIndex` — reuse the existing state, do not
  add a second selection path.
- Each tile is a real `<button>` with an `aria-label` naming the round and its
  result (for example `"Hand 7, 2 errors"`), keyboard reachable.
- A header line above the tiles reads `"<n> of <total> hands had errors"`, plus
  a short legend for the three colors.
- The whole block renders **only** when at least one hand has `graded > 0`.
  `HandReplayer` is shared with `SessionSimulator` and `SessionJournal`, whose
  shoes may carry no decisions; those must be visually unchanged.

Match the existing Tailwind vocabulary in this file (`emerald-300` for good,
`red-300` for bad, `zinc-500` for muted, `rounded-xl`, `border-white/[.06]`).
Tiles must wrap and stay usable at mobile widths; a 60-hand shoe should not
force horizontal page scroll.

### 3b. `components/ShoeReportView.tsx`

Extract the shoe-end report body currently inline in `components/FullShoeGame.tsx`
(the `phase === "shoe-end"` block: the five-stat grid, the three category
cards, and the `HandReplayer`) into a new component used by both the live
report and the saved-shoe review. Props: the `FullShoeReport`, the
`SimulatedShoe` to replay, the heading text, the subtitle line, and the
header actions to render. This is a pure move — the live report's rendered
output must not change.

### 3c. `components/FullShoeGame.tsx`

- `completeSession` also calls `shoeLibrary.save(...)` alongside the existing
  `storage.addSession(...)`, for both modes, recording the report built from
  the same score/rounds/elapsed/net inputs plus the table settings.
- The setup screen gains a "Saved shoes" `Panel`, rendered only when the
  archive is non-empty, listing each shoe's date, table rules, mode,
  accuracy, net result and hand count, with **Review** and **Delete** actions.
  Subscribe to `shoeLibrary.event` (and `hilo-storage`, as the file already
  does for settings) so the list refreshes when the archive changes.
- **Review** opens that shoe's report through `ShoeReportView` with a back
  action returning to setup. Rounds come from `shoeLibrary.loadRounds(id)`,
  which is async — show a loading state while it resolves, and a plain
  message if it resolves to `undefined`. Reuse
  `adaptLiveRoundsToSimulatedShoe` to build the replayer's shoe.
- **Delete** should confirm before destroying an archived shoe; the repo has
  `components/ConfirmModal.tsx` for this.

---

## Task 4 — End-to-end coverage

Extend `e2e/full-shoe-checkout.spec.ts`. Its first test already plays a
stacked shoe to completion after deliberately misplaying, which is the
fixture this needs. Note the file has uncommitted local changes — preserve
them and add alongside.

- After the shoe completes, the grader strip is visible, and the round that
  was deliberately misplayed has a tile marked as an error while a correctly
  played round's tile is not.
- Clicking that error tile opens that hand in the replayer (assert on the
  replayer's `Hand N of M` line or the decision-review content).
- Returning to setup shows the shoe in the saved-shoes list, and opening it
  from there shows the same report.

Follow the file's existing helpers and selector conventions. Run the spec and
paste real output; do not claim a pass you did not observe.
