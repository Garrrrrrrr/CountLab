"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { analytics } from "@/lib/analytics";
import { ANALYTICS_CONFIG, STORAGE_KEYS } from "@/lib/analytics/config";

/**
 * The analytics choice, as a slim bar above the tab bar rather than a panel
 * covering a third of the phone. It asks once; Settings can change it later.
 */
export function ConsentBar() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      const recorded = localStorage.getItem(STORAGE_KEYS.analyticsConsent);
      setVisible(localStorage.getItem(STORAGE_KEYS.consentSeen) !== "1" || (ANALYTICS_CONFIG.requireConsent && !recorded));
    } catch {
      setVisible(ANALYTICS_CONFIG.requireConsent);
    }
  }, []);
  const choose = (enabled: boolean) => {
    analytics.setConsent(enabled, "privacy_banner");
    try { localStorage.setItem(STORAGE_KEYS.consentSeen, "1"); } catch { /* kept in memory for this page */ }
    window.dispatchEvent(new Event("countlab:analytics-consent"));
    setVisible(false);
  };
  if (!visible) return null;
  return (
    <aside aria-label="Analytics choice" className="no-print fixed inset-x-3 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface p-3 shadow-2 sm:p-3.5 lg:bottom-4 lg:left-[calc(16rem+1rem)] lg:right-4 lg:mx-0 lg:ml-auto"
      style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b) + var(--dock-h, 0px) + 0.75rem)" }}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-[0.8125rem] leading-5 text-ink-2">
          Allow privacy-minimized analytics to help improve CountLab? No emails, notes or exact bankrolls are recorded. <Link href="/privacy" className="font-medium text-ink underline underline-offset-2">Details</Link>
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <button type="button" onClick={() => choose(false)} className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm font-semibold hover:bg-surface-3">No thanks</button>
          <button type="button" onClick={() => choose(true)} className="h-9 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-ink">Allow</button>
        </div>
      </div>
    </aside>
  );
}
