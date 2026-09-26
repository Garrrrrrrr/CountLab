"use client";
import Link from "next/link";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";
import { AREAS } from "@/lib/routes";

/** One missing-page screen for unknown URLs and unmapped routes alike. */
export function NotFoundView({ source }: { source: string }) {
  useEffect(() => {
    analytics.track("client_error", { error_type: "RouteNotFound", message_normalized: "route not found", route: analytics.route, source });
  }, [source]);
  return (
    <section className="mx-auto max-w-2xl py-12 text-center sm:py-20">
      <p className="font-data text-sm font-semibold text-[var(--accent)]">404 · Busted</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">This page went over 21.</h1>
      <p className="mt-3 text-[var(--ink-muted)]">The page you are looking for does not exist or has moved. Try one of these instead.</p>
      <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
        {[{ name: "Home", href: "/", icon: "fa-house" }, ...AREAS].map(({ name, href, icon }) => (
          <Link key={href} href={href} className="pressable surface flex min-h-14 items-center gap-3 rounded-xl px-4 font-semibold hover:border-[var(--ink-muted)]">
            <i className={`fa-solid ${icon} w-4 text-center text-[var(--count-cold)]`} aria-hidden="true" />{name}
          </Link>
        ))}
      </div>
    </section>
  );
}
