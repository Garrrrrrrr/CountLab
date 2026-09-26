"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 4000;

/**
 * Marks the one rule these pages save, and confirms each save beside it for
 * a few seconds. Screen readers hear the save in the page's announcement.
 */
export function SavedRuleNote({ savedAt, signedIn, className = "mt-1 min-h-9 md:mt-0" }: { savedAt: number; signedIn: boolean; className?: string }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setConfirming(true);
    const timer = setTimeout(() => setConfirming(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);
  return confirming ? (
    <p className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[var(--accent)] ${className}`}>
      <i className="fa-solid fa-circle-check" aria-hidden="true" />
      {signedIn ? "Saved to your account" : "Saved on this device"}
    </p>
  ) : (
    <p className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--ink-muted)] ${className}`} title="Saved to your table rules; the drills use it too.">
      <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
      Saved
    </p>
  );
}
