"use client";
import { useEffect, useState } from "react";
import { onServiceWorkerUpdate, registerServiceWorker } from "@/lib/pwa/registerServiceWorker";

/** Registers the offline worker and offers a reload when a new version is waiting. */
export function UpdateBar() {
  const [activate, setActivate] = useState<(() => void) | null>(null);
  useEffect(() => { registerServiceWorker(); }, []);
  useEffect(() => onServiceWorkerUpdate((run) => setActivate(() => run)), []);
  if (!activate) return null;
  return (
    <div role="status" className="no-print fixed inset-x-3 top-3 z-[75] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm shadow-2" style={{ marginTop: "var(--safe-t)" }}>
      <span className="flex-1 font-medium">A new version of CountLab is ready.</span>
      <button type="button" onClick={() => activate()} className="h-9 rounded-lg bg-brand px-3 font-semibold text-brand-ink">Reload</button>
    </div>
  );
}
