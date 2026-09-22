"use client";

import { useEffect, useState } from "react";
import { Button, GhostButton, Panel } from "@/components/ui";
import { ConfirmModal } from "@/components/ConfirmModal";
import { deleteAdminNote, listAdminHistory, listAdminNotes, saveAdminNote } from "@/lib/directory/admin";
import type { AdminAuditEntry, AdminNote } from "@/lib/directory/admin";
import type { DirectoryGame } from "@/lib/directory/types";

const fieldClass = "field min-h-11 w-full rounded-lg px-3 text-[var(--ink)]";

export function AdminNotesHistory({ locationId, games }: { locationId: string; games: DirectoryGame[] }) {
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [history, setHistory] = useState<AdminAuditEntry[]>([]);
  const [editing, setEditing] = useState<AdminNote | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminNote | null>(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [audience, setAudience] = useState<"admin" | "public">("admin");
  const [gameId, setGameId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const gameIds = games.map((game) => game.id).join(",");

  useEffect(() => {
    let active = true;
    listAdminNotes(locationId).then((rows) => { if (active) setNotes(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load notes."); });
    return () => { active = false; };
  }, [locationId]);
  useEffect(() => {
    if (!showHistory) return;
    let active = true;
    listAdminHistory(locationId, gameIds ? gameIds.split(",") : []).then((rows) => { if (active) setHistory(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load history."); });
    return () => { active = false; };
  }, [locationId, gameIds, showHistory]);

  function edit(note: AdminNote | "new") {
    setEditing(note); setError("");
    setBody(note === "new" ? "" : note.body);
    setCategory(note === "new" ? "general" : note.category);
    setAudience(note === "new" ? "admin" : note.audience);
    setGameId(note === "new" ? "" : note.game_id ?? "");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) { setError("Note text is required."); return; }
    setBusy(true); setError("");
    try {
      await saveAdminNote({ location_id: locationId, game_id: gameId || null, body: body.trim(), category: category.trim() || "general", audience }, editing === "new" ? undefined : editing ?? undefined);
      setNotes(await listAdminNotes(locationId)); setEditing(null);
      if (showHistory) setHistory(await listAdminHistory(locationId, gameIds ? gameIds.split(",") : []));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save note."); }
    finally { setBusy(false); }
  }

  return <Panel>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Notes and history</h2><div className="flex gap-2"><GhostButton className="min-h-9 px-3 py-1 text-sm" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide history" : "Edit history"}</GhostButton><Button size="compact" onClick={() => edit("new")}>Add note</Button></div></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    {editing && <form className="mt-4 space-y-3 rounded-lg border border-[var(--rule)] p-4" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs text-[var(--ink-muted)]">Audience<select className={fieldClass} value={audience} onChange={(event) => setAudience(event.target.value as "admin" | "public")}><option value="admin">Admins only</option><option value="public">Public</option></select></label><label className="grid gap-1 text-xs text-[var(--ink-muted)]">Category<input className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)} /></label><label className="grid gap-1 text-xs text-[var(--ink-muted)]">Game (optional)<select className={fieldClass} value={gameId} onChange={(event) => setGameId(event.target.value)}><option value="">Whole location</option>{games.filter((game) => !game.deleted_at).map((game) => <option key={game.id} value={game.id}>{game.game_type} · {game.decks ?? "?"} decks</option>)}</select></label></div>
      <label className="grid gap-1 text-xs text-[var(--ink-muted)]">Note<textarea className={`${fieldClass} min-h-24 py-2`} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="flex gap-2"><Button type="submit" size="compact" disabled={busy}>{busy ? "Saving…" : "Save note"}</Button><GhostButton type="button" className="min-h-9 px-3 py-1 text-sm" onClick={() => setEditing(null)}>Cancel</GhostButton></div>
    </form>}
    <div className="mt-4 space-y-2">{notes.map((note) => <div key={note.id} className="rounded-lg border border-[var(--rule)] p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{note.audience === "admin" ? "Admin only" : "Public"} · {note.category}</p><div className="flex gap-2"><button className="text-xs text-[var(--accent)] hover:underline" onClick={() => edit(note)}>Edit</button><button className="text-xs text-red-400 hover:underline" onClick={() => setDeleting(note)}>Delete</button></div></div><p className="mt-2 whitespace-pre-wrap text-sm">{note.body}</p></div>)}{notes.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No notes yet.</p>}</div>
    {showHistory && <div className="mt-5 border-t border-[var(--rule)] pt-4"><h3 className="font-semibold">Recent changes</h3><div className="mt-3 max-h-72 space-y-3 overflow-y-auto">{history.map((entry) => <details key={entry.id} className="rounded-lg border border-[var(--rule)] p-3 text-xs"><summary className="cursor-pointer"><strong className="capitalize">{entry.action}</strong> {entry.entity.replace("directory_", "")} · {new Date(entry.happened_at).toLocaleString()}{entry.reason ? ` · ${entry.reason}` : ""}</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><pre className="overflow-auto whitespace-pre-wrap break-all text-[var(--ink-muted)]">Before: {JSON.stringify(entry.before_value, null, 2)}</pre><pre className="overflow-auto whitespace-pre-wrap break-all text-[var(--ink-muted)]">After: {JSON.stringify(entry.after_value, null, 2)}</pre></div></details>)}{history.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No changes recorded.</p>}</div></div>}
    <ConfirmModal open={!!deleting} title="Delete note?" description={deleting?.body.slice(0, 160)} confirmLabel="Delete note" tone="danger" onCancel={() => setDeleting(null)} onConfirm={async () => { if (!deleting) return; setBusy(true); try { await deleteAdminNote(deleting); setNotes(await listAdminNotes(locationId)); setDeleting(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete note."); } finally { setBusy(false); } }} />
  </Panel>;
}
