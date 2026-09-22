import { supabase } from "@/lib/supabase/client";
import type { DirectoryGame, DirectoryLocation } from "./types";

export class DirectoryConflictError extends Error {
  constructor() {
    super("Another admin changed this record. Reload the latest version, then apply your changes again.");
  }
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listAdminLocations(includeDeleted = false): Promise<DirectoryLocation[]> {
  const rows: DirectoryLocation[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("directory_locations").select("*").order("name").order("id")
      .range(offset, offset + pageSize - 1);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query;
    throwIfError(error);
    rows.push(...((data ?? []) as DirectoryLocation[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function listAdminGames(locationId: string, includeDeleted = false): Promise<DirectoryGame[]> {
  const rows: DirectoryGame[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("directory_games").select("*").eq("location_id", locationId)
      .order("created_at").order("id").range(offset, offset + pageSize - 1);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query;
    throwIfError(error);
    rows.push(...((data ?? []) as DirectoryGame[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function saveLocation(
  values: Partial<DirectoryLocation>,
  current?: DirectoryLocation,
): Promise<DirectoryLocation> {
  if (current) {
    const { data, error } = await supabase.from("directory_locations")
      .update({ ...values, version: current.version }).eq("id", current.id).eq("version", current.version).select("*").maybeSingle();
    throwIfError(error);
    if (!data) throw new DirectoryConflictError();
    return data as DirectoryLocation;
  }
  const { data, error } = await supabase.from("directory_locations").insert(values).select("*").single();
  throwIfError(error);
  return data as DirectoryLocation;
}

export async function saveGame(values: Partial<DirectoryGame>, current?: DirectoryGame): Promise<DirectoryGame> {
  if (current) {
    const { data, error } = await supabase.from("directory_games")
      .update({ ...values, version: current.version }).eq("id", current.id).eq("version", current.version).select("*").maybeSingle();
    throwIfError(error);
    if (!data) throw new DirectoryConflictError();
    return data as DirectoryGame;
  }
  const { data, error } = await supabase.from("directory_games").insert(values).select("*").single();
  throwIfError(error);
  return data as DirectoryGame;
}

type RecordKind = "location" | "game";
type RecoverableAction = "delete" | "restore";

export async function changeDeletedState(
  kind: RecordKind,
  action: RecoverableAction,
  record: { id: string; version: number },
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc(`directory_${action}_${kind}`, {
    p_id: record.id,
    p_expected_version: record.version,
    p_reason: reason,
  });
  throwIfError(error);
}

export async function purgeRecord(kind: RecordKind, id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc(`directory_purge_${kind}`, { p_id: id, p_reason: reason });
  throwIfError(error);
}

export interface AdminNote {
  id: string;
  location_id: string;
  game_id: string | null;
  category: string;
  body: string;
  audience: "admin" | "public";
  reported_month: string | null;
  source_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditEntry {
  id: number;
  actor_id: string | null;
  happened_at: string;
  action: string;
  entity: string;
  entity_id: string;
  reason: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}

export async function listAdminNotes(locationId: string): Promise<AdminNote[]> {
  const { data, error } = await supabase.from("directory_notes").select("*")
    .eq("location_id", locationId).order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as AdminNote[];
}

export async function saveAdminNote(values: Partial<AdminNote>, current?: AdminNote): Promise<AdminNote> {
  const result = current
    ? await supabase.from("directory_notes").update({ ...values, version: current.version })
      .eq("id", current.id).eq("version", current.version).select("*").maybeSingle()
    : await supabase.from("directory_notes").insert(values).select("*").maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new DirectoryConflictError();
  return result.data as AdminNote;
}

export async function deleteAdminNote(note: AdminNote): Promise<void> {
  const { data, error } = await supabase.from("directory_notes").delete()
    .eq("id", note.id).eq("version", note.version).select("id").maybeSingle();
  throwIfError(error);
  if (!data) throw new DirectoryConflictError();
}

export async function listAdminHistory(locationId: string, gameIds: string[]): Promise<AdminAuditEntry[]> {
  const ids = [locationId, ...gameIds];
  const { data, error } = await supabase.from("directory_audit_log").select("*")
    .in("entity_id", ids).order("happened_at", { ascending: false }).limit(100);
  throwIfError(error);
  return (data ?? []) as AdminAuditEntry[];
}
