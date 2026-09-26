"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 4000;

/**
 * Marks the one rule these pages save, and confirms each save beside it for
 * a few seconds. Screen readers hear the save in the page's announcement.
 */
export function SavedRuleNote({ savedAt, signedIn }: { savedAt: number; signedIn: boolean }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setConfirming(true);
    const timer = setTimeout(() => setConfirming(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);
  return confirming ? (
    <p className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--accent)] md:mt-0">
      <i className="fa-solid fa-circle-check" aria-hidden="true" />
      {signedIn ? "Saved to your account" : "Saved on this device"}
    </p>
  ) : (
    <p className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-xs text-[var(--ink-muted)] md:mt-0" title="Saved to your table rules; the drills use it too.">
      <i className="fa-solid fa-floppy-disk" aria-hidden="true" />
      Saved
    </p>
  );
}
