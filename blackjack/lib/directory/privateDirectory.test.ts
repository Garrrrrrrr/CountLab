import { describe, expect, it } from "vitest";
import { searchPrivateDirectory } from "./privateDirectory";
import type { DirectoryGame, DirectoryLocation } from "./types";

const location = {
  id: "private-casino", name: "Private Casino", aliases: [], operator: null,
  country: "US", subdivision: "NV", city: "Reno", address: null, website: null,
  latitude: 39.5296, longitude: -119.8138, coordinate_quality: "approximate", coordinate_source: "test",
  operating_status: "open", game_availability: "reported", publication_status: "draft",
  published_at: null, version: 1, deleted_at: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
} as DirectoryLocation;
const game = (id: string, overrides: Partial<DirectoryGame> = {}) => ({
  id, location_id: location.id, game_type: "blackjack", decks: 6, min_bet: 25,
  currency: "USD", payout: "3:2", soft_17: "H17", reported_month: "2026-09-01",
  publication_status: "draft", deleted_at: null, ...overrides,
}) as DirectoryGame;

describe("private directory search", () => {
  it("shows draft locations and their games to the admin view", () => {
    const rows = searchPrivateDirectory({ locations: [location], games: [game("one")] }, {});
    expect(rows).toMatchObject([{ id: location.id, game_count: 1, coordinate_quality: "approximate" }]);
  });

  it("requires all rule filters to match the same game", () => {
    const data = { locations: [location], games: [game("one"), game("two", { payout: "6:5", min_bet: 5 })] };
    expect(searchPrivateDirectory(data, { payout: "3:2", min_bet_max: 10 })).toHaveLength(0);
    expect(searchPrivateDirectory(data, { payout: "3:2", min_bet_max: 30 })).toHaveLength(1);
  });

  it("excludes deleted locations and games", () => {
    const data = { locations: [location], games: [game("one", { deleted_at: "2026-09-22T00:00:00Z" })] };
    expect(searchPrivateDirectory(data, { payout: "3:2" })).toHaveLength(0);
    expect(searchPrivateDirectory({ ...data, locations: [{ ...location, deleted_at: "2026-09-22T00:00:00Z" }] }, {})).toHaveLength(0);
  });
});
