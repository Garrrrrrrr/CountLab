"use client";
import { accountStorage } from "@/lib/supabase/accountStorage";


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { storage } from "@/lib/statistics/storage";
import { journalLibrary } from "@/lib/blackjack/journal";
import { cvcxLibrary } from "@/lib/blackjack/cvcxLibrary";

const DISMISSED_KEY = "countlab:onboarding-dismissed:v1";


interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  autoDone?: () => boolean;
}

const ITEMS: ChecklistItem[] = [
  { id: "rules", label: "Set your table rules", href: "/settings", autoDone: () => accountStorage.getItem("countlab:onboarding-rules-saved") === "1" },
  { id: "drill", label: "Try a counting drill", href: "/training/running-count?session=starter", autoDone: () => storage.sessions().length > 0 },
  { id: "journal", label: "Log your first session", href: "/journal", autoDone: () => journalLibrary.sessions().length > 0 },
  { id: "bankroll", label: "Build a bankroll and bet ramp", href: "/cvcx", autoDone: () => cvcxLibrary.templates().length > 0 },
];

export function Onboarding() {
  const [dismissed, setDismissed] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setDismissed(accountStorage.getItem(DISMISSED_KEY) === "1");
    const refresh = () => setTick((value) => value + 1);
    addEventListener("hilo-storage", refresh);
    addEventListener(journalLibrary.event, refresh);
    addEventListener(cvcxLibrary.event, refresh);
    return () => {
      removeEventListener("hilo-storage", refresh);
      removeEventListener(journalLibrary.event, refresh);
      removeEventListener(cvcxLibrary.event, refresh);
    };
  }, []);

  const doneIds = useMemo(() => {
    void tick;
    return new Set(ITEMS.filter((item) => item.autoDone?.()).map((item) => item.id));
  }, [tick]);

  const dismiss = () => {
    setDismissed(true);
    accountStorage.setItem(DISMISSED_KEY, "1");
  };

  if (dismissed || doneIds.size === ITEMS.length) return null;

  return (
    <section className="surface mb-5 rounded-[1.35rem] p-4 sm:p-5" role="region" aria-label="Getting started checklist">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent)]">Getting started</p>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">{doneIds.size} of {ITEMS.length} done</p>
        </div>
        <button type="button" onClick={dismiss} className="text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]">Dismiss</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {ITEMS.map((item) => {
          const done = doneIds.has(item.id);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex min-h-11 items-center gap-3 rounded-xl p-3 text-sm ${done ? "bg-emerald-400/10 text-[var(--accent)]" : "bg-well/20 text-[var(--ink)] hover:bg-overlay/[.06]"}`}
            >
              <i className={`fa-solid ${done ? "fa-circle-check" : "fa-circle"} ${done ? "" : "text-[var(--ink-muted)]"}`} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
