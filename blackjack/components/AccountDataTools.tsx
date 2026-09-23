"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { accountStorage, guestBackup, hasLegacyBackup, legacyBackup } from "@/lib/supabase/accountStorage";
import { storage } from "@/lib/statistics/storage";
import { CONTACT_EMAIL } from "@/lib/contact";
import { ConfirmModal } from "./ConfirmModal";
import { GhostButton, Panel } from "./ui";

export function AccountDataTools() {
  const { user } = useAuth();
  const [legacy, setLegacy] = useState(false);
  const [pending, setPending] = useState<"guest" | "legacy" | "delete">();
  const [backup, setBackup] = useState<string>();
  const [preview, setPreview] = useState("");
  const [newJournalCount, setNewJournalCount] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => { setLegacy(hasLegacyBackup()); }, []);
  const previewImport = (source: "guest" | "legacy") => {
    try {
      const snapshot = source === "guest" ? guestBackup() : legacyBackup();
      const parsed = JSON.parse(snapshot) as { sessions?: unknown[]; local?: Record<string, string> };
      const sessions = parsed.sessions?.length ?? 0;
      const collections = Object.keys(parsed.local ?? {}).length;
      const journalKey = "countlab:journal-sessions:v1";
      const sourceJournal = JSON.parse(parsed.local?.[journalKey] ?? "null") as { items?: Array<{ id?: string }> } | null;
      const currentJournal = JSON.parse(accountStorage.getItem(journalKey) ?? "null") as { items?: Array<{ id?: string }> } | null;
      const existingIds = new Set(currentJournal?.items?.map((item) => item.id) ?? []);
      const sourceIds = new Set(sourceJournal?.items?.map((item) => item.id).filter((id): id is string => typeof id === "string") ?? []);
      const newCount = [...sourceIds].filter((id) => !existingIds.has(id)).length;
      setBackup(snapshot);
      setNewJournalCount(newCount);
      setPreview(`Preview: ${sessions} training sessions, ${sourceIds.size} journal sessions (${newCount} new to this account), and ${collections} saved collections on this device. Existing journal records with matching IDs and the source copy are kept.`);
      setPending(source);
    } catch { setMessage("This device’s history could not be read. Existing account data was preserved."); }
  };
  return <Panel className="mt-5">
    <h2 className="font-semibold">Account data</h2>
    <p className="mt-2 text-sm text-[var(--ink-muted)]">Accounts and guest mode have separate history. Importing is an explicit choice; signing in does not transfer another profile’s data.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {user && <GhostButton onClick={() => previewImport("guest")}>Import this device’s guest history</GhostButton>}
      {legacy && <GhostButton onClick={() => previewImport("legacy")}>Recover previous device history</GhostButton>}
      {user && <GhostButton onClick={() => setPending("delete")}>Request account deletion</GhostButton>}
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <ConfirmModal open={!!pending} title={pending === "delete" ? "Request account deletion" : "Import history into this account?"}
      description={pending === "delete" ? "Export your history above first. Continue opens an email draft to the CountLab privacy contact. Your account stays available until your request is processed." : pending === "legacy" ? `${preview} Older versions did not record who owned this device’s cache. Recover it only if it is your own history. It will be merged into this profile; existing unrelated records are kept.` : preview}
      confirmLabel={pending === "delete" ? "Open deletion request" : "Import my history"} onCancel={() => setPending(undefined)} onConfirm={() => {
        if (pending === "delete") location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("CountLab account deletion request")}&body=${encodeURIComponent(`Please delete my CountLab account (${user?.email ?? ""}) and associated training and journal data. Please also delete associated analytics history.\n\nI have exported the data I want to retain.`)}`;
        else try { const result = storage.importData(backup ?? ""); setMessage(`Imported ${result.sessions} training sessions and ${result.namespaces} saved collections, including ${newJournalCount} new journal sessions. Signed-in profiles sync when connected.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed; existing data was preserved."); }
        setPending(undefined);
      }} />
  </Panel>;
}
