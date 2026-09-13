"use client";

import { useEffect, useState } from "react";
import { onServiceWorkerUpdate } from "@/lib/pwa/registerServiceWorker";
import { Button, GhostButton } from "./ui";

/** Nothing changes underneath an active session until the user opts in. */
export function UpdateToast({ hidden = false, onVisibilityChange }: { hidden?: boolean; onVisibilityChange?: (visible: boolean) => void }) {
  const [activate, setActivate] = useState<(() => void) | null>(null);
  useEffect(() => onServiceWorkerUpdate((run) => setActivate(() => run)), []);
  useEffect(() => { onVisibilityChange?.(!!activate); }, [activate, onVisibilityChange]);
  if (!activate || hidden) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[var(--paper-raised)] p-3 shadow-2xl backdrop-blur-2xl lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-[var(--ink)]">A new version of CountLab is ready.</p>
      <div className="flex gap-2">
        <GhostButton className="px-3 py-1.5 text-sm" onClick={() => setActivate(null)}>Later</GhostButton>
        <Button className="px-3 py-1.5 text-sm" onClick={activate}>Reload</Button>
      </div>
    </div>
  );
}
