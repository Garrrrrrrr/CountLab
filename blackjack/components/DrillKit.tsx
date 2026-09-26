"use client";

import type { ReactNode } from "react";
import { Button, GhostButton } from "./ui";

/**
 * Primitives shared by the drills and the test-out exam.
 *
 * These were private to `CountingDrills.tsx` until the exam needed the same
 * heading, tray, keypad and tally helper. Importing them from there would have
 * pulled every drill into the exam's bundle, so they live here instead.
 */
export const inputClass = "field min-h-11 w-full rounded-xl px-3 text-center text-lg text-[var(--ink)] outline-none";

export function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-5 sm:mb-7"><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--accent)]">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1><p data-mobile-compact-description className="mt-2 max-w-3xl text-[var(--ink-muted)]">{description}</p></div>;
}

export function addCategory(all: Record<string, { correct: number; total: number }>, key: string, correct: boolean) {
  const next = { ...all };
  next[key] = { correct: (next[key]?.correct ?? 0) + Number(correct), total: (next[key]?.total ?? 0) + 1 };
  return next;
}

/**
 * The discard tray as a fill gauge. `size` "sm" is the compact phone tile;
 * `caption` replaces the default caption row (null hides it). Landmark labels
 * sit on opaque chips so they stay readable over the fill in either theme.
 */
export function TrayVisual({ totalDecks, remainingDecks, style = "green", landmarks = true, size = "md", caption }: {
  totalDecks: number; remainingDecks: number; style?: "green" | "red" | "smoke"; landmarks?: boolean; size?: "md" | "sm" | "xs"; caption?: ReactNode | null;
}) {
  const discarded = Math.max(0, totalDecks - remainingDecks);
  const fill = Math.min(100, discarded / totalDecks * 100);
  const colors = style === "red" ? "from-red-950 to-red-700" : style === "smoke" ? "from-zinc-900 to-zinc-600" : "from-emerald-950 to-emerald-600";
  return <div>
    <div aria-label={`${discarded.toFixed(2)} decks discarded, ${remainingDecks.toFixed(2)} decks remaining`} className={`relative ${size === "xs" ? "h-16" : size === "sm" ? "h-28" : "h-40"} overflow-hidden rounded-2xl border border-overlay/15 bg-well/40 shadow-inner [perspective:500px]`}>
      <div className={`absolute inset-x-3 bottom-2 rounded-lg bg-gradient-to-t ${colors} transition-[height] duration-500`} style={{ height: `calc(${fill}% - 8px)` }} />
      {landmarks && [25, 50, 75].map((value) => <div key={value} className="absolute inset-x-0 border-t border-dashed border-overlay/20" style={{ bottom: `${value}%` }}><span className="absolute right-2 top-0 -translate-y-1/2 rounded border border-[var(--rule)] bg-[var(--paper-raised)] px-1 text-[10px] leading-4 text-[var(--ink-muted)]">{value}%<span className={size === "md" ? "" : "sr-only"}> discarded</span></span></div>)}
      <div className="absolute inset-0 rounded-2xl ring-8 ring-well/20 [transform:rotateX(-4deg)]" />
    </div>
    {caption === undefined
      ? <div className="mt-2 flex justify-between text-xs text-[var(--ink-muted)]"><span>Discard tray</span><span>Fill shows cards already dealt</span></div>
      : caption !== null && <div className="mt-2 text-xs text-[var(--ink-muted)]">{caption}</div>}
  </div>;
}

export function NumericPad({ value, onChange, onSubmit, decimal = false }: { value: string; onChange: (v: string) => void; onSubmit: () => void; decimal?: boolean }) {
  const press = (key: string) => {
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === "sign") return onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    if (key === "." && value.includes(".")) return;
    onChange(`${value}${key}`);
  };
  return <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2 sm:hidden" aria-label="Number pad">
    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "sign", "0", decimal ? "." : "back"].map((key) => <GhostButton className="min-h-11" type="button" key={key} onClick={() => press(key)}>{key === "sign" ? "+/-" : key === "back" ? "Delete" : key}</GhostButton>)}
    {decimal && <GhostButton className="min-h-11" type="button" onClick={() => press("back")}>Delete</GhostButton>}
    <Button className={decimal ? "col-span-2 min-h-11" : "col-span-3 min-h-11"} type="button" onClick={onSubmit}>Submit</Button>
  </div>;
}
