import type { FullShoeLiveRound, FullShoeMode, FullShoeReport } from "./fullShoeSession";
import type { SurrenderRule } from "../statistics/storage";
import { supabase } from "../supabase/client";
import { getCurrentUser } from "../supabase/currentUser";
import { observeApiRequest } from "../analytics/api";

/** The light half — what the saved-shoes list renders from. Under ~1KB. */
export interface SavedShoeHeader {
  id: string;
  savedAt: string;
  mode: FullShoeMode;
  completionReason: "shoe-complete" | "ended";
  table: {
    decks: number;
    dealerHitsSoft17: boolean;
    surrenderRule: SurrenderRule;
    stacked: boolean;
    penetration: number;
  };
  report: FullShoeReport;
}

/** A header plus its rounds, when the rounds are available locally. */
export interface SavedShoe extends SavedShoeHeader {
  rounds?: FullShoeLiveRound[];
}

/**
 * What a caller hands to `save`. `rounds` is required here even though it is
 * optional on `SavedShoe`: the column is `not null`, and rounds are optional
 * only to model a header pulled from the server without its body.
 */
export type SavedShoeInput = Omit<SavedShoe, "id" | "savedAt" | "rounds"> & { rounds: FullShoeLiveRound[] };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredCollection<T> {
  version: 1;
  items: T[];
}

const SHOES_KEY = "countlab:full-shoe-reviews:v1";
const SHOE_LIBRARY_EVENT = "countlab-shoe-library";
export const MAX_SHOES = 25;
export const MAX_BYTES = 2_000_000;
const MAX_REMOTE_SHOES = 50;
/** Leave a margin below Supabase's 30 full_shoe_reviews-insert/minute limit when pushing a backlog. */
const PUSH_WRITE_INTERVAL_MS = 2_100;

const availableStorage = (): StorageLike | undefined => typeof window === "undefined" ? undefined : window.localStorage;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const FULL_SHOE_MODES: readonly FullShoeMode[] = ["coached", "checkout"];
const COMPLETION_REASONS: readonly SavedShoeHeader["completionReason"][] = ["shoe-complete", "ended"];
const SURRENDER_RULES: readonly SurrenderRule[] = ["none", "late", "early"];
const GRADING_CATEGORIES = ["Betting", "Basic Strategy", "Deviations"] as const;

const validTable = (value: unknown): value is SavedShoeHeader["table"] => {
  if (!value || typeof value !== "object") return false;
  const table = value as Partial<SavedShoeHeader["table"]>;
  return finite(table.decks)
    && typeof table.dealerHitsSoft17 === "boolean"
    && (SURRENDER_RULES as readonly string[]).includes(table.surrenderRule as string)
    && typeof table.stacked === "boolean"
    && finite(table.penetration);
};
const validCategoryStat = (value: unknown): value is { correct: number; total: number; accuracy: number } => {
  if (!value || typeof value !== "object") return false;
  const stat = value as Partial<{ correct: number; total: number; accuracy: number }>;
  return finite(stat.correct) && finite(stat.total) && finite(stat.accuracy);
};
const validReport = (value: unknown): value is FullShoeReport => {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<FullShoeReport>;
  return finite(report.accuracy)
    && finite(report.decisions)
    && finite(report.handsPlayed)
    && finite(report.durationMs)
    && finite(report.netResult)
    && Boolean(report.categories && typeof report.categories === "object"
      && GRADING_CATEGORIES.every((category) => validCategoryStat((report.categories as Record<string, unknown>)[category])));
};
const validHeader = (value: unknown): value is SavedShoeHeader => {
  if (!value || typeof value !== "object") return false;
  const header = value as Partial<SavedShoeHeader>;
  return typeof header.id === "string"
    && typeof header.savedAt === "string"
    && (FULL_SHOE_MODES as readonly string[]).includes(header.mode as string)
    && (COMPLETION_REASONS as readonly string[]).includes(header.completionReason as string)
    && validTable(header.table)
    && validReport(header.report);
};
const validRound = (value: unknown): value is FullShoeLiveRound => {
  if (!value || typeof value !== "object") return false;
  const round = value as Partial<FullShoeLiveRound>;
  return finite(round.round)
    && Array.isArray(round.dealerCards)
    && Array.isArray(round.playerHands)
    && finite(round.bet)
    && finite(round.runningCountBefore)
    && finite(round.trueCountBefore)
    && finite(round.netResult)
    && Array.isArray(round.decisions);
};
const validShoe = (value: unknown): value is SavedShoe => {
  if (!validHeader(value)) return false;
  const rounds = (value as Partial<SavedShoe>).rounds;
  return rounds === undefined || (Array.isArray(rounds) && rounds.every(validRound));
};

function read(store = availableStorage()): SavedShoe[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(SHOES_KEY) || "{}") as Partial<StoredCollection<unknown>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(validShoe);
  } catch {
    return [];
  }
}

const serializedSize = (items: SavedShoe[]) => JSON.stringify({ version: 1, items } satisfies StoredCollection<SavedShoe>).length;

/** Newest MAX_SHOES first, then drop from the oldest end while the payload exceeds MAX_BYTES. */
function retained(items: SavedShoe[]): SavedShoe[] {
  const sorted = [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_SHOES);
  let trimmed = sorted;
  while (trimmed.length > 0 && serializedSize(trimmed) > MAX_BYTES) trimmed = trimmed.slice(0, -1);
  return trimmed;
}

function write(items: SavedShoe[], store = availableStorage()) {
  if (!store) return;
  const next = retained(items);
  try {
    store.setItem(SHOES_KEY, JSON.stringify({ version: 1, items: next } satisfies StoredCollection<SavedShoe>));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "QuotaExceededError") throw error;
    // A full disk must degrade to fewer saved shoes, never throw out of the end-of-shoe save path.
    const shrunk = next.slice(0, Math.ceil(next.length / 2));
    try {
      store.setItem(SHOES_KEY, JSON.stringify({ version: 1, items: shrunk } satisfies StoredCollection<SavedShoe>));
    } catch (retryError) {
      console.error("[countlab] failed to persist full shoe review after quota recovery", retryError);
      return;
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHOE_LIBRARY_EVENT));
}

const createId = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function pushShoe(shoe: SavedShoe) {
  const user = getCurrentUser();
  if (!user || !shoe.rounds) return Promise.resolve();
  return observeApiRequest("supabase", "full_shoe_review_upsert", supabase
    .from("full_shoe_reviews")
    .upsert({
      id: shoe.id,
      user_id: user.id,
      saved_at: shoe.savedAt,
      mode: shoe.mode,
      completion_reason: shoe.completionReason,
      table_rules: shoe.table,
      report: shoe.report,
      rounds: shoe.rounds,
    }))
    .then(({ error }) => { if (error) console.error("[countlab] failed to sync full shoe review", error); });
}

function deleteRemoteShoe(id: string) {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "full_shoe_review_delete", supabase.from("full_shoe_reviews").delete().eq("id", id).eq("user_id", user.id)).then(({ error }) => {
    if (error) console.error("[countlab] failed to delete remote full shoe review", error);
  });
}

/** Keeps only the newest MAX_REMOTE_SHOES rows per user on the server, pruned client-side after each save. */
function pruneRemoteShoes() {
  const user = getCurrentUser();
  if (!user) return;
  observeApiRequest("supabase", "full_shoe_reviews_list_stale", supabase
    .from("full_shoe_reviews")
    .select("id")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false })
    .range(MAX_REMOTE_SHOES, MAX_REMOTE_SHOES + 500))
    .then(({ data, error }) => {
      if (error) return console.error("[countlab] failed to list remote full shoe reviews for pruning", error);
      const staleIds = ((data ?? []) as { id: string }[]).map((row) => row.id);
      if (staleIds.length === 0) return;
      observeApiRequest("supabase", "full_shoe_reviews_prune", supabase.from("full_shoe_reviews").delete().in("id", staleIds).eq("user_id", user.id))
        .then(({ error: deleteError }) => { if (deleteError) console.error("[countlab] failed to prune remote full shoe reviews", deleteError); });
    });
}

export const shoeLibrary = {
  event: SHOE_LIBRARY_EVENT,
  shoes(store?: StorageLike): SavedShoe[] {
    return [...read(store)].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  save(shoe: SavedShoeInput, store?: StorageLike, now = new Date()): SavedShoe {
    const record: SavedShoe = { ...shoe, id: createId(), savedAt: now.toISOString() };
    write([record, ...this.shoes(store)], store);
    pushShoe(record);
    pruneRemoteShoes();
    return record;
  },
  async loadRounds(id: string, store?: StorageLike): Promise<FullShoeLiveRound[] | undefined> {
    const cached = this.shoes(store).find((shoe) => shoe.id === id);
    if (cached?.rounds) return cached.rounds;
    const user = getCurrentUser();
    if (!user) return undefined;
    const { data, error } = await observeApiRequest("supabase", "full_shoe_review_rounds_select", supabase
      .from("full_shoe_reviews")
      .select("rounds")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle());
    if (error || !data) {
      if (error) console.error("[countlab] failed to load full shoe review rounds", error);
      return undefined;
    }
    const rounds = (data as { rounds: FullShoeLiveRound[] }).rounds;
    write(this.shoes(store).map((shoe) => shoe.id === id ? { ...shoe, rounds } : shoe), store);
    return rounds;
  },
  deleteShoe(id: string, store?: StorageLike) {
    write(this.shoes(store).filter((shoe) => shoe.id !== id), store);
    deleteRemoteShoe(id);
  },
  /** Merge headers pulled from Supabase into the local cache without re-pushing them, keeping any locally cached rounds. */
  mergeRemoteHeaders(headers: SavedShoeHeader[], store?: StorageLike) {
    const local = this.shoes(store);
    const localById = new Map(local.map((shoe) => [shoe.id, shoe]));
    const merged: SavedShoe[] = [
      ...headers.map((header) => ({ ...header, rounds: localById.get(header.id)?.rounds })),
      ...local.filter((shoe) => !headers.some((header) => header.id === shoe.id)),
    ];
    write(merged, store);
  },
  /** Pushes everything cached locally (e.g. from browsing as a guest) up to the newly signed-in account. */
  async pushAllToRemote(store?: StorageLike) {
    const shoes = this.shoes(store);
    for (let index = 0; index < shoes.length; index++) {
      await pushShoe(shoes[index]);
      if (index < shoes.length - 1) await wait(PUSH_WRITE_INTERVAL_MS);
    }
  },
  clear(store?: StorageLike) {
    const target = store ?? availableStorage();
    target?.removeItem(SHOES_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SHOE_LIBRARY_EVENT));
  },
};
