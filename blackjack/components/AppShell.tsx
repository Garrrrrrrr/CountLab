"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, storage, SURRENDER_RULE_LABEL, type SurrenderRule } from "@/lib/statistics/storage";

/** The rules badge is tight on width, so the rule gets an abbreviation rather than its full label. */
const SURRENDER_BADGE: Record<SurrenderRule, string> = { none: "No surrender", late: "LS", early: "ES10" };
import { computeStreak } from "@/lib/statistics/streaks";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";
import { isStandalone, readPwaEnv } from "@/lib/pwa/standalone";
import { setStreakBadge } from "@/lib/pwa/appBadge";
import { useModalFocus } from "@/lib/useModalFocus";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { TOOL_ROUTES } from "@/lib/routes";
import { useIsAdmin } from "@/lib/supabase/admin";

const FullShoeGame = dynamic(() => import("@/components/FullShoeGame").then((m) => ({ default: m.FullShoeGame })), { loading: () => null });
const Onboarding = dynamic(() => import("@/components/Onboarding").then((m) => ({ default: m.Onboarding })), { loading: () => null });
const destinations = TOOL_ROUTES;
const areas = [
  ["Practice", "/practice", "fa-bolt"], ["Analyze", "/analyze", "fa-chart-area"], ["Games", "/play", "fa-dice"], ["Reference", "/reference", "fa-book-open"],
] as const;
const areaPaths = Object.fromEntries(areas.map(([name]) => [name, new Set(destinations.filter(([, , , area]) => area === name).map(([, href]) => href))])) as Record<(typeof areas)[number][0], Set<string>>;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(),
    path = usePathname().replace(/\/$/, "") || "/",
    fullShoeActive = path === "/training/full-shoe",
    [shoeVisited, setShoeVisited] = useState(false),
    [desktop, setDesktop] = useState(false),
    [paletteIndex, setPaletteIndex] = useState(0),
    palette = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [rules, setRules] = useState(DEFAULT_SETTINGS),
    [streakDays, setStreakDays] = useState(0),
    [standalone, setStandalone] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false),
    [paletteReady, setPaletteReady] = useState(false),
    [paletteQuery, setPaletteQuery] = useState(""),
    toggle = useRef<HTMLButtonElement>(null),
    navigation = useRef<HTMLElement>(null),
    isAdmin = useIsAdmin();
  const { user, guest, syncStatus } = useAuth();
  useModalFocus(open && !paletteOpen, navigation, () => setOpen(false));
  useModalFocus(paletteOpen, palette, () => setPaletteOpen(false));
  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const update = () => { setDesktop(media.matches); if (media.matches) setOpen(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (fullShoeActive) setShoeVisited(true); }, [fullShoeActive]);
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
    setPaletteReady(true);
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
      if (!storage.settings().shortcuts || document.querySelector("[aria-modal='true']")) return;
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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-[var(--paper-raised)] focus:p-4">Skip to content</a>
      <button
        ref={toggle}
        type="button"
        aria-label="Toggle navigation"
        aria-controls="primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="pressable fixed left-3 top-[calc(.625rem+env(safe-area-inset-top))] z-50 grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-[var(--paper-raised)] text-sm shadow-xl backdrop-blur-2xl lg:hidden"
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
        inert={!open && !desktop}
        tabIndex={-1}
        ref={navigation}
        aria-label="Primary navigation"
        data-analytics-nav="sidebar"
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-40 w-[min(17rem,86vw)] overflow-y-auto border-r border-white/[.07] bg-[var(--paper-raised)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-[20px_0_70px_rgba(0,0,0,.18)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:w-[17rem] lg:translate-x-0`}
      >
        <Link href="/dashboard" className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[.9rem] bg-gradient-to-br from-[#b4f27d] to-[#65c875] text-lg font-bold text-[#112010] shadow-[0_8px_24px_rgba(81,190,102,.22)]">
            A♠
          </span>
          <div>
            <b className="block tracking-[-.02em]">CountLab</b>
            <small className="text-[var(--ink-muted)]">Blackjack studio</small>
          </div>
        </Link>
        <nav className="space-y-5">
          <div className="space-y-1">
            <Link onClick={() => setOpen(false)} href="/dashboard" aria-current={path === "/dashboard" ? "page" : undefined} className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === "/dashboard" ? "bg-white/[.09] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-white/[.045] hover:text-[var(--ink)]"}`}><i className="fa-solid fa-house w-4 text-center text-[.78rem]" />Dashboard</Link>
            {areas.map(([name, href, icon]) => {
              const active = path === href || areaPaths[name].has(path);
              return <Link onClick={() => setOpen(false)} key={href} href={href} aria-current={active ? (path === href ? "page" : "location") : undefined} className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${active ? "bg-white/[.09] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-white/[.045] hover:text-[var(--ink)]"}`}><i className={`fa-solid ${icon} w-4 text-center text-[.78rem]`} />{name}</Link>;
            })}
          </div>
          <button type="button" disabled={!paletteReady} onClick={() => setPaletteOpen(true)} className="pressable flex min-h-11 w-full items-center justify-between rounded-xl border border-white/[.08] bg-white/[.04] px-3 text-sm text-[var(--ink)] hover:bg-white/[.08]"><span><i className="fa-solid fa-magnifying-glass mr-2" />Find a tool</span><kbd>Ctrl / ⌘ K</kbd></button>
          <div className="border-t border-white/[.06] pt-4">
            <p className="mb-2 px-3 text-[.63rem] font-bold uppercase tracking-[.18em] text-[var(--ink-muted)]">Utility</p>
            {destinations.filter(([, href, , area]) => area === "Utility" && href !== "/dashboard").map(([name, href, icon]) => <Link onClick={() => setOpen(false)} key={href} href={href} aria-current={path === href ? "page" : undefined} className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === href ? "bg-white/[.09] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-white/[.045] hover:text-[var(--ink)]"}`}><i className={`fa-solid ${icon} w-4 text-center text-[.78rem]`} />{name}</Link>)}
          </div>
          {isAdmin && (
            <div>
              <p className="mb-2 px-3 text-[.63rem] font-bold uppercase tracking-[.18em] text-[var(--ink-muted)]">
                Admin
              </p>
              <div className="space-y-1">
                <Link
                  onClick={() => setOpen(false)}
                  href="/admin"
                  className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === "/admin" ? "bg-white/[.09] text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,.05)_inset]" : "text-[var(--ink-muted)] hover:bg-white/[.045] hover:text-[var(--ink)]"}`}
                >
                  <i className="fa-solid fa-chart-simple w-4 text-center text-[.78rem]" />
                  Analytics
                </Link>
                <Link
                  onClick={() => setOpen(false)}
                  href="/admin/directory"
                  aria-current={path === "/admin/directory" ? "page" : undefined}
                  className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === "/admin/directory" ? "bg-white/[.09] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:bg-white/[.045] hover:text-[var(--ink)]"}`}
                >
                  <i className="fa-solid fa-map-location-dot w-4 text-center text-[.78rem]" />
                  Game directory
                </Link>
              </div>
            </div>
          )}
        </nav>
      </aside>
      <main id="main-content" tabIndex={-1} className="min-h-dvh min-w-0 lg:pl-[17rem]">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-w-0 items-center justify-end gap-2 border-b border-[var(--rule)] bg-[var(--paper-raised)]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-3 sm:px-5 md:px-8">
          <Link href={user || guest ? "/settings" : "/signin"} className="text-xs font-medium text-[var(--ink-muted)]">{user ? (syncStatus === "synced" ? "Account · Synced" : syncStatus === "syncing" ? "Account · Syncing" : syncStatus === "error" ? "Account · Sync needs attention" : "Account · Not synced") : guest ? "Guest · Saved on this device" : "Sign in"}</Link>
          {!standalone && (
            <>
              {/* This deliberately leaves the Next.js base path to return to the portfolio. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                aria-label="Go to CountLab home"
                className="pressable grid min-h-11 min-w-11 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-[var(--ink)] hover:bg-white/[.09]"
              >
                <i className="fa-solid fa-arrow-up-right-from-square sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Home</span>
              </a>
            </>
          )}
          {streakDays > 0 && (
            <span
              aria-label={`${streakDays}-day practice streak`}
              className="grid min-h-11 shrink-0 place-items-center rounded-full border border-amber-300/20 bg-amber-300/10 px-3 text-[.7rem] font-semibold tracking-[.04em] text-[var(--warning)]"
            >
              <i className="fa-solid fa-fire mr-1.5 text-[var(--warning)]" aria-hidden="true" />{streakDays}
            </span>
          )}
          <Link
            href="/settings"
            aria-label={`Training default rules: ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "No DAS"}, ${rules.resplitAces ? "RSA" : "No RSA"}, ${SURRENDER_RULE_LABEL[rules.surrender].toLowerCase()}. Analysis pages carry their own rules. Open settings.`}
            className="pressable grid min-h-11 shrink-0 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-[var(--ink)] hover:bg-white/[.09]"
          >
            <span className="sm:hidden">{rules.dealerHitsSoft17 ? "H17" : "S17"}</span>
            <span className="hidden sm:inline">
              <span className="mr-1.5 text-[var(--ink-muted)]">Training</span>{rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.resplitAces ? "RSA" : "No RSA"} · {SURRENDER_BADGE[rules.surrender]}
            </span>
          </Link>
        </header>
        <div className={`mx-auto min-w-0 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:p-5 sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-24 lg:pb-20 ${fullShoeActive ? "max-w-[130rem]" : "max-w-[90rem]"}`}>
          <div className={fullShoeActive ? undefined : "hidden"} aria-hidden={!fullShoeActive}>
            {(fullShoeActive || shoeVisited) && <FullShoeGame active={fullShoeActive} />}
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
          ["Games", "/play", "fa-dice"],
          ["Reference", "/reference", "fa-book-open"],
        ].map(([name, href, icon]) => {
          const active = path === href || areaPaths[name as keyof typeof areaPaths].has(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[.68rem] font-medium ${active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}
            >
              <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
              {name}
            </Link>
          );
        })}
      </nav>
      {paletteOpen && (
        <div role="presentation" className="fixed inset-0 z-[80] grid place-items-start bg-[var(--paper-raised)] p-4 pt-[max(5rem,12vh)] backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPaletteOpen(false)}>
          <div ref={palette} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Find a tool" className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] shadow-2xl">
            <label className="sr-only" htmlFor="command-palette-input">Find a tool</label>
            <div className="flex items-center border-b border-[var(--rule)] px-4"><i className="fa-solid fa-magnifying-glass text-[var(--ink-muted)]" aria-hidden="true" /><input id="command-palette-input" role="combobox" aria-expanded="true" aria-controls="tool-results" aria-autocomplete="list" aria-activedescendant={paletteMatches.length ? `tool-result-${paletteIndex}` : undefined} autoFocus value={paletteQuery} onChange={(event) => { setPaletteQuery(event.target.value); setPaletteIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") setPaletteOpen(false); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setPaletteIndex((index) => Math.max(0, Math.min(paletteMatches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter" && paletteMatches[paletteIndex]) goTo(paletteMatches[paletteIndex][1]); }} placeholder="Search every tool…" className="min-h-14 w-full bg-transparent px-3 text-[var(--ink)] outline-none" /><button type="button" aria-label="Close tool search" onClick={() => setPaletteOpen(false)} className="min-h-11 px-3">Close</button></div>
            <div id="tool-results" role="listbox" aria-label="Matching tools" className="max-h-[min(60svh,30rem)] overflow-y-auto p-2">
              {paletteMatches.map(([name, href, icon, area], index) => <button id={`tool-result-${index}`} role="option" aria-selected={paletteIndex === index} tabIndex={-1} type="button" key={href} onClick={() => goTo(href)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-[var(--paper)] ${paletteIndex === index ? "bg-[var(--paper)] ring-1 ring-inset ring-[var(--focus)]" : ""}`}><i className={`fa-solid ${icon} w-4 text-center text-[var(--ink-muted)]`} /><span className="flex-1">{name}</span><span className="text-xs text-[var(--ink-muted)]">{area}</span></button>)}
              {!paletteMatches.length && <p className="p-4 text-sm text-[var(--ink-muted)]">No matching tool.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
