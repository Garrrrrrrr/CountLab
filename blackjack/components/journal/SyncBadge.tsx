"use client";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";

const subscribeOnline = (onChange: () => void) => {
  addEventListener("online", onChange);
  addEventListener("offline", onChange);
  return () => { removeEventListener("online", onChange); removeEventListener("offline", onChange); };
};
/** Online unless the browser says otherwise; prerendered HTML assumes online. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

type SyncState = { value: string; sub: string; icon: string; tone: string; retry?: boolean };

/** The existing five sync statements, plus offline, which is not a failure: the save worked on this device. */
export function useSyncState(): SyncState {
  const { user, syncStatus } = useAuth();
  const online = useOnline();
  if (!user) return { value: "Guest mode", sub: "Saved on this device only", icon: "fa-mobile-screen", tone: "text-[var(--ink-muted)]" };
  if (!online) return { value: "Offline", sub: "Saved on this device; syncs when you reconnect", icon: "fa-plug-circle-xmark", tone: "text-[var(--warning)]" };
  if (syncStatus === "syncing") return { value: "Syncing…", sub: "Pushing to your account", icon: "fa-arrows-rotate motion-safe:animate-spin", tone: "text-[var(--info)]" };
  if (syncStatus === "error") return { value: "Sync failed", sub: "Check your connection", icon: "fa-triangle-exclamation", tone: "text-[var(--negative)]", retry: true };
  if (syncStatus === "synced") return { value: "Synced", sub: "Up to date on your account", icon: "fa-circle-check", tone: "text-[var(--accent)]" };
  return { value: "Not synced", sub: "Waiting to sync", icon: "fa-clock", tone: "text-[var(--ink-muted)]" };
}

/** Where the journal lives and whether it is backed up, with a retry when a sync failed. */
export function SyncBadge({ className = "" }: { className?: string }) {
  const state = useSyncState();
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}>
      <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--paper-raised)] px-3">
        <i className={`fa-solid ${state.icon} text-xs ${state.tone}`} aria-hidden="true" />
        <span><b className="font-semibold text-[var(--ink)]">{state.value}</b><span className="text-[var(--ink-muted)]"> · {state.sub}</span></span>
      </span>
      {state.retry && (
        <button type="button" onClick={() => dispatchEvent(new Event("countlab:sync-request"))} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--accent)] underline underline-offset-2 hover:no-underline">
          Retry sync
        </button>
      )}
    </div>
  );
}
