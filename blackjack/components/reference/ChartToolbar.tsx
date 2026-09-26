"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

/**
 * The chart's rules bar: a labelled region pinned under the app header (on
 * every screen, or only on phones with `sticky="phone"`). While it is pinned
 * its height is published as --reference-toolbar-h, so section anchors and
 * the explanation card can clear it. The shared StickyBar has neither a label
 * nor a published height, so the charts keep their own.
 */
export function ChartToolbar({ label, sticky = "always", className = "", children }: { label: string; sticky?: "always" | "phone"; className?: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const update = () => {
      const pinned = getComputedStyle(element).position === "sticky";
      root.style.setProperty("--reference-toolbar-h", `${pinned ? element.offsetHeight : 0}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); removeEventListener("resize", update); root.style.removeProperty("--reference-toolbar-h"); };
  }, []);
  return (
    <div
      ref={bar}
      role="region"
      aria-label={label}
      data-reference-toolbar=""
      className={`no-print z-20 -mx-4 mb-3 border-y border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper-raised)_94%,transparent)] px-4 py-1.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border md:px-3 md:py-2 ${sticky === "always" ? "sticky top-[calc(4rem+env(safe-area-inset-top))]" : "max-md:sticky max-md:top-[calc(4rem+env(safe-area-inset-top))]"} ${className}`}
    >
      {children}
    </div>
  );
}

const RAIL_LINK = "pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--rule)] bg-[var(--paper)] px-3 text-sm font-medium text-[var(--ink)] hover:border-[var(--ink-muted)]";

/**
 * A one-line rail of in-page links for phones, where the tables are stacked.
 * Section links are plain anchors, so they work before the page's script
 * loads; a link to another page ends the rail with an arrow. An edge fade
 * shows when more links sit off-screen.
 */
export function JumpRail({ label, items, leading, className = "" }: { label: string; items: ReadonlyArray<{ href: `#${string}` | `/${string}`; label: string }>; leading?: ReactNode; className?: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => setFade({ start: element.scrollLeft > 2, end: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    return () => { element.removeEventListener("scroll", update); observer?.disconnect(); };
  }, []);
  return (
    <nav aria-label={label} className={className}>
      <div ref={rail} data-fade-start={fade.start || undefined} data-fade-end={fade.end || undefined} className="ref-jump-rail mobile-scroll-rail flex items-center gap-1.5 overflow-x-auto py-0.5">
        {leading}
        {items.map((item) => item.href.startsWith("#") ? (
          <a key={item.href} href={item.href} className={RAIL_LINK}>{item.label}</a>
        ) : (
          <Link key={item.href} href={item.href} className={RAIL_LINK}>
            {item.label}
            <i className="fa-solid fa-arrow-right text-[.65rem] text-[var(--ink-muted)]" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * The phone rules panel's open state. Escape and "Done" close it and hand
 * focus back to the button that opened it; `onChange` hears every change.
 */
export function useRulesPanel(onChange?: (open: boolean) => void) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const listener = useRef(onChange);
  useEffect(() => { listener.current = onChange; }, [onChange]);
  const toggle = useCallback((next: boolean) => {
    setOpen(next);
    listener.current?.(next);
  }, []);
  const close = useCallback(() => {
    toggle(false);
    button.current?.focus();
  }, [toggle]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [open, close]);
  return { open, toggle, close, button };
}

/** The phone rail's first chip: the rules in short form, opening the panel that edits them. */
export function RulesPanelButton({ panelId, summary, open, onToggle, button, disabled, badge }: { panelId: string; summary: string; open: boolean; onToggle: (open: boolean) => void; button: RefObject<HTMLButtonElement | null>; disabled: boolean; badge?: ReactNode }) {
  return (
    <button
      ref={button}
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => onToggle(!open)}
      className="pressable inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3 font-data text-xs font-semibold text-[var(--paper)] disabled:opacity-60"
    >
      <i className="fa-solid fa-sliders" aria-hidden="true" />
      <span><span className="sr-only">Table rules: </span>{summary}</span>
      {badge}
      <i className={`fa-solid fa-chevron-down text-[.6rem] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}
