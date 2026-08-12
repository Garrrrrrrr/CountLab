"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
const groups = [
  {
    label: "",
    items: [
      ["Dashboard", "/dashboard", "fa-house"],
      ["EV & Risk Lab", "/analysis", "fa-calculator"],
      ["Bankroll Recommender", "/bankroll", "fa-sack-dollar"],
    ],
  },
  {
    label: "Training",
    items: [
      ["Running Count", "/training/running-count", "fa-bolt"],
      ["Basic Strategy", "/training/basic-strategy", "fa-layer-group"],
      ["Deviations", "/training/deviations", "fa-code-branch"],
      ["Full Shoe", "/training/full-shoe", "fa-shoe-prints"],
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
    [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen text-zinc-100">
      <button
        aria-label="Toggle navigation"
        onClick={() => setOpen(!open)}
        className="pressable fixed left-4 top-3.5 z-50 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/45 text-sm shadow-xl backdrop-blur-2xl lg:hidden"
      >
        <i className="fa-solid fa-bars" />
      </button>
      <aside
        className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 z-40 w-[17rem] border-r border-white/[.07] bg-[#101411]/90 p-5 shadow-[20px_0_70px_rgba(0,0,0,.18)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:translate-x-0`}
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
                    className={`pressable flex items-center gap-3 rounded-xl px-3 py-2.5 text-[.86rem] font-medium ${path === href ? "bg-white/[.09] text-white shadow-[0_1px_0_rgba(255,255,255,.05)_inset]" : "text-zinc-400 hover:bg-white/[.045] hover:text-zinc-100"}`}
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
      <main className="min-h-screen lg:pl-[17rem]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-3 bg-[#0c100d]/65 px-5 backdrop-blur-2xl [mask-image:linear-gradient(to_bottom,black_78%,transparent)] md:px-8">
          {/* This deliberately leaves the Next.js base path to return to the portfolio. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-full border border-white/[.07] bg-white/[.05] px-3 py-1 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300 hover:bg-white/[.09]"
          >
            Garrick Tse
          </a>
          <span className="rounded-full border border-white/[.07] bg-white/[.05] px-3 py-1 text-[.7rem] font-semibold tracking-[.04em] text-zinc-300">
            H17 · DAS · RSA · LS
          </span>
        </header>
        <div className="mx-auto max-w-[90rem] p-5 pb-16 md:p-8 md:pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
