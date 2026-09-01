"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, storage } from "@/lib/statistics/storage";
import { computeStreak } from "@/lib/statistics/streaks";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";
import { isStandalone, readPwaEnv } from "@/lib/pwa/standalone";
import { setStreakBadge } from "@/lib/pwa/appBadge";
import { useIsAdmin } from "@/lib/supabase/admin";

const FullShoeGame = dynamic(() => import("@/components/FullShoeGame").then((m) => ({ default: m.FullShoeGame })), { loading: () => null });
const Onboarding = dynamic(() => import("@/components/Onboarding").then((m) => ({ default: m.Onboarding })), { loading: () => null });
type Destination = readonly [name: string, href: string, icon: string, area: "Practice" | "Analyze" | "Play" | "Reference" | "Utility"];
const destinations: readonly Destination[] = [
  ["Full Shoe", "/training/full-shoe", "fa-shoe-prints", "Practice"], ["Daily Checklist", "/training/checklist", "fa-list-check", "Practice"], ["Running Count", "/training/running-count", "fa-bolt", "Practice"], ["True Count", "/training/true-count", "fa-divide", "Practice"], ["Basic Strategy", "/training/basic-strategy", "fa-layer-group", "Practice"], ["Deviations", "/training/deviations", "fa-code-branch", "Practice"], ["H17 Chart", "/training/h17-chart", "fa-table-cells", "Practice"], ["Deck Estimation", "/training/deck-estimation", "fa-ruler", "Practice"], ["Counting Benchmark", "/training/benchmark", "fa-medal", "Practice"], ["Proficiency Test", "/training/proficiency-test", "fa-award", "Practice"],
  ["Game & Bankroll Lab", "/cvcx", "fa-chart-area", "Analyze"], ["Bet Spread Recommender", "/bet-spread-recommender", "fa-layer-group", "Analyze"], ["Session Simulator", "/simulation", "fa-wave-square", "Analyze"], ["Session Journal", "/journal", "fa-book", "Analyze"], ["Compare Scenarios", "/compare", "fa-code-compare", "Analyze"], ["Trip Planner", "/trip-planner", "fa-plane-departure", "Analyze"],
  ["Double Down Madness", "/double-down-madness", "fa-bolt", "Play"], ["Ultimate Texas Hold'em", "/ultimate-texas-holdem", "fa-clover", "Play"], ["Chase the Flush", "/chase-flush", "fa-diamond", "Play"],
  ["Hi-Lo System", "/reference", "fa-book-open", "Reference"], ["Basic Strategy Reference", "/reference/basic-strategy", "fa-table-cells", "Reference"], ["Index Deviations", "/reference/deviations", "fa-list", "Reference"],
  ["Dashboard", "/dashboard", "fa-house", "Utility"], ["Statistics", "/statistics", "fa-chart-line", "Utility"], ["Settings", "/settings", "fa-gear", "Utility"],
];
const areas = [
  ["Practice", "/practice", "fa-bolt"], ["Analyze", "/analyze", "fa-chart-area"], ["Play", "/play", "fa-dice"], ["Reference", "/reference", "fa-book-open"],
] as const;
const areaPaths = Object.fromEntries(areas.map(([name]) => [name, new Set(destinations.filter(([, , , area]) => area === name).map(([, href]) => href))])) as Record<(typeof areas)[number][0], Set<string>>;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(),
    path = usePathname().replace(/\/$/, "") || "/dashboard",
    fullShoeActive = path === "/training/full-shoe",
    [open, setOpen] = useState(false),
    [rules, setRules] = useState(DEFAULT_SETTINGS),
    [streakDays, setStreakDays] = useState(0),
    [standalone, setStandalone] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false),
    [paletteQuery, setPaletteQuery] = useState(""),
    toggle = useRef<HTMLButtonElement>(null),
    navigation = useRef<HTMLElement>(null),
    isAdmin = useIsAdmin();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const navigationElement = navigation.current;
    const toggleElement = toggle.current;
    navigationElement?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(navigation.current?.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])") ?? []);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", close);
    return () => {
      removeEventListener("keydown", close);
      if (navigationElement?.contains(document.activeElement)) (previous ?? toggleElement)?.focus();
    };
  }, [open]);
  useEffect(() => {
    const load = () => {
      setRules(storage.settings());
      setStreakDays(computeStreak(storage.sessions()).currentStreakDays);
    };
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
  useEffect(() => {
    const applyTheme = () => {
      const theme = storage.settings().theme;
      const root = document.documentElement;
      if (theme === "system") root.removeAttribute("data-theme");
      else root.dataset.theme = theme;
    };
    applyTheme();
    addEventListener("hilo-storage", applyTheme);
    return () => removeEventListener("hilo-storage", applyTheme);
  }, []);
  useEffect(() => { registerServiceWorker(); }, []);
  // This static export is shared by every visitor, so only inspect the
  // environment after mount rather than baking one client's state into HTML.
  useEffect(() => { setStandalone(isStandalone(readPwaEnv())); }, []);
  useEffect(() => { setStreakBadge(streakDays); }, [streakDays]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, []);
  const paletteMatches = destinations.filter(([name, href, , area]) => `${name} ${href} ${area}`.toLowerCase().includes(paletteQuery.trim().toLowerCase()));
  const goTo = (href: string) => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setOpen(false);
    router.push(href);
  };
  useEffect(() => {
    const activateVisiblePrimaryAction = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest("input, select, textarea, a, [contenteditable='true']")) return;
        const focusedButton = target.closest("button") as HTMLButtonElement | null;
        if (focusedButton && !focusedButton.disabled) return;
      }
      const actions = Array.from(document.querySelectorAll<HTMLButtonElement>("main button[data-enter-action='true']:not(:disabled)"))
        .filter((button) => button.getClientRects().length > 0 && getComputedStyle(button).visibility !== "hidden");
      if (actions.length !== 1) return;
      event.preventDefault();
      actions[0].click();
    };
    addEventListener("keydown", activateVisiblePrimaryAction);
    return () => removeEventListener("keydown", activateVisiblePrimaryAction);
  }, []);
  return (
    <div className={`min-h-dvh overflow-x-clip text-[var(--ink)] ${path === "/training/full-shoe" || path === "/double-down-madness" || path === "/ultimate-texas-holdem" || path === "/chase-flush" ? "floor" : ""}`}>
      <button
        ref={toggle}
        type="button"
        aria-label="Toggle navigation"
        aria-controls="primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="pressable fixed left-3 top-[calc(.625rem+env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/55 text-sm shadow-xl backdrop-blur-2xl lg:hidden"
      >
        <i className="fa-solid fa-bars" />
      </button>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="primary-navigation"
        ref={navigation}
        aria-label="Primary navigation"
        data-analytics-nav="sidebar"
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-40 w-[min(17rem,86vw)] overflow-y-auto border-r border-white/[.07] bg-[#101411]/95 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-[20px_0_70px_rgba(0,0,0,.18)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:w-[17rem] lg:translate-x-0`}
      >
        <Link href="/dashboard" className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[.9rem] bg-gradient-to-br from-[#b4f27d] to-[#65c875] text-lg font-bold text-[#112010] shadow-[0_8px_24px_rgba(81,190,102,.22)]">
            A♠
          </span>
          <div>
            <b className="block tracking-[-.02em]">CountLab</b>
            <small className="text-zinc-500">Blackjack studio</small>
          </div>
        </Link>
        <nav className="space-y-5">
          <div className="space-y-1">
            <Link onClick={() => setOpen(false)} href="/dashboard" className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === "/dashboard" ? "bg-white/[.09] text-white" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}><i className="fa-solid fa-house w-4 text-center text-[.78rem]" />Dashboard</Link>
            {areas.map(([name, href, icon]) => {
              const active = path === href || areaPaths[name].has(path);
              return <Link onClick={() => setOpen(false)} key={href} href={href} className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${active ? "bg-white/[.09] text-white" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-4 text-center text-[.78rem]`} />{name}</Link>;
            })}
          </div>
          <button type="button" onClick={() => setPaletteOpen(true)} className="pressable flex min-h-11 w-full items-center justify-between rounded-xl border border-white/[.08] bg-white/[.04] px-3 text-sm text-zinc-300 hover:bg-white/[.08]"><span><i className="fa-solid fa-magnifying-glass mr-2" />Find a tool</span><kbd>⌘K</kbd></button>
          <div className="border-t border-white/[.06] pt-4">
            <p className="mb-2 px-3 text-[.63rem] font-bold uppercase tracking-[.18em] text-zinc-600">Utility</p>
            {destinations.filter(([, href, , area]) => area === "Utility" && href !== "/dashboard").map(([name, href, icon]) => <Link onClick={() => setOpen(false)} key={href} href={href} className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === href ? "bg-white/[.09] text-white" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}><i className={`fa-solid ${icon} w-4 text-center text-[.78rem]`} />{name}</Link>)}
          </div>
          {isAdmin && (
            <div>
              <p className="mb-2 px-3 text-[.63rem] font-bold uppercase tracking-[.18em] text-zinc-600">
                Admin
              </p>
              <div className="space-y-1">
                <Link
                  onClick={() => setOpen(false)}
                  href="/admin"
                  className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === "/admin" ? "bg-white/[.09] text-white shadow-[0_1px_0_rgba(255,255,255,.05)_inset]" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}
                >
                  <i className="fa-solid fa-chart-simple w-4 text-center text-[.78rem]" />
                  Analytics
                </Link>
              </div>
            </div>
          )}
        </nav>
      </aside>
      <main className="min-h-dvh min-w-0 lg:pl-[17rem]">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-w-0 items-center justify-end gap-2 border-b border-[var(--rule)] bg-[var(--paper-raised)]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-3 sm:px-5 md:px-8">
          {!standalone && (
            <>
              {/* This deliberately leaves the Next.js base path to return to the portfolio. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                aria-label="Go to CountLab home"
                className="pressable grid min-h-11 min-w-11 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300 hover:bg-white/[.09]"
              >
                <i className="fa-solid fa-arrow-up-right-from-square sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Home</span>
              </a>
            </>
          )}
          {streakDays > 0 && (
            <span
              aria-label={`${streakDays}-day practice streak`}
              className="grid min-h-11 shrink-0 place-items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-3 text-[.7rem] font-semibold tracking-[.04em] text-amber-200"
            >
              <i className="fa-solid fa-fire mr-1.5 text-amber-300" aria-hidden="true" />{streakDays}
            </span>
          )}
          <Link
            href="/settings"
            aria-label={`Training default rules: ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "No DAS"}, ${rules.resplitAces ? "RSA" : "No RSA"}, ${rules.lateSurrender ? "late surrender" : "no surrender"}. Analysis pages carry their own rules. Open settings.`}
            className="pressable grid min-h-11 shrink-0 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300 hover:bg-white/[.09]"
          >
            <span className="sm:hidden">{rules.dealerHitsSoft17 ? "H17" : "S17"}</span>
            <span className="hidden sm:inline">
              <span className="mr-1.5 text-zinc-500">Drills</span>{rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.resplitAces ? "RSA" : "No RSA"} · {rules.lateSurrender ? "LS" : "No surrender"}
            </span>
          </Link>
        </header>
        <div className={`mx-auto min-w-0 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:p-5 sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-24 lg:pb-20 ${fullShoeActive ? "max-w-[130rem]" : "max-w-[90rem]"}`}>
          <div className={fullShoeActive ? undefined : "hidden"} aria-hidden={!fullShoeActive}>
            <FullShoeGame active={fullShoeActive} />
          </div>
          {!fullShoeActive && path === "/dashboard" && <Onboarding />}
          {!fullShoeActive && children}
        </div>
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-[var(--rule)] bg-[var(--paper-raised)]/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,.12)] backdrop-blur lg:hidden"
      >
        {[
          ["Practice", "/practice", "fa-bolt"],
          ["Analyze", "/analyze", "fa-chart-area"],
          ["Play", "/play", "fa-dice"],
          ["Reference", "/reference", "fa-book-open"],
        ].map(([name, href, icon]) => {
          const active = path === href || areaPaths[name as keyof typeof areaPaths].has(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[.68rem] font-medium ${active ? "text-emerald-300" : "text-zinc-500"}`}
            >
              <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
              {name}
            </Link>
          );
        })}
      </nav>
      {paletteOpen && (
        <div role="presentation" className="fixed inset-0 z-[80] grid place-items-start bg-black/55 p-4 pt-[max(5rem,12vh)] backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPaletteOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Find a tool" className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] shadow-2xl">
            <label className="sr-only" htmlFor="command-palette-input">Find a tool</label>
            <div className="flex items-center border-b border-[var(--rule)] px-4"><i className="fa-solid fa-magnifying-glass text-[var(--ink-muted)]" aria-hidden="true" /><input id="command-palette-input" autoFocus value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setPaletteOpen(false); if (event.key === "Enter" && paletteMatches[0]) goTo(paletteMatches[0][1]); }} placeholder="Search every tool…" className="min-h-14 w-full bg-transparent px-3 text-[var(--ink)] outline-none" /><kbd>Esc</kbd></div>
            <div className="max-h-[min(60svh,30rem)] overflow-y-auto p-2">
              {paletteMatches.map(([name, href, icon, area]) => <button type="button" key={href} onClick={() => goTo(href)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-[var(--paper)]"><i className={`fa-solid ${icon} w-4 text-center text-[var(--ink-muted)]`} /><span className="flex-1">{name}</span><span className="text-xs text-[var(--ink-muted)]">{area}</span></button>)}
              {!paletteMatches.length && <p className="p-4 text-sm text-[var(--ink-muted)]">No matching tool.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
