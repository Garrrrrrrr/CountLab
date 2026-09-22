import { supabase } from "@/lib/supabase/client";
import type { DirectoryFilters, DirectoryGame, DirectoryLocation, DirectoryNote, DirectorySearchLocation } from "./types";

export const DIRECTORY_PAGE_SIZE = 30;

export async function searchDirectory(filters: DirectoryFilters, page = 0, sort = "name"): Promise<{ total: number; locations: DirectorySearchLocation[] }> {
  const { data, error } = await supabase.rpc("directory_search", {
    p_filters: filters,
    p_limit: DIRECTORY_PAGE_SIZE,
    p_offset: page * DIRECTORY_PAGE_SIZE,
    p_sort: sort,
  });
  if (error) throw error;
  const result = data as { total?: number; locations?: DirectorySearchLocation[] } | null;
  return { total: result?.total ?? 0, locations: result?.locations ?? [] };
}

export async function getDirectoryLocation(id: string): Promise<{ location: DirectoryLocation; games: DirectoryGame[]; notes: DirectoryNote[] } | null> {
  const { data: location, error: locationError } = await supabase.from("directory_locations").select("*").eq("id", id).single();
  if (locationError?.code === "PGRST116") return null;
  if (locationError) throw locationError;
  const [{ data: games, error: gamesError }, { data: notes, error: notesError }] = await Promise.all([
    supabase.from("directory_games").select("*").eq("location_id", id).order("min_bet", { ascending: true, nullsFirst: false }),
    supabase.from("directory_notes").select("*").eq("location_id", id).order("created_at", { ascending: false }),
  ]);
  if (gamesError) throw gamesError;
  if (notesError) throw notesError;
  return { location: location as DirectoryLocation, games: (games ?? []) as DirectoryGame[], notes: (notes ?? []) as DirectoryNote[] };
}
