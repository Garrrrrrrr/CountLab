"use client";

import { useEffect, useState } from "react";
import { onServiceWorkerUpdate } from "@/lib/pwa/registerServiceWorker";
import { Button, GhostButton } from "./ui";

/** Nothing changes underneath an active session until the user opts in. */
export function UpdateToast() {
  const [activate, setActivate] = useState<(() => void) | null>(null);
  useEffect(() => onServiceWorkerUpdate((run) => setActivate(() => run)), []);
  if (!activate) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#101411]/95 p-3 shadow-2xl backdrop-blur-2xl lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <p className="text-sm text-zinc-300">A new version of CountLab is ready.</p>
      <div className="flex gap-2">
        <GhostButton className="px-3 py-1.5 text-sm" onClick={() => setActivate(null)}>Later</GhostButton>
        <Button className="px-3 py-1.5 text-sm" onClick={activate}>Reload</Button>
      </div>
    </div>
  );
}
