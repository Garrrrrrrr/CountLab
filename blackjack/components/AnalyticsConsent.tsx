"use client";

import { useEffect, useState } from "react";
import { analytics } from "@/lib/analytics";
import { ANALYTICS_CONFIG, STORAGE_KEYS } from "@/lib/analytics/config";
import { Button, GhostButton } from "./ui";

export function AnalyticsConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const recordedChoice = localStorage.getItem(STORAGE_KEYS.analyticsConsent);
      setVisible(localStorage.getItem(STORAGE_KEYS.consentSeen) !== "1" || (ANALYTICS_CONFIG.requireConsent && !recordedChoice));
    } catch {
      setVisible(false);
    }
  }, []);

  const choose = (enabled: boolean) => {
    analytics.setConsent(enabled, "privacy_banner");
    try {
      localStorage.setItem(STORAGE_KEYS.consentSeen, "1");
    } catch {
      // The preference remains in memory for this page when storage is blocked.
    }
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside aria-label="Analytics privacy choices" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur sm:p-5">
      <p className="font-semibold">Privacy choices</p>
      <p className="mt-1 text-sm leading-6 text-zinc-400">
        CountLab uses first-party, privacy-minimized analytics to improve training. It never records passwords, email addresses, notes, exact bankrolls, or advertising identifiers.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => choose(true)}>Allow analytics</Button>
        <GhostButton onClick={() => choose(false)}>Essential storage only</GhostButton>
      </div>
    </aside>
  );
}
