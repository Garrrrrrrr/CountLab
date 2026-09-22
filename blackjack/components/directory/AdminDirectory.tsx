"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, GhostButton, Panel } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useIsAdmin } from "@/lib/supabase/admin";
import { changeDeletedState, listAdminGames, listAdminLocations, purgeRecord } from "@/lib/directory/admin";
import type { DirectoryGame, DirectoryLocation } from "@/lib/directory/types";
import { AdminLocationEditor } from "./AdminLocationEditor";
import { AdminGameEditor } from "./AdminGameEditor";
import { AdminNotesHistory } from "./AdminNotesHistory";

type Tab = "locations" | "trash" | "import";
type Action = { kind: "location" | "game"; mode: "delete" | "restore" | "purge"; record: DirectoryLocation | DirectoryGame };

function gameLabel(game: DirectoryGame) {
  const limits = game.min_bet == null ? "Limits unknown" : `${game.currency ?? ""} ${game.min_bet}${game.max_bet == null ? "" : `–${game.max_bet}`}`.trim();
  return `${game.game_type.replaceAll("_", " ")} · ${game.decks ?? "?"} decks · ${limits}`;
}

export function AdminDirectory({ importPanel }: { importPanel?: ReactNode }) {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<Tab>("locations");
  const [locations, setLocations] = useState<DirectoryLocation[]>([]);
  const [games, setGames] = useState<DirectoryGame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<DirectoryLocation | "new" | null>(null);
  const [editingGame, setEditingGame] = useState<DirectoryGame | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const selected = locations.find((location) => location.id === selectedId) ?? null;
  const visibleLocations = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim();
    return locations.filter((location) => {
      if (tab === "trash" ? !location.deleted_at : location.deleted_at) return false;
      return !terms || [location.name, location.city, location.subdivision, location.country, ...location.aliases]
        .some((value) => value?.toLocaleLowerCase().includes(terms));
    });
  }, [locations, query, tab]);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setLocations(await listAdminLocations(true)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load directory records."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isAdmin === true) {
      setSelectedId(new URLSearchParams(window.location.search).get("location"));
      void reload();
    } else if (isAdmin === false) {
      setLocations([]); setGames([]); setSelectedId(null); setEditingGame(null); setEditingLocation(null);
    }
  }, [isAdmin, reload]);

  useEffect(() => {
    if (isAdmin !== true || !selectedId) { setGames([]); return; }
    let active = true;
    listAdminGames(selectedId, true).then((rows) => { if (active) setGames(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load games."); });
    return () => { active = false; };
  }, [isAdmin, selectedId, locations]);

  function choose(id: string | null) {
    setSelectedId(id); setEditingGame(null); setEditingLocation(null); setError(""); setNotice("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("location", id); else url.searchParams.delete("location");
    window.history.replaceState({}, "", url);
  }

  async function performAction() {
    if (!action) return;
    setSaving(true); setError("");
    try {
      if (action.mode === "purge") await purgeRecord(action.kind, action.record.id, reason.trim());
      else await changeDeletedState(action.kind, action.mode, action.record, reason.trim());
      setNotice(`${action.kind === "location" ? "Location" : "Game"} ${action.mode === "delete" ? "moved to Trash" : action.mode === "restore" ? "restored" : "permanently deleted"}.`);
      if (action.kind === "location" && action.mode === "purge") choose(null);
      await reload();
      if (action.kind === "game" && selectedId) setGames(await listAdminGames(selectedId, true));
      setAction(null); setConfirmation(""); setReason("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setSaving(false); }
  }

  if (isAdmin === null) return <Panel><p className="text-[var(--ink-muted)]">Checking admin access…</p></Panel>;
  if (!isAdmin) return <Panel><h1 className="text-2xl font-semibold">Admin access required</h1><p className="mt-2 text-[var(--ink-muted)]">Sign in with a CountLab admin account to manage the directory.</p></Panel>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">Admin</p><h1 className="mt-2 text-3xl font-semibold">Game directory</h1><p className="mt-2 text-sm text-[var(--ink-muted)]">Manage locations and game offerings. Published records are visible to everyone.</p></div><Link href="/directory" className="text-sm text-[var(--accent)] hover:underline">View public directory →</Link></div>
    <div role="tablist" aria-label="Directory administration" className="flex flex-wrap gap-2">{(["locations", "trash", ...(importPanel ? ["import"] : [])] as Tab[]).map((item) => <GhostButton key={item} role="tab" aria-selected={tab === item} selected={tab === item} onClick={() => { setTab(item); setEditingGame(null); setEditingLocation(null); }}>{item === "locations" ? "Locations" : item === "trash" ? "Trash" : "Import review"}</GhostButton>)}</div>
    {error && <Panel><p role="alert" className="text-sm text-red-400">{error}</p><GhostButton className="mt-3" onClick={() => { void reload(); if (selectedId) void listAdminGames(selectedId, true).then(setGames); }}>Reload records</GhostButton></Panel>}
    {notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {tab === "import" ? importPanel : <div className="grid gap-5 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <Panel className="self-start">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{tab === "trash" ? "Deleted locations" : "Locations"}</h2>{tab === "locations" && <Button size="compact" onClick={() => { setEditingLocation("new"); setEditingGame(null); }}>Add</Button>}</div>
        <input aria-label="Search locations" placeholder="Search venues or cities" className="field mt-4 min-h-11 w-full rounded-lg px-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} />
        {loading ? <p className="mt-4 text-sm text-[var(--ink-muted)]">Loading…</p> : <p className="mt-3 text-xs text-[var(--ink-muted)]">{visibleLocations.length} location{visibleLocations.length === 1 ? "" : "s"}</p>}
        <div className="mt-3 max-h-[65vh] space-y-1 overflow-auto">{visibleLocations.map((location) => <button key={location.id} type="button" onClick={() => choose(location.id)} className={`block w-full rounded-lg border px-3 py-3 text-left ${selectedId === location.id ? "border-[var(--accent)] bg-[var(--paper-raised)]" : "border-transparent hover:border-[var(--rule)]"}`}><strong className="block text-sm">{location.name}</strong><span className="block text-xs text-[var(--ink-muted)]">{location.city}{location.subdivision ? `, ${location.subdivision}` : ""} · {location.publication_status}</span></button>)}{!loading && visibleLocations.length === 0 && <p className="py-5 text-sm text-[var(--ink-muted)]">No locations match.</p>}</div>
      </Panel>
      <div className="space-y-5">
        {editingLocation && <AdminLocationEditor key={editingLocation === "new" ? "new" : editingLocation.id} location={editingLocation === "new" ? undefined : editingLocation} onCancel={() => setEditingLocation(null)} onReload={() => { setEditingLocation(null); void reload(); }} onSaved={(saved) => { setEditingLocation(null); choose(saved.id); setNotice("Location saved."); void reload(); }} />}
        {selected && !editingLocation && <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-[var(--ink-muted)]">{selected.address ? `${selected.address}, ` : ""}{selected.city}{selected.subdivision ? `, ${selected.subdivision}` : ""}, {selected.country}</p><p className="mt-2 text-xs text-[var(--ink-muted)]">{selected.publication_status} · {selected.operating_status} · version {selected.version}{selected.deleted_at ? " · in Trash" : ""}</p></div><div className="flex flex-wrap gap-2">{!selected.deleted_at && <GhostButton onClick={() => setEditingLocation(selected)}>Edit profile</GhostButton>}{selected.deleted_at ? <><GhostButton onClick={() => setAction({ kind: "location", mode: "restore", record: selected })}>Restore</GhostButton><Button variant="danger" onClick={() => setAction({ kind: "location", mode: "purge", record: selected })}>Permanently delete</Button></> : <Button variant="danger" onClick={() => setAction({ kind: "location", mode: "delete", record: selected })}>Delete</Button>}</div></div>
          {!selected.deleted_at && <Link href={`/directory?location=${selected.id}`} className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline">Open public view →</Link>}
        </Panel>}
        {selected && !editingLocation && <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Games ({games.filter((game) => !game.deleted_at).length})</h2>{!selected.deleted_at && <Button size="compact" onClick={() => setEditingGame("new")}>Add game</Button>}</div>
          <div className="mt-4 space-y-3">{games.map((game) => <div key={game.id} className="rounded-lg border border-[var(--rule)] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-sm capitalize">{gameLabel(game)}</strong><p className="mt-1 text-xs text-[var(--ink-muted)]">{game.publication_status} · {game.availability}{game.reported_month ? ` · reported ${game.reported_month.slice(0, 7)}` : ""}{game.deleted_at ? " · in Trash" : ""}</p></div><div className="flex flex-wrap gap-2">{game.deleted_at ? <><GhostButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setAction({ kind: "game", mode: "restore", record: game })}>Restore</GhostButton><GhostButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setAction({ kind: "game", mode: "purge", record: game })}>Purge</GhostButton></> : <><GhostButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setEditingGame(game)}>Edit</GhostButton><GhostButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setEditingGame({ ...game, id: "", version: 0, created_at: "", updated_at: "", reported_month: null, verified_at: null, publication_status: "draft" })}>Copy</GhostButton><GhostButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setAction({ kind: "game", mode: "delete", record: game })}>Delete</GhostButton></>}</div></div></div>)}{games.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No game offerings have been entered.</p>}</div>
        </Panel>}
        {selected && editingGame && <AdminGameEditor key={editingGame === "new" ? "new" : editingGame.id || "copy"} locationId={selected.id} game={editingGame === "new" ? undefined : editingGame} onCancel={() => setEditingGame(null)} onReload={() => { setEditingGame(null); void listAdminGames(selected.id, true).then(setGames); }} onSaved={async () => { setEditingGame(null); setNotice("Game saved."); setGames(await listAdminGames(selected.id, true)); }} />}
        {selected && !selected.deleted_at && <AdminNotesHistory key={selected.id} locationId={selected.id} games={games} />}
        {!selected && !editingLocation && <Panel><p className="text-[var(--ink-muted)]">Select a location to edit its profile and games.</p></Panel>}
      </div>
    </div>}
    <ConfirmModal open={!!action} title={`${action?.mode === "purge" ? "Permanently delete" : action?.mode === "restore" ? "Restore" : "Delete"} ${action?.kind ?? "record"}?`} description={action?.kind === "location" ? `${(action.record as DirectoryLocation).name} has ${games.length} game offering${games.length === 1 ? "" : "s"}. ${action.mode === "delete" ? "It and its games will disappear from public results immediately." : action.mode === "purge" ? "This cannot be undone." : "It will return to the directory."}` : action ? gameLabel(action.record as DirectoryGame) : ""} confirmLabel={action?.mode === "purge" ? "Permanently delete" : action?.mode === "restore" ? "Restore" : "Move to Trash"} tone={action?.mode === "restore" ? "default" : "danger"} confirmDisabled={saving || (action?.kind === "location" && action.mode !== "restore" && confirmation.trim() !== (action.record as DirectoryLocation).name)} onCancel={() => { setAction(null); setConfirmation(""); setReason(""); }} onConfirm={() => void performAction()}>
      {action?.kind === "location" && action.mode !== "restore" && <label className="mt-4 grid gap-2 text-sm text-[var(--ink-muted)]">Type the location name to confirm<input autoFocus className={fieldClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
      <label className="mt-4 grid gap-2 text-sm text-[var(--ink-muted)]">Reason for audit history<input className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </ConfirmModal>
  </div>;
}

const fieldClass = "field min-h-11 w-full rounded-lg px-3 text-[var(--ink)]";
