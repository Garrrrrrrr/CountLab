"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, storage, SURRENDER_RULE_LABEL, type Settings, type SurrenderRule } from "@/lib/statistics/storage";
import { computeStreak } from "@/lib/statistics/streaks";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";
import { setStreakBadge } from "@/lib/pwa/appBadge";
import { useModalFocus } from "@/lib/useModalFocus";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { headerTitle, isKnownRoute, NAV_GROUPS, type NavGroup, normalizePath, routeArea, ROUTE_DESCRIPTIONS, searchTools } from "@/lib/routes";
import { useIsAdmin } from "@/lib/supabase/admin";
import { CONTACT_EMAIL } from "@/lib/contact";
import { BrandLockup, BrandMark } from "./Brand";

/** The rules badge is tight on width, so the rule gets an abbreviation rather than its full label. */
const SURRENDER_BADGE: Record<SurrenderRule, string> = { none: "No surrender", late: "LS", early: "ES10" };
/** Casino tables always sit on dark felt, whatever the reader's theme. */
const FLOOR_ROUTES = new Set(["/training/full-shoe", "/double-down-madness", "/ultimate-texas-holdem", "/chase-flush"]);

const FullShoeGame = dynamic(() => import("@/components/FullShoeGame").then((m) => ({ default: m.FullShoeGame })), { loading: () => null });
const Onboarding = dynamic(() => import("@/components/Onboarding").then((m) => ({ default: m.Onboarding })), { loading: () => null });

const navItemClass = (active: boolean) =>
  `pressable group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[.86rem] font-medium lg:min-h-9 ${active ? "bg-overlay/[.08] text-[var(--ink)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--accent)]" : "text-[var(--ink-muted)] hover:bg-overlay/[.045] hover:text-[var(--ink)]"}`;
const NAV_COLLAPSED_KEY = "countlab:nav-collapsed";
/** Each group's overview page, where it has one, is listed first under a label that says what it holds. */
const HUB_LABEL: Partial<Record<NavGroup["id"], string>> = { practice: "All drills", plan: "Overview", games: "All games" };
const navIconClass = (active: boolean) => `w-4 text-center text-[.78rem] ${active ? "text-[var(--accent)]" : ""}`;
const pillClass = "pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--paper)] px-3 text-[.72rem] font-semibold tracking-[.02em] text-[var(--ink)] hover:border-[var(--ink-muted)]";

/** Resolves "system" to what the reader is actually seeing, so the toggle always flips the visible theme. */
function effectiveTheme(theme: Settings["theme"]): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(),
    path = normalizePath(usePathname()),
    fullShoeActive = path === "/training/full-shoe",
    [shoeVisited, setShoeVisited] = useState(false),
    [desktop, setDesktop] = useState(false),
    [paletteIndex, setPaletteIndex] = useState(0),
    palette = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [rules, setRules] = useState(DEFAULT_SETTINGS),
    [shownTheme, setShownTheme] = useState<"light" | "dark">("light"),
    [streakDays, setStreakDays] = useState(0),
    [paletteOpen, setPaletteOpen] = useState(false),
    [paletteReady, setPaletteReady] = useState(false),
    [paletteQuery, setPaletteQuery] = useState(""),
    navigation = useRef<HTMLElement>(null),
    [collapsed, setCollapsed] = useState<string[]>([]),
    isAdmin = useIsAdmin();
  const { user, guest, syncStatus } = useAuth();
  // The shared 404 page is prerendered under its own path, so unknown URLs get
  // no area and a fixed title; anything path-derived would fail to hydrate.
  const known = isKnownRoute(path);
  const area = known ? routeArea(path) : undefined;
  const title = known ? headerTitle(path) : "Page not found";
  const floor = FLOOR_ROUTES.has(path);
  const activeGroup = known ? NAV_GROUPS.find((group) => group.hub === path || group.items.some((item) => item.href === path))?.id : undefined;
  // Collapsed groups are a reading preference, restored after mount so the prerendered sidebar matches first paint.
  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(NAV_COLLAPSED_KEY) || "[]")); } catch { /* keep every group open */ }
  }, []);
  // Arriving at a tool inside a collapsed group opens that group so the current page is never hidden.
  useEffect(() => {
    if (activeGroup) setCollapsed((current) => current.includes(activeGroup) ? current.filter((id) => id !== activeGroup) : current);
  }, [activeGroup]);
  const toggleGroup = (id: string) => setCollapsed((current) => {
    const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    try { localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(next)); } catch { /* the choice lasts for this visit */ }
    return next;
  });
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
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const theme = storage.settings().theme;
      const root = document.documentElement;
      if (theme === "system") root.removeAttribute("data-theme");
      else root.dataset.theme = theme;
      setShownTheme(effectiveTheme(theme));
    };
    applyTheme();
    addEventListener("hilo-storage", applyTheme);
    scheme.addEventListener("change", applyTheme);
    return () => { removeEventListener("hilo-storage", applyTheme); scheme.removeEventListener("change", applyTheme); };
  }, []);
  useEffect(() => { registerServiceWorker(); }, []);
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
  const paletteMatches = searchTools(paletteQuery);
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
  const accountLabel = user
    ? (syncStatus === "synced" ? "Synced" : syncStatus === "syncing" ? "Syncing" : syncStatus === "error" ? "Sync needs attention" : "Not synced")
    : guest ? "Guest" : "Sign in";
  const accountDot = user ? (syncStatus === "synced" ? "bg-emerald-500" : syncStatus === "error" ? "bg-[var(--negative)]" : "bg-[var(--warning)]") : "";
  const closeDrawer = () => setOpen(false);
  return (
    <div className={`flex min-h-dvh flex-col overflow-x-clip text-[var(--ink)] ${floor ? "floor" : ""}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-[var(--paper-raised)] focus:p-4">Skip to content</a>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={closeDrawer}
        />
      )}
      <aside
        id="primary-navigation"
        inert={!open && !desktop}
        tabIndex={-1}
        ref={navigation}
        aria-label="Primary navigation"
        data-analytics-nav="sidebar"
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-40 flex w-[min(17rem,86vw)] flex-col overflow-y-auto border-r border-[var(--rule)] bg-[var(--paper-raised)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-[20px_0_70px_rgba(0,0,0,.18)] transition-transform duration-300 ease-out lg:w-[17rem] lg:translate-x-0 lg:shadow-none`}
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          <Link href="/" onClick={closeDrawer} aria-label="CountLab home" className="ml-1 rounded-xl">
            <BrandLockup />
          </Link>
          <button type="button" onClick={closeDrawer} aria-label="Close menu" className="pressable grid h-11 w-11 place-items-center rounded-xl border border-[var(--rule)] text-sm lg:hidden"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </div>
        <button type="button" disabled={!paletteReady} onClick={() => setPaletteOpen(true)} className="pressable mb-4 flex min-h-11 w-full shrink-0 items-center justify-between rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-3 text-sm text-[var(--ink-muted)] hover:border-[var(--ink-muted)] hover:text-[var(--ink)] lg:min-h-10"><span><i className="fa-solid fa-magnifying-glass mr-2" aria-hidden="true" />Find a tool</span><kbd className="hidden lg:inline">Ctrl / ⌘ K</kbd></button>
        <nav aria-label="Tools" className="flex flex-1 flex-col gap-1">
          <Link onClick={closeDrawer} href="/dashboard" aria-current={path === "/dashboard" ? "page" : undefined} className={navItemClass(path === "/dashboard")}><i className={`fa-solid fa-house ${navIconClass(path === "/dashboard")}`} aria-hidden="true" />Dashboard</Link>
          {NAV_GROUPS.map((group) => {
            const expanded = !collapsed.includes(group.id);
            const items = group.hub && HUB_LABEL[group.id] ? [{ name: HUB_LABEL[group.id]!, href: group.hub, icon: "fa-grip" }, ...group.items] : group.items;
            return (
              <div key={group.id} className="mt-3">
                <button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={expanded} aria-controls={`nav-group-${group.id}`} className={`pressable flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[.7rem] font-bold uppercase tracking-[.14em] hover:bg-overlay/[.045] lg:min-h-8 ${activeGroup === group.id ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
                  <span className="flex-1">{group.name}</span>
                  <i className={`fa-solid fa-chevron-down text-[.6rem] transition-transform ${expanded ? "" : "-rotate-90"}`} aria-hidden="true" />
                </button>
                <ul id={`nav-group-${group.id}`} hidden={!expanded} className="mt-0.5 space-y-0.5">
                  {items.map((item) => {
                    const current = path === item.href;
                    return <li key={item.href}><Link onClick={closeDrawer} href={item.href} aria-current={current ? "page" : undefined} className={navItemClass(current)}><i className={`fa-solid ${item.icon} ${navIconClass(current)}`} aria-hidden="true" /><span className="truncate">{item.name}</span></Link></li>;
                  })}
                </ul>
              </div>
            );
          })}
          <div className="mt-4 border-t border-[var(--rule)] pt-3">
            <Link onClick={closeDrawer} href="/settings" aria-current={path === "/settings" ? "page" : undefined} className={navItemClass(path === "/settings")}><i className={`fa-solid fa-gear ${navIconClass(path === "/settings")}`} aria-hidden="true" />Settings</Link>
          </div>
          {isAdmin && (
            <div className="mt-3">
              <p className="mb-1 px-3 text-[.7rem] font-bold uppercase tracking-[.14em] text-[var(--ink-muted)]">Admin</p>
              <div className="space-y-0.5">
                <Link onClick={closeDrawer} href="/admin" aria-current={path === "/admin" ? "page" : undefined} className={navItemClass(path === "/admin")}><i className={`fa-solid fa-chart-simple ${navIconClass(path === "/admin")}`} aria-hidden="true" />Analytics</Link>
                <Link onClick={closeDrawer} href="/admin/directory" aria-current={path === "/admin/directory" ? "page" : undefined} className={navItemClass(path === "/admin/directory")}><i className={`fa-solid fa-map-location-dot ${navIconClass(path === "/admin/directory")}`} aria-hidden="true" />Game directory</Link>
              </div>
            </div>
          )}
          <div className="flex-1" aria-hidden="true" />
          <div className="mt-6 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3 text-xs leading-5 text-[var(--ink-muted)]">
            {user ? <><b className="block text-[var(--ink)]">Signed in</b>Training and journal sync to your account.</>
              : <><b className="block text-[var(--ink)]">{guest ? "Guest mode" : "Not signed in"}</b>Progress stays on this device. <Link href="/signin" onClick={closeDrawer} className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">{guest ? "Add an account" : "Sign in"}</Link> for backup and sync.</>}
          </div>
        </nav>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:pl-[17rem]">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-w-0 items-center gap-2 border-b border-[var(--rule)] bg-[var(--paper-raised)] pl-3 pr-3 pt-[env(safe-area-inset-top)] sm:gap-3 sm:pl-5 sm:pr-5 md:px-8">
          <Link href="/" aria-label="CountLab home" className="shrink-0 rounded-[.65rem] lg:hidden"><BrandMark size="sm" /></Link>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2 text-sm">
              {area && area.href !== path && <li className="hidden shrink-0 items-center gap-2 sm:flex">{area.href ? <Link href={area.href} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">{area.name}</Link> : <span className="text-[var(--ink-muted)]">{area.name}</span>}<i className="fa-solid fa-chevron-right text-[.6rem] text-[var(--ink-muted)]" aria-hidden="true" /></li>}
              <li className="min-w-0 truncate font-semibold" aria-current="page">{title}</li>
            </ol>
          </nav>
          {streakDays > 0 && (
            <span aria-label={`${streakDays}-day practice streak`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-3 text-[.72rem] font-semibold text-[var(--warning)]">
              <i className="fa-solid fa-fire mr-1.5" aria-hidden="true" />{streakDays}
            </span>
          )}
          <Link
            href="/settings"
            aria-label={`Training default rules: ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "No DAS"}, ${rules.resplitAces ? "RSA" : "No RSA"}, ${SURRENDER_RULE_LABEL[rules.surrender].toLowerCase()}. Analysis pages carry their own rules. Open settings.`}
            title="Training default rules — analysis pages carry their own"
            className={pillClass}
          >
            <span className="sm:hidden">{rules.dealerHitsSoft17 ? "H17" : "S17"}</span>
            <span className="hidden sm:inline">
              <span className="mr-1 font-medium text-[var(--ink-muted)]">Training</span>{rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.resplitAces ? "RSA" : "No RSA"} · {SURRENDER_BADGE[rules.surrender]}
            </span>
          </Link>
          {!floor && (
            <button
              type="button"
              onClick={() => storage.saveTheme(shownTheme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${shownTheme === "dark" ? "light" : "dark"} theme`}
              className={`${pillClass} w-11 justify-center px-0`}
            >
              <i className={`fa-solid ${shownTheme === "dark" ? "fa-sun" : "fa-moon"}`} aria-hidden="true" />
            </button>
          )}
          <Link href={user || guest ? "/settings" : "/signin"} aria-label={user ? `Account: ${accountLabel}` : guest ? "Guest: progress saved on this device" : "Sign in"} className={user || guest ? pillClass : "pressable inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--ink)] px-4 text-[.78rem] font-semibold text-[var(--paper)] hover:opacity-90"}>
            {user ? <><span aria-hidden="true" className={`h-2 w-2 rounded-full ${accountDot}`} /><span className="hidden sm:inline">{accountLabel}</span><i className="fa-solid fa-user sm:hidden" aria-hidden="true" /></>
              : guest ? <><i className="fa-solid fa-user-clock text-[var(--ink-muted)]" aria-hidden="true" /><span className="hidden sm:inline">Guest</span></>
              : "Sign in"}
          </Link>
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className={`mx-auto min-w-0 px-4 pb-10 pt-4 sm:px-5 sm:pt-5 md:px-8 md:pt-8 ${fullShoeActive ? "max-w-[130rem]" : "max-w-[90rem]"}`}>
            <div className={fullShoeActive ? undefined : "hidden"} aria-hidden={!fullShoeActive}>
              {(fullShoeActive || shoeVisited) && <FullShoeGame active={fullShoeActive} />}
            </div>
            {!fullShoeActive && path === "/dashboard" && <Onboarding />}
            {!fullShoeActive && children}
          </div>
        </main>
        <footer className="border-t border-[var(--rule)] px-4 pb-[calc(6rem+var(--dock-clearance,0px)+env(safe-area-inset-bottom))] pt-6 text-xs text-[var(--ink-muted)] sm:px-5 md:px-8 lg:pb-8">
          <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${fullShoeActive ? "max-w-[130rem]" : "max-w-[90rem]"}`}>
            <p>CountLab · Blackjack training and analysis. For education; no real-money play.</p>
            <nav aria-label="Legal and contact" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/terms" className="hover:text-[var(--ink)]">Terms</Link>
              <Link href="/privacy" className="hover:text-[var(--ink)]">Privacy</Link>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[var(--ink)]">Contact</a>
            </nav>
          </div>
        </footer>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--rule)] bg-[var(--paper-raised)] px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,.1)] lg:hidden"
      >
        {([
          { name: "Dashboard", href: "/dashboard", icon: "fa-house", active: path === "/dashboard" },
          { name: "Practice", href: "/practice", icon: "fa-bolt", active: activeGroup === "practice" },
          { name: "Charts", href: "/reference", icon: "fa-table-cells-large", active: activeGroup === "reference" },
          { name: "Journal", href: "/journal", icon: "fa-book", active: path === "/journal" },
        ] as const).map(({ name, href, icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`pressable relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[.66rem] font-medium ${active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}
          >
            {active && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--accent)]" />}
            <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
            {name}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-controls="primary-navigation"
          aria-expanded={open}
          className={`pressable relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[.66rem] font-medium ${open || (activeGroup && !["practice", "reference"].includes(activeGroup) && path !== "/journal") ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"}`}
        >
          <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
          Menu
        </button>
      </nav>
      {paletteOpen && (
        <div role="presentation" className="fixed inset-0 z-[80] grid place-items-start bg-black/45 p-4 pt-[max(5rem,12vh)] backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setPaletteOpen(false)}>
          <div ref={palette} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Find a tool" className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)] shadow-2xl">
            <label className="sr-only" htmlFor="command-palette-input">Find a tool</label>
            <div className="flex items-center border-b border-[var(--rule)] px-4"><i className="fa-solid fa-magnifying-glass text-[var(--ink-muted)]" aria-hidden="true" /><input id="command-palette-input" role="combobox" aria-expanded="true" aria-controls="tool-results" aria-autocomplete="list" aria-activedescendant={paletteMatches.length ? `tool-result-${paletteIndex}` : undefined} autoFocus value={paletteQuery} onChange={(event) => { setPaletteQuery(event.target.value); setPaletteIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") setPaletteOpen(false); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setPaletteIndex((index) => Math.max(0, Math.min(paletteMatches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); } if (event.key === "Enter" && paletteMatches[paletteIndex]) goTo(paletteMatches[paletteIndex][1]); }} placeholder="Search tools, drills, and games…" className="min-h-14 w-full bg-transparent px-3 text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]" /><button type="button" aria-label="Close tool search" onClick={() => setPaletteOpen(false)} className="min-h-11 rounded-lg px-3 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"><kbd className="ml-0">Esc</kbd></button></div>
            <div id="tool-results" role="listbox" aria-label="Matching tools" className="max-h-[min(60svh,30rem)] overflow-y-auto p-2">
              {paletteMatches.map(([name, href, icon, toolArea], index) => <button id={`tool-result-${index}`} role="option" aria-selected={paletteIndex === index} tabIndex={-1} type="button" key={href} onMouseMove={() => setPaletteIndex(index)} onClick={() => goTo(href)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${paletteIndex === index ? "bg-[var(--paper)] ring-1 ring-inset ring-[var(--focus)]" : ""}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--paper)] text-[var(--count-cold)]"><i className={`fa-solid ${icon} text-xs`} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block font-medium">{name}</span>{ROUTE_DESCRIPTIONS[href] && <span className="block truncate text-xs text-[var(--ink-muted)]">{ROUTE_DESCRIPTIONS[href]}</span>}</span><span className="shrink-0 text-xs text-[var(--ink-muted)]">{toolArea}</span></button>)}
              {!paletteMatches.length && <p className="p-4 text-sm text-[var(--ink-muted)]">No matching tool. Try “count”, “bankroll”, or “chart”.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
