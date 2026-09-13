"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { guestBackup, hasLegacyBackup, legacyBackup } from "@/lib/supabase/accountStorage";
import { storage } from "@/lib/statistics/storage";
import { CONTACT_EMAIL } from "@/lib/contact";
import { ConfirmModal } from "./ConfirmModal";
import { GhostButton, Panel } from "./ui";

export function AccountDataTools() {
  const { user } = useAuth();
  const [legacy, setLegacy] = useState(false);
  const [pending, setPending] = useState<"guest" | "legacy" | "delete">();
  const [message, setMessage] = useState("");
  useEffect(() => { setLegacy(hasLegacyBackup()); }, []);
  return <Panel className="mt-5">
    <h2 className="font-semibold">Account data</h2>
    <p className="mt-2 text-sm text-[var(--ink-muted)]">Accounts and guest mode have separate history. Importing is an explicit choice; signing in does not transfer another profile’s data.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {user && <GhostButton onClick={() => setPending("guest")}>Import this device’s guest history</GhostButton>}
      {legacy && <GhostButton onClick={() => setPending("legacy")}>Recover previous device history</GhostButton>}
      {user && <GhostButton onClick={() => setPending("delete")}>Request account deletion</GhostButton>}
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <ConfirmModal open={!!pending} title={pending === "delete" ? "Request account deletion" : "Import history into this account?"}
      description={pending === "delete" ? "Export your history above first. Continue opens an email draft to the CountLab privacy contact. Your account stays available until your request is processed." : pending === "legacy" ? "Older versions did not record who owned this device’s cache. Recover it only if it is your own history. It will be merged into this profile; existing unrelated records are kept." : "Guest sessions and saved collections will be merged into this account. Existing unrelated records are kept. The guest copy remains on this device."}
      confirmLabel={pending === "delete" ? "Open deletion request" : "Import my history"} onCancel={() => setPending(undefined)} onConfirm={() => {
        if (pending === "delete") location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("CountLab account deletion request")}&body=${encodeURIComponent(`Please delete my CountLab account (${user?.email ?? ""}) and associated training and journal data. Please also delete associated analytics history.\n\nI have exported the data I want to retain.`)}`;
        else try { const result = storage.importData(pending === "legacy" ? legacyBackup() : guestBackup()); setMessage(`Imported ${result.sessions} training sessions and ${result.namespaces} saved collections. Signed-in profiles sync when connected.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed; existing data was preserved."); }
        setPending(undefined);
      }} />
  </Panel>;
}
