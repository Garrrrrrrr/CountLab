"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Cloud, CloudAlert, CloudOff, LoaderCircle, Smartphone, Clock } from "lucide-react";
import { cx } from "@/components/ui";
import { useAuth } from "@/lib/supabase/AuthProvider";

const subscribeOnline = (onChange: () => void) => {
  addEventListener("online", onChange);
  addEventListener("offline", onChange);
  return () => { removeEventListener("online", onChange); removeEventListener("offline", onChange); };
};
/** Online unless the browser says otherwise; prerendered HTML assumes online. */
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

export type SyncState = {
  status: "guest" | "offline" | "syncing" | "error" | "synced" | "waiting";
  title: string;
  detail: string;
};

/** Where the journal is kept right now. Offline is not a failure: the save worked on this device. */
export function useSyncState(): SyncState {
  const { user, syncStatus } = useAuth();
  const online = useOnline();
  if (!user) return { status: "guest", title: "Saved on this device", detail: "Sign in to back it up and use it on other devices." };
  if (!online) return { status: "offline", title: "Offline", detail: "Saved on this device. It syncs when you reconnect." };
  if (syncStatus === "syncing") return { status: "syncing", title: "Syncing", detail: "Sending changes to your account." };
  if (syncStatus === "error") return { status: "error", title: "Sync failed", detail: "Everything is saved on this device. Check your connection and retry." };
  if (syncStatus === "synced") return { status: "synced", title: "Synced", detail: "Up to date on your account." };
  return { status: "waiting", title: "Not synced yet", detail: "Waiting to sync with your account." };
}

const ICON = { guest: Smartphone, offline: CloudOff, syncing: LoaderCircle, error: CloudAlert, synced: Cloud, waiting: Clock };
const TONE = { guest: "text-ink-3", offline: "text-warn", syncing: "text-info", error: "text-neg", synced: "text-pos", waiting: "text-ink-3" };

/** One line under the page title: where the journal lives, with sign-in for guests and retry after a failed sync. */
export function SyncStatus({ className }: { className?: string }) {
  const state = useSyncState();
  const Icon = ICON[state.status];
  return (
    <div className={cx("flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)} role="status" aria-live="polite">
      <span className="inline-flex min-w-0 items-center gap-2">
        <Icon size={16} aria-hidden className={cx("shrink-0", TONE[state.status], state.status === "syncing" && "animate-spin")} />
        <span className="min-w-0"><b className="font-semibold text-ink">{state.title}</b><span className="hidden text-ink-2 sm:inline"> · {state.detail}</span></span>
      </span>
      {state.status === "guest" && (
        <Link href="/signin" className="inline-flex h-11 items-center font-semibold text-brand-text underline underline-offset-4 hover:no-underline">Sign in to sync</Link>
      )}
      {state.status === "error" && (
        <button type="button" onClick={() => dispatchEvent(new Event("countlab:sync-request"))} className="inline-flex h-11 items-center font-semibold text-brand-text underline underline-offset-4 hover:no-underline">
          Retry sync
        </button>
      )}
    </div>
  );
}
