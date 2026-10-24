"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BookOpen, ChartLine, Cloud, CloudOff, Target, Grid3x3, LoaderCircle, Settings as SettingsIcon, SquareFunction, UserRound } from "lucide-react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { DRILLS, PRIMARY_NAV, activeSection, isPublicPath, normalizePath, type NavItem } from "@/lib/routes";
import { cx } from "@/components/ui/cx";
import { ToastHost } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Surface";
import { FocusModeProvider, useIsFocused } from "./FocusMode";
import { Wordmark, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ConsentBar } from "./ConsentBar";
import { PasswordRecoverySheet } from "./PasswordRecoverySheet";
import { UpdateBar } from "./UpdateBar";
import { SettingsEffects } from "./SettingsEffects";

const ICONS: Record<NavItem["icon"], typeof Target> = {
  train: Target,
  charts: Grid3x3,
  calculator: SquareFunction,
  journal: BookOpen,
  progress: ChartLine,
  settings: SettingsIcon,
};

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FocusModeProvider>
      <Shell>{children}</Shell>
    </FocusModeProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = normalizePath(usePathname() ?? "/");
  const focused = useIsFocused();
  const bare = pathname === "/signin";
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only z-[80] rounded-lg bg-brand px-4 py-2 font-semibold text-brand-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      {!focused && !bare && <Sidebar pathname={pathname} />}
      <div className="min-w-0 flex-1">
        {!focused && !bare && <TopBar />}
        <main id="main" className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10", focused ? "pt-0" : "pt-4 sm:pt-6 lg:pt-10", !focused && "pb-tabbar")}>
          <Gate pathname={pathname}>{children}</Gate>
        </main>
        {!focused && !bare && <Footer />}
      </div>
      {!focused && !bare && <TabBar pathname={pathname} />}
      <ToastHost />
      <ConsentBar />
      <PasswordRecoverySheet />
      <UpdateBar />
      <SettingsEffects />
    </div>
  );
}

/**
 * Pages that read the reader's own data wait for sign-in to settle, so a
 * signed-in reader never briefly sees (or writes into) the guest copy. Public
 * pages render straight away.
 */
function Gate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { loading } = useAuth();
  if (loading && !isPublicPath(pathname)) {
    return (
      <div aria-busy="true" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-72" />
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
      </div>
    );
  }
  return <>{children}</>;
}

function SyncPill() {
  const { user, syncStatus, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <Link href="/signin" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
        <UserRound size={16} aria-hidden /> Sign in
      </Link>
    );
  }
  const Icon = syncStatus === "error" ? CloudOff : syncStatus === "syncing" ? LoaderCircle : Cloud;
  const label = syncStatus === "error" ? "Sync paused" : syncStatus === "syncing" ? "Syncing" : "Synced";
  return (
    <Link href="/settings#account" title={`${label} · ${user.email ?? "Account"}`} aria-label={`Account: ${label}`}
      className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium", syncStatus === "error" ? "text-warn" : "text-ink-2")}>
      <Icon size={16} aria-hidden className={syncStatus === "syncing" ? "animate-spin" : undefined} />
      <span className="hidden xs:inline">{label}</span>
    </Link>
  );
}

/** Phones and tablets: logo, account and settings. The page's own header carries the title. */
function TopBar() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl lg:hidden" style={{ paddingTop: "var(--safe-t)" }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="CountLab home" className="-ml-1 rounded-lg p-1"><Wordmark /></Link>
        <div className="flex items-center gap-1">
          <SyncPill />
          <ThemeToggle />
          <Link href="/settings" aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink">
            <SettingsIcon size={20} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Phones: the five destinations, always one tap away. */
function TabBar({ pathname }: { pathname: string }) {
  const active = activeSection(pathname);
  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "var(--safe-b)" }}>
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const Icon = ICONS[item.icon];
          const current = active?.href === item.href;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={current ? "page" : undefined}
                className={cx("flex h-full flex-col items-center justify-center gap-1 text-[0.625rem] font-semibold transition xs:text-[0.6875rem]", current ? "text-ink" : "text-ink-3 hover:text-ink-2")}>
                <span className={cx("grid h-7 w-12 place-items-center rounded-full transition", current && "bg-brand/20 text-brand-text")}>
                  <Icon size={20} strokeWidth={current ? 2.4 : 2} aria-hidden />
                </span>
                {item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop: the same destinations, with the drills listed under Train. */
function Sidebar({ pathname }: { pathname: string }) {
  const active = activeSection(pathname);
  const { user, loading } = useAuth();
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-5 lg:flex">
      <Link href="/" className="mb-6 rounded-xl px-2 py-1" aria-label="CountLab home"><Wordmark /></Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const current = active?.href === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}
                  className={cx("flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition", current ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink")}>
                  <Icon size={19} aria-hidden className={current ? "text-brand-text" : undefined} />
                  {item.name}
                </Link>
                {item.href === "/train" && current && (
                  <ul className="mb-2 ml-[1.375rem] mt-1 space-y-0.5 border-l border-line pl-3">
                    {DRILLS.map((drill) => (
                      <li key={drill.href}>
                        <Link href={drill.href} aria-current={pathname === drill.href ? "page" : undefined}
                          className={cx("flex h-8 items-center rounded-lg px-2.5 text-sm transition", pathname === drill.href ? "font-semibold text-ink" : "text-ink-3 hover:text-ink")}>
                          {drill.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-4 space-y-1 border-t border-line pt-4">
        <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}
          className={cx("flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium", pathname === "/settings" ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink")}>
          <SettingsIcon size={19} aria-hidden /> Settings
        </Link>
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          {!loading && (user ? (
            <Link href="/settings#account" className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/20 text-xs font-bold uppercase text-brand-text">{(user.email ?? "?").slice(0, 1)}</span>
              <span className="truncate">{user.email}</span>
            </Link>
          ) : (
            <Link href="/signin" className="flex h-9 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-ink hover:bg-surface-2"><UserRound size={17} aria-hidden /> Sign in</Link>
          ))}
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function Footer() {
  return (
    <footer className="no-print mx-auto hidden max-w-6xl px-4 pb-8 pt-4 text-xs text-ink-3 sm:px-6 lg:block lg:px-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5">
        <span className="inline-flex items-center gap-2"><LogoMark size={18} /> CountLab</span>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <a href="mailto:privacy@countlab.ca" className="hover:text-ink">Contact</a>
        <span className="ml-auto">For training and education. Gamble responsibly.</span>
      </div>
    </footer>
  );
}
