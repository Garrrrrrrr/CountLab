import { supabase } from "@/lib/supabase/client";
import type { DirectoryFilters, DirectoryGame, DirectoryLocation, DirectoryNote, DirectorySearchLocation } from "./types";

export const DIRECTORY_PAGE_SIZE = 30;
const DIRECTORY_MAP_PAGE_SIZE = 100;

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

export async function searchDirectoryMap(filters: DirectoryFilters): Promise<{ total: number; locations: DirectorySearchLocation[] }> {
  const fetchPage = async (offset: number) => {
    const { data, error } = await supabase.rpc("directory_search", {
      p_filters: filters,
      p_limit: DIRECTORY_MAP_PAGE_SIZE,
      p_offset: offset,
      p_sort: "name",
    });
    if (error) throw error;
    return data as { total?: number; locations?: DirectorySearchLocation[] } | null;
  };
  const first = await fetchPage(0);
  const total = first?.total ?? 0;
  const locations = [...(first?.locations ?? [])];
  for (let offset = DIRECTORY_MAP_PAGE_SIZE; offset < total; offset += DIRECTORY_MAP_PAGE_SIZE * 4) {
    const offsets = Array.from({ length: Math.min(4, Math.ceil((total - offset) / DIRECTORY_MAP_PAGE_SIZE)) }, (_, index) => offset + index * DIRECTORY_MAP_PAGE_SIZE);
    const pages = await Promise.all(offsets.map(fetchPage));
    for (const page of pages) locations.push(...(page?.locations ?? []));
  }
  return { total, locations };
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
