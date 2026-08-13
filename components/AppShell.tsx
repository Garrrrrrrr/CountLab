"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, storage } from "@/lib/statistics/storage";
const groups = [
  {
    label: "",
    items: [
      ["Dashboard", "/dashboard", "fa-house"],
      ["EV & Risk Lab", "/analysis", "fa-calculator"],
      ["Bankroll Recommender", "/bankroll", "fa-sack-dollar"],
      ["Chase the Flush", "/chase-flush", "fa-diamond"],
    ],
  },
  {
    label: "Training",
    items: [
      ["Running Count", "/training/running-count", "fa-bolt"],
      ["True Count", "/training/true-count", "fa-divide"],
      ["Basic Strategy", "/training/basic-strategy", "fa-layer-group"],
      ["Deviations", "/training/deviations", "fa-code-branch"],
      ["Full Shoe", "/training/full-shoe", "fa-shoe-prints"],
      ["Missing Card", "/training/missing-card", "fa-eye"],
      ["Deck Estimation", "/training/deck-estimation", "fa-ruler"],
      ["Counting Benchmark", "/training/benchmark", "fa-medal"],
    ],
  },
  {
    label: "Reference",
    items: [
      ["Hi-Lo System", "/reference", "fa-book-open"],
      ["Basic Strategy", "/reference/basic-strategy", "fa-table-cells"],
      ["Index Deviations", "/reference/deviations", "fa-list"],
    ],
  },
  {
    label: "",
    items: [
      ["Statistics", "/statistics", "fa-chart-line"],
      ["Settings", "/settings", "fa-gear"],
    ],
  },
];
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname().replace(/^\/blackjack(?=\/|$)/, "") || "/dashboard",
    [open, setOpen] = useState(false),
    [rules, setRules] = useState(DEFAULT_SETTINGS),
    toggle = useRef<HTMLButtonElement>(null),
    navigation = useRef<HTMLElement>(null);
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
    const load = () => setRules(storage.settings());
    load();
    addEventListener("hilo-storage", load);
    return () => removeEventListener("hilo-storage", load);
  }, []);
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
    <div className="min-h-dvh overflow-x-clip text-zinc-100">
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
          {groups.map((group, index) => (
            <div key={index}>
              {group.label && (
                <p className="mb-2 px-3 text-[.63rem] font-bold uppercase tracking-[.18em] text-zinc-600">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(([name, href, icon]) => (
                  <Link
                    onClick={() => setOpen(false)}
                    key={href}
                    href={href}
                    className={`pressable flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === href ? "bg-white/[.09] text-white shadow-[0_1px_0_rgba(255,255,255,.05)_inset]" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}
                  >
                    <i
                      className={`fa-solid ${icon} w-4 text-center text-[.78rem]`}
                    />
                    {name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-h-dvh min-w-0 lg:pl-[17rem]">
        <header className="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-w-0 items-center justify-end gap-2 bg-[#0c100d]/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,black_82%,transparent)] sm:gap-3 sm:px-5 md:px-8">
          {/* This deliberately leaves the Next.js base path to return to the portfolio. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            aria-label="Return to Garrick Tse portfolio"
            className="pressable grid min-h-11 min-w-11 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300 hover:bg-white/[.09]"
          >
            <i className="fa-solid fa-arrow-up-right-from-square sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Garrick Tse</span>
          </a>
          <Link
            href="/settings"
            aria-label={`Current rules: ${rules.dealerHitsSoft17 ? "H17" : "S17"}, ${rules.doubleAfterSplit ? "DAS" : "No DAS"}, ${rules.resplitAces ? "RSA" : "No RSA"}, ${rules.lateSurrender ? "late surrender" : "no surrender"}. Open settings.`}
            className="pressable grid min-h-11 shrink-0 place-items-center rounded-full border border-white/[.07] bg-white/[.05] px-3 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300 hover:bg-white/[.09]"
          >
            <span className="sm:hidden">{rules.dealerHitsSoft17 ? "H17" : "S17"}</span>
            <span className="hidden sm:inline">
              {rules.dealerHitsSoft17 ? "H17" : "S17"} · {rules.doubleAfterSplit ? "DAS" : "No DAS"} · {rules.resplitAces ? "RSA" : "No RSA"} · {rules.lateSurrender ? "LS" : "No surrender"}
            </span>
          </Link>
        </header>
        <div className="mx-auto max-w-[90rem] p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-24 lg:pb-20">
          {children}
        </div>
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-white/[.08] bg-[#0c100d]/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,.3)] backdrop-blur-2xl lg:hidden"
      >
        {[
          ["Dashboard", "/dashboard", "fa-house"],
          ["Train", "/training/running-count", "fa-bolt"],
          ["Analyze", "/analysis", "fa-calculator"],
        ].map(([name, href, icon]) => {
          const active = path === href || (name === "Train" && path.startsWith("/training/"));
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
        <button
          type="button"
          aria-label="Open all navigation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={`pressable flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-[.68rem] font-medium ${open ? "text-emerald-300" : "text-zinc-500"}`}
        >
          <i className="fa-solid fa-ellipsis text-sm" aria-hidden="true" />
          More
        </button>
      </nav>
    </div>
  );
}
