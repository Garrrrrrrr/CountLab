import { supabase } from "@/lib/supabase/client";
import { listAdminLocations } from "./admin";
import type { DirectoryFilters, DirectoryGame, DirectoryLocation, DirectorySearchLocation } from "./types";

export interface PrivateDirectoryData {
  locations: DirectoryLocation[];
  games: DirectoryGame[];
}

export async function loadPrivateDirectory(): Promise<PrivateDirectoryData> {
  const [locations, games] = await Promise.all([
    listAdminLocations(),
    (async () => {
      const rows: DirectoryGame[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await supabase.from("directory_games").select("*")
          .is("deleted_at", null).order("id").range(offset, offset + 199);
        if (error) throw error;
        rows.push(...((data ?? []) as DirectoryGame[]));
        if (!data || data.length < 200) return rows;
      }
    })(),
  ]);
  return { locations, games };
}

function gameMatches(game: DirectoryGame, filters: DirectoryFilters): boolean {
  return (!filters.game_type || game.game_type === filters.game_type)
    && (filters.decks == null || game.decks === filters.decks)
    && (filters.min_bet_max == null || game.min_bet != null && game.min_bet <= filters.min_bet_max)
    && (!filters.currency || game.currency === filters.currency)
    && (!filters.soft_17 || game.soft_17 === filters.soft_17)
    && (!filters.payout || game.payout === filters.payout)
    && (filters.double_after_split == null || game.double_after_split === filters.double_after_split)
    && (!filters.surrender || game.surrender === filters.surrender)
    && (filters.min_penetration == null || game.decks != null && game.decks > 0 && game.decks_cut != null
      && (game.decks - game.decks_cut) / game.decks >= filters.min_penetration)
    && (!filters.mid_shoe_entry || game.mid_shoe_entry === filters.mid_shoe_entry)
    && (!filters.reported_since || [game.reported_month, game.verified_at?.slice(0, 10)]
      .filter((date): date is string => !!date).some((date) => date >= filters.reported_since!));
}

function distanceKm(location: DirectoryLocation, filters: DirectoryFilters): number | null {
  if (location.coordinate_quality !== "verified" || location.latitude == null || location.longitude == null
    || filters.latitude == null || filters.longitude == null) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (location.latitude - filters.latitude) * radians;
  const longitudeDelta = (location.longitude - filters.longitude) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(filters.latitude * radians)
    * Math.cos(location.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function searchPrivateDirectory(data: PrivateDirectoryData, filters: DirectoryFilters, sort = "name"): DirectorySearchLocation[] {
  const byLocation = new Map<string, DirectoryGame[]>();
  for (const game of data.games) {
    if (game.deleted_at) continue;
    const list = byLocation.get(game.location_id) ?? [];
    list.push(game);
    byLocation.set(game.location_id, list);
  }
  const query = filters.q?.trim().toLocaleLowerCase();
  const filterGames = filters.game_type || filters.decks != null || filters.min_bet_max != null || filters.currency
    || filters.soft_17 || filters.payout || filters.double_after_split != null || filters.surrender
    || filters.min_penetration != null || filters.mid_shoe_entry || filters.reported_since;
  const results = data.locations.flatMap((location) => {
    if (location.deleted_at) return [];
    if (query && ![location.name, location.city, location.country, location.subdivision, location.operator, ...location.aliases]
      .some((value) => value?.toLocaleLowerCase().includes(query))) return [];
    const games = byLocation.get(location.id) ?? [];
    if (filterGames && !games.some((game) => gameMatches(game, filters))) return [];
    const currencyMinimums = filters.currency ? games.filter((game) => game.currency === filters.currency && game.min_bet != null)
      .map((game) => game.min_bet!) : [];
    const reportedMonths = games.map((game) => game.reported_month).filter((date): date is string => !!date);
    const result: DirectorySearchLocation = {
      ...location,
      game_count: games.length,
      earliest_min_bet: currencyMinimums.length ? Math.min(...currencyMinimums) : null,
      latest_reported_month: reportedMonths.length ? reportedMonths.sort().at(-1)! : null,
      distance_km: distanceKm(location, filters),
    };
    return [result];
  });
  const compareNullable = (first: number | string | null | undefined, second: number | string | null | undefined, descending = false) => {
    if (first == null) return second == null ? 0 : 1;
    if (second == null) return -1;
    return (first < second ? -1 : first > second ? 1 : 0) * (descending ? -1 : 1);
  };
  results.sort((first, second) => {
    const primary = sort === "report_date" ? compareNullable(first.latest_reported_month, second.latest_reported_month, true)
      : sort === "min_bet" ? compareNullable(first.earliest_min_bet, second.earliest_min_bet)
      : sort === "distance" ? compareNullable(first.distance_km, second.distance_km) : 0;
    return primary || first.name.localeCompare(second.name) || first.id.localeCompare(second.id);
  });
  return results;
}
