import type { DirectoryGame, DirectoryLocation, DirectoryNote } from "./types";
import type { PrivateDirectoryData } from "./privateDirectory";

type StagedLocation = Partial<DirectoryLocation> & { source_location_key: string; name: string; country: string; city: string; source_notes?: string[] };
type StagedRow = { source_row_key: string; normalized_location: StagedLocation; normalized_game: Partial<DirectoryGame> };
type StagedFile = { source?: { publication_clearance?: string }; locations?: StagedLocation[]; rows?: StagedRow[] };

export interface LocalPreview extends PrivateDirectoryData {
  details: Record<string, { location: DirectoryLocation; games: DirectoryGame[]; notes: DirectoryNote[] }>;
}

export function parseLocalPreview(value: unknown): LocalPreview {
  const staged = value as StagedFile;
  if (!staged || staged.source?.publication_clearance !== "private" || !Array.isArray(staged.locations) || !Array.isArray(staged.rows)) {
    throw new Error("Choose the private casino staging JSON file.");
  }
  const now = new Date().toISOString();
  const locations: DirectoryLocation[] = staged.locations.map((item) => {
    if (!item.source_location_key || !item.name || !item.city || !item.country) throw new Error("A casino is missing its source key or location.");
    const latitude = typeof item.latitude === "number" && Number.isFinite(item.latitude) ? item.latitude : null;
    const longitude = typeof item.longitude === "number" && Number.isFinite(item.longitude) ? item.longitude : null;
    return {
      id: `local:${item.source_location_key}`, name: item.name, aliases: item.aliases ?? [], operator: item.operator ?? null,
      country: item.country, subdivision: item.subdivision ?? null, city: item.city, address: item.address ?? null,
      website: item.website ?? null, latitude, longitude,
      coordinate_quality: latitude != null && longitude != null && item.coordinate_quality === "verified" ? "verified" : "unknown",
      coordinate_source: item.coordinate_source ?? null, operating_status: item.operating_status ?? "open",
      game_availability: item.game_availability ?? "reported", publication_status: "draft", published_at: null,
      version: 1, deleted_at: null, created_at: now, updated_at: now,
    };
  });
  const byId = new Map(locations.map((location) => [location.id, location]));
  if (byId.size !== locations.length) throw new Error("The staging file has duplicate casino keys.");
  const details: LocalPreview["details"] = Object.fromEntries(locations.map((location, index) => [location.id, {
    location, games: [], notes: (staged.locations![index].source_notes ?? []).filter((note) => typeof note === "string").map((body, noteIndex) => ({
      id: `${location.id}:note:${noteIndex}`, location_id: location.id, game_id: null, category: "source",
      body, audience: "admin", reported_month: null, created_at: now,
    })),
  }]));
  const games: DirectoryGame[] = staged.rows.map((row) => {
    const locationId = `local:${row.normalized_location?.source_location_key}`;
    if (!row.source_row_key || !byId.has(locationId)) throw new Error("A game row does not match a casino in this file.");
    const game: DirectoryGame = {
      id: `local:${row.source_row_key}`, location_id: locationId, game_type: row.normalized_game.game_type ?? "blackjack",
      table_count: row.normalized_game.table_count ?? null, decks: row.normalized_game.decks ?? null,
      decks_cut: row.normalized_game.decks_cut ?? null, min_bet: row.normalized_game.min_bet ?? null,
      max_bet: row.normalized_game.max_bet ?? null, currency: row.normalized_game.currency ?? null,
      payout: row.normalized_game.payout ?? null, soft_17: row.normalized_game.soft_17 ?? null,
      double_rules: row.normalized_game.double_rules ?? null, double_after_split: row.normalized_game.double_after_split ?? null,
      max_split_hands: row.normalized_game.max_split_hands ?? null, resplit_aces: row.normalized_game.resplit_aces ?? null,
      surrender: row.normalized_game.surrender ?? null, dealer_procedure: row.normalized_game.dealer_procedure ?? null,
      dealer_blackjack_wager_treatment: row.normalized_game.dealer_blackjack_wager_treatment ?? null,
      mid_shoe_entry: row.normalized_game.mid_shoe_entry ?? null, dealing_method: row.normalized_game.dealing_method ?? null,
      shuffle_method: row.normalized_game.shuffle_method ?? null, reported_house_edge_pct: row.normalized_game.reported_house_edge_pct ?? null,
      availability: row.normalized_game.availability ?? "reported", publication_status: "draft",
      reported_month: row.normalized_game.reported_month ?? null, verified_at: row.normalized_game.verified_at ?? null,
      extra_rules: row.normalized_game.extra_rules ?? null, version: 1, deleted_at: null, created_at: now, updated_at: now,
    };
    details[locationId].games.push(game);
    return game;
  });
  return { locations, games, details };
}
