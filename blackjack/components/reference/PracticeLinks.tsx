"use client";

import Link from "next/link";
import { isPublicRoute } from "@/lib/routes";
import { useAuth } from "@/lib/supabase/AuthProvider";

export interface PracticeLink {
  href: string;
  title: string;
  description: string;
  icon: string;
}

/**
 * Where to go after reading the chart: the drills that practise it. The
 * drills sit behind the sign-in screen, so a visitor who arrived from a
 * search goes in as a guest, as the home page's drill links do.
 */
export function PracticeLinks({ items }: { items: readonly PracticeLink[] }) {
  const { user, continueAsGuest } = useAuth();
  return (
    <section aria-labelledby="practice-links-heading" className="no-print mt-8">
      <h2 id="practice-links-heading" data-analytics-section="practice_links" className="font-display text-xl font-semibold">Practice what&apos;s on this chart</h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">Free, no sign-up needed. Guest progress stays on this device.</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              onClick={() => { if (!user && !isPublicRoute(item.href)) continueAsGuest(); }}
              className="pressable surface group flex h-full min-h-11 items-start gap-3 rounded-2xl p-4 hover:border-[var(--ink-muted)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-overlay/[.06] text-[var(--accent)]"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--ink)]">{item.title}</span>
                <span className="mt-0.5 block text-sm leading-5 text-[var(--ink-muted)]">{item.description}</span>
              </span>
              <i className="fa-solid fa-arrow-right mt-1 text-xs text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
