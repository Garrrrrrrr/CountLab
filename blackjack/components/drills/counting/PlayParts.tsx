"use client";
import { GhostButton } from "@/components/ui";

/**
 * End drill, for the HUD's chip slot. The kit's own End button always reads
 * "End drill"; this one reads "End" on phones so the HUD keeps to one line
 * there, and keeps "End drill" as its name everywhere.
 */
export function EndDrillButton({ onEnd }: { onEnd: () => void }) {
  return (
    <GhostButton size="compact" onClick={onEnd} aria-label="End drill" className="min-w-11">
      <span className="sm:hidden">End</span>
      <span className="hidden sm:inline">End drill</span>
    </GhostButton>
  );
}
