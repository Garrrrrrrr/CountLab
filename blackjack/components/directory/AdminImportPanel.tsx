"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, GhostButton, Panel } from "@/components/ui";
import { useIsAdmin } from "@/lib/supabase/admin";
import { supabase } from "@/lib/supabase/client";

type ParsedRow = {
  source_row_key: string;
  page_number: number;
  region: string;
  raw_location: string;
  raw_game: Record<string, unknown>;
  normalized_location: Record<string, unknown>;
  normalized_game: Record<string, unknown>;
  validation_issues: string[];
};
type ParsedImport = {
  source: { title: string; source_type: string; issue_month: string; file_sha256: string; parser_version: string; publication_clearance: "private" };
  summary: Record<string, unknown>;
  rows: ParsedRow[];
};
type Batch = { id: string; source_id: string | null; file_sha256: string; parser_version: string; status: string; summary: Record<string, unknown> | null; created_at: string };
type StagedRow = ParsedRow & {
  id: string;
  batch_id: string;
  decision: "pending" | "approve" | "reject" | "applied" | "conflict";
  decision_reason: string | null;
  matched_location_id: string | null;
  matched_location_version: number | null;
  matched_game_id: string | null;
  matched_game_version: number | null;
  applied_location_id: string | null;
  applied_game_id: string | null;
};

const editorClass = "w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-raised)] px-3 py-2 text-sm text-[var(--ink)]";
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function validateParsed(value: unknown): ParsedImport {
  if (!value || typeof value !== "object") throw new Error("The selected file is not an import review JSON file.");
  const parsed = value as ParsedImport;
  if (!parsed.source || !/^[a-f0-9]{64}$/.test(parsed.source.file_sha256) || !parsed.source.parser_version || !Array.isArray(parsed.rows) || !parsed.rows.length) throw new Error("The import is missing its source hash, parser version, or rows.");
  if (parsed.source.source_type !== "cbjn_pdf" || parsed.source.publication_clearance !== "private") throw new Error("This importer accepts a private CBJN staging file only.");
  const keys = new Set<string>();
  for (const row of parsed.rows) {
    if (!row.source_row_key || !row.normalized_location || !row.normalized_game || keys.has(row.source_row_key)) throw new Error(`Invalid or duplicate row key: ${row.source_row_key || "(blank)"}`);
    if (row.normalized_location.publication_status !== "draft" || row.normalized_game.publication_status !== "draft") throw new Error(`Source row ${row.source_row_key} is not a draft.`);
    keys.add(row.source_row_key);
  }
  return parsed;
}

async function fetchAllRows(batchId: string): Promise<StagedRow[]> {
  const rows: StagedRow[] = [];
  for (let from = 0; ; from += 200) {
    const { data, error } = await supabase.from("directory_import_rows")
      .select("*").eq("batch_id", batchId).order("source_row_key").range(from, from + 199);
    if (error) throw error;
    rows.push(...((data ?? []) as StagedRow[]));
    if (!data || data.length < 200) break;
  }
  return rows;
}

export function AdminImportPanel() {
  const isAdmin = useIsAdmin();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "issues" | "all">("pending");
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [locationJson, setLocationJson] = useState("");
  const [gameJson, setGameJson] = useState("");
  const [matchLocationId, setMatchLocationId] = useState("");
  const [matchGameId, setMatchGameId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = batches.find((batch) => batch.id === selectedId);

  const refreshBatches = useCallback(async () => {
    const { data, error: failure } = await supabase.from("directory_import_batches").select("id,source_id,file_sha256,parser_version,status,summary,created_at").order("created_at", { ascending: false }).limit(50);
    if (failure) throw failure;
    setBatches((data ?? []) as Batch[]);
    setSelectedId((current) => current ?? data?.[0]?.id ?? null);
  }, []);
  const refreshRows = useCallback(async (batchId: string) => setRows(await fetchAllRows(batchId)), []);

  useEffect(() => {
    if (!isAdmin) return;
    refreshBatches().catch((failure) => setError(failure.message));
  }, [isAdmin, refreshBatches]);
  useEffect(() => {
    if (!isAdmin || !selectedId) return;
    setRows([]); setPage(0);
    refreshRows(selectedId).catch((failure) => setError(failure.message));
  }, [isAdmin, selectedId, refreshRows]);

  const upload = async (file: File) => {
    setBusy(true); setError(""); setNotice("");
    try {
      if (file.size > 20_000_000) throw new Error("The review JSON exceeds 20 MB.");
      const parsed = validateParsed(JSON.parse(await file.text()));
      let sourceId: string;
      const existingSource = await supabase.from("directory_sources").select("id").eq("file_sha256", parsed.source.file_sha256).maybeSingle();
      if (existingSource.error) throw existingSource.error;
      if (existingSource.data) sourceId = existingSource.data.id;
      else {
        const created = await supabase.from("directory_sources").insert({
          source_type: parsed.source.source_type, label: `${parsed.source.title} (${parsed.source.issue_month.slice(0, 7)})`,
          issue_month: parsed.source.issue_month, file_sha256: parsed.source.file_sha256,
          publication_clearance: "private",
        }).select("id").single();
        if (created.error) throw created.error;
        sourceId = created.data.id;
      }
      let batchId: string;
      const existingBatch = await supabase.from("directory_import_batches").select("id,status")
        .eq("file_sha256", parsed.source.file_sha256).eq("parser_version", parsed.source.parser_version).maybeSingle();
      if (existingBatch.error) throw existingBatch.error;
      if (existingBatch.data?.status === "applied" || existingBatch.data?.status === "applying") throw new Error("This file is already being applied or was applied. Open its existing batch instead.");
      if (existingBatch.data) batchId = existingBatch.data.id;
      else {
        const created = await supabase.from("directory_import_batches").insert({
          source_id: sourceId, file_sha256: parsed.source.file_sha256,
          parser_version: parsed.source.parser_version, status: "staged", summary: parsed.summary,
        }).select("id").single();
        if (created.error) throw created.error;
        batchId = created.data.id;
      }
      const existingKeys = new Set((await fetchAllRows(batchId)).map((row) => row.source_row_key));
      const pending = parsed.rows.filter((row) => !existingKeys.has(row.source_row_key));
      let inserted = 0;
      for (const group of chunk(pending, 50)) {
        const payload = group.map((row) => ({ batch_id: batchId, source_row_key: row.source_row_key,
          page_number: row.page_number, region: row.region, raw_location: row.raw_location,
          raw_game: row.raw_game, normalized_location: row.normalized_location,
          normalized_game: row.normalized_game, validation_issues: row.validation_issues,
          decision: "pending" }));
        const { error: failure } = await supabase.from("directory_import_rows").insert(payload);
        if (failure) throw failure;
        inserted += group.length;
        setNotice(`Staged ${inserted} of ${pending.length} new game rows…`);
      }
      setSelectedId(batchId);
      await refreshBatches();
      await refreshRows(batchId);
      setNotice(`${parsed.rows.length} rows are staged privately. ${parsed.rows.length - pending.length} were already present. Review them before applying.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };

  const updateDecision = async (row: StagedRow, decision: "approve" | "reject") => {
    setBusy(true); setError("");
    const { error: failure } = await supabase.from("directory_import_rows").update({ decision, decision_reason: reason.trim() || null, reviewed_at: new Date().toISOString() }).eq("id", row.id);
    if (failure) setError(failure.message);
    else { setRows((current) => current.map((item) => item.id === row.id ? { ...item, decision, decision_reason: reason.trim() || null } : item)); setEditingId(null); setReason(""); }
    setBusy(false);
  };

  const approvePending = async (includeWarnings: boolean) => {
    if (!selectedId || !selected || !["staged", "reviewing"].includes(selected.status)) return;
    const ids = rows.filter((row) => row.decision === "pending" && (includeWarnings || !row.validation_issues?.length)).map((row) => row.id);
    setBusy(true); setError("");
    try {
      for (const group of chunk(ids, 100)) {
        const { error: failure } = await supabase.from("directory_import_rows").update({
          decision: "approve", reviewed_at: new Date().toISOString(),
          decision_reason: includeWarnings ? "Bulk approved; parser warnings retained where present for later correction" : null,
        }).eq("batch_id", selectedId).in("id", group);
        if (failure) throw failure;
      }
      await refreshRows(selectedId);
      setNotice(includeWarnings
        ? `Approved ${ids.length} pending rows, including flagged rows. Parser warnings remain visible in this batch.`
        : `Approved ${ids.length} rows without parser warnings. Review or bulk approve the remaining rows.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      await refreshRows(selectedId).catch(() => undefined);
    }
    finally { setBusy(false); }
  };

  const saveCorrection = async (row: StagedRow) => {
    setBusy(true); setError("");
    try {
      const normalized_location = JSON.parse(locationJson) as Record<string, unknown>;
      const normalized_game = JSON.parse(gameJson) as Record<string, unknown>;
      if (typeof normalized_location.name !== "string" || !normalized_location.name.trim() || typeof normalized_game.game_type !== "string") throw new Error("A location name and game type are required.");
      if (normalized_location.publication_status !== "draft" || normalized_game.publication_status !== "draft") throw new Error("Imported rows must stay in draft status.");
      let matched_location_version: number | null = null;
      let matched_game_version: number | null = null;
      if (matchLocationId.trim()) {
        const found = await supabase.from("directory_locations").select("id,version").eq("id", matchLocationId.trim()).single();
        if (found.error) throw found.error;
        matched_location_version = found.data.version;
      }
      if (matchGameId.trim()) {
        if (!matchLocationId.trim()) throw new Error("Choose a matching location before matching a game.");
        const found = await supabase.from("directory_games").select("id,location_id,version").eq("id", matchGameId.trim()).single();
        if (found.error) throw found.error;
        if (found.data.location_id !== matchLocationId.trim()) throw new Error("The matched game belongs to another location.");
        matched_game_version = found.data.version;
      }
      const { error: failure } = await supabase.from("directory_import_rows").update({
        normalized_location, normalized_game, matched_location_id: matchLocationId.trim() || null,
        matched_location_version, matched_game_id: matchGameId.trim() || null,
        matched_game_version,
      }).eq("id", row.id);
      if (failure) throw failure;
      await refreshRows(row.batch_id);
      setNotice(`Saved correction for ${row.source_row_key}.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!selected || rows.some((row) => row.decision === "pending" || row.decision === "conflict")) return;
    setBusy(true); setError("");
    try {
      if (selected.status === "staged" || selected.status === "reviewing") {
        const ready = await supabase.from("directory_import_batches").update({ status: "ready" }).eq("id", selected.id).in("status", ["staged", "reviewing"]);
        if (ready.error) throw ready.error;
      }
      let remaining = rows.length;
      let calls = 0;
      do {
        const result = await supabase.rpc("directory_apply_import_batch", { p_batch_id: selected.id, p_reason: "Reviewed CBJN import", p_max_rows: 150 });
        if (result.error) throw result.error;
        remaining = Number((result.data as { remaining?: number } | null)?.remaining);
        if (!Number.isFinite(remaining) || remaining < 0) throw new Error("The import returned an invalid remaining-row count. Reload the batch before retrying.");
        calls += 1;
        setNotice(`Applied another import chunk; ${remaining} approved rows remain.`);
        if (calls > 100) throw new Error("Import needs more than 100 chunks. Reload the batch before retrying.");
      } while (remaining > 0);
      await refreshBatches(); await refreshRows(selected.id);
      setNotice("Imported approved rows as private drafts.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      await Promise.allSettled([refreshBatches(), refreshRows(selected.id)]);
    }
    finally { setBusy(false); }
  };

  const visibleRows = useMemo(() => rows.filter((row) => filter === "all" || filter === "pending" && row.decision === "pending" || filter === "issues" && row.validation_issues?.length), [rows, filter]);
  const shownRows = visibleRows.slice(page * 30, (page + 1) * 30);
  const pendingCount = rows.filter((row) => row.decision === "pending").length;
  const issueCount = rows.filter((row) => row.validation_issues?.length).length;

  if (isAdmin === null) return <Panel>Checking admin access…</Panel>;
  if (!isAdmin) return <Panel>Admin access is required.</Panel>;
  return <div className="space-y-4">
    <Panel><h2 className="text-xl font-semibold">CBJN import review</h2><p className="mt-2 text-sm text-[var(--ink-muted)]">Load the private JSON produced by <code>blackjack/scripts/directory/import_cbjn.py</code>. Reviewed records stay as private drafts for the signed-in admin directory.</p>
      <label className="mt-4 block text-sm font-medium">Private staging JSON<input type="file" accept=".json,application/json" disabled={busy} className="mt-2 block w-full text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--negative)]">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-[var(--accent)]">{notice}</p>}
    </Panel>
    <Panel><div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1 text-sm">Import batch<select className={editorClass} value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)}><option value="">Choose a batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{String(batch.summary?.game_rows ?? "?")} games · {batch.file_sha256.slice(0, 12)} · {batch.status}</option>)}</select></label>{selected && <span className="text-sm text-[var(--ink-muted)]">{rows.length} staged · {pendingCount} pending · {issueCount} flagged · {selected.status}</span>}</div>
      {selected && selected.status !== "applied" && <div className="mt-4 flex flex-wrap gap-2"><GhostButton disabled={busy || !["staged", "reviewing"].includes(selected.status) || !rows.some((row) => row.decision === "pending" && !row.validation_issues?.length)} onClick={() => void approvePending(false)}>Approve rows without warnings</GhostButton><GhostButton disabled={busy || !["staged", "reviewing"].includes(selected.status) || pendingCount === 0} onClick={() => void approvePending(true)}>Approve all pending rows (including warnings)</GhostButton><Button disabled={busy || !rows.length || pendingCount > 0 || rows.some((row) => row.decision === "conflict")} onClick={() => void apply()}>Apply reviewed rows as drafts</Button></div>}
      {selected && issueCount > 0 && <p className="mt-2 text-xs text-[var(--ink-muted)]">Bulk approval keeps {issueCount} parser warning{issueCount === 1 ? "" : "s"} in the batch. After import, edit any incorrect location or game in the Locations tab.</p>}
      {selected && <p className="mt-2 text-xs text-[var(--ink-muted)]">A repeat upload resumes missing rows and preserves existing decisions. Approved rows remain unpublished after import.</p>}
    </Panel>
    {selected?.status === "applied" && <Panel><p className="text-sm text-[var(--ink-muted)]">This batch is available to signed-in admins as private drafts. It has not been published.</p></Panel>}
    {selected && <Panel><div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1 text-sm">Show<select className={editorClass} value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setPage(0); }}><option value="pending">Pending</option><option value="issues">Parser warnings</option><option value="all">All rows</option></select></label><span className="text-sm text-[var(--ink-muted)]">{visibleRows.length} rows</span></div>
      <div className="mt-4 space-y-3">{shownRows.map((row) => <div key={row.id} className="rounded-xl border border-[var(--rule)] p-3"><div className="flex flex-wrap justify-between gap-2"><div><strong className="text-sm">Page {row.page_number} · {String(row.normalized_location.name ?? row.raw_location)}</strong><p className="text-xs text-[var(--ink-muted)]">{row.region} · {row.source_row_key} · {row.decision}</p></div><GhostButton disabled={busy} onClick={() => { setEditingId(editingId === row.id ? null : row.id); setLocationJson(JSON.stringify(row.normalized_location, null, 2)); setGameJson(JSON.stringify(row.normalized_game, null, 2)); setMatchLocationId(row.matched_location_id ?? ""); setMatchGameId(row.matched_game_id ?? ""); setReason(row.decision_reason ?? ""); }}>{editingId === row.id ? "Close" : "Review"}</GhostButton></div>
        {row.validation_issues?.length > 0 && <p className="mt-2 text-xs text-[var(--negative)]">{row.validation_issues.join("; ")}</p>}
        {editingId === row.id && <div className="mt-3 grid gap-3"><p className="break-words rounded-lg bg-[var(--paper)] p-2 text-xs">{String(row.raw_game?.line ?? "")}</p><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs">Location JSON<textarea spellCheck={false} rows={13} className={`${editorClass} font-mono`} value={locationJson} onChange={(event) => setLocationJson(event.target.value)} /></label><label className="grid gap-1 text-xs">Game JSON<textarea spellCheck={false} rows={13} className={`${editorClass} font-mono`} value={gameJson} onChange={(event) => setGameJson(event.target.value)} /></label></div><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs">Match existing location ID (optional)<input className={editorClass} value={matchLocationId} onChange={(event) => setMatchLocationId(event.target.value)} /></label><label className="grid gap-1 text-xs">Match existing game ID (optional)<input className={editorClass} value={matchGameId} onChange={(event) => setMatchGameId(event.target.value)} /></label></div><label className="grid gap-1 text-xs">Decision reason<input className={editorClass} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="flex flex-wrap gap-2"><GhostButton disabled={busy || !["staged", "reviewing"].includes(selected.status)} onClick={() => void saveCorrection(row)}>Save correction</GhostButton><Button disabled={busy || !["staged", "reviewing"].includes(selected.status)} onClick={() => void updateDecision(row, "approve")}>Approve</Button><Button disabled={busy || !["staged", "reviewing"].includes(selected.status)} variant="danger" onClick={() => void updateDecision(row, "reject")}>Reject row</Button></div></div>}
      </div>)}{!shownRows.length && <p className="text-sm text-[var(--ink-muted)]">No rows in this view.</p>}</div>
      <div className="mt-4 flex items-center justify-between gap-2"><GhostButton disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</GhostButton><span className="text-xs">Page {page + 1} of {Math.max(1, Math.ceil(visibleRows.length / 30))}</span><GhostButton disabled={(page + 1) * 30 >= visibleRows.length} onClick={() => setPage((value) => value + 1)}>Next</GhostButton></div>
    </Panel>}
  </div>;
}
