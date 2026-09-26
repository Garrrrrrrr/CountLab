"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";

export type TabItem<T extends string> = { value: T; label: ReactNode; step?: number };

/**
 * Equal-width ARIA tabs that never scroll sideways, each tied to its own
 * panel. Arrow keys, Home and End move between tabs and select them.
 */
export function TabList<T extends string>({ label, value, onChange, items, idFor, panelIdFor, className = "", selectedRef }: { label: string; value: T; onChange: (value: T) => void; items: ReadonlyArray<TabItem<T>>; idFor: (value: T) => string; panelIdFor: (value: T) => string; className?: string; selectedRef?: Ref<HTMLButtonElement> }) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.value === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    document.getElementById(idFor(items[next].value))?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={move} className={`grid gap-1 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="tab"
            id={idFor(item.value)}
            aria-selected={selected}
            aria-controls={panelIdFor(item.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={`pressable flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:flex-row sm:gap-2 sm:text-sm ${selected ? "bg-[var(--ink)] text-[var(--paper)] shadow-sm" : "text-[var(--ink-muted)] hover:bg-overlay/[.06] hover:text-[var(--ink)]"}`}
          >
            {item.step !== undefined && (
              <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-data text-[.68rem] ${selected ? "bg-[var(--paper)] text-[var(--ink)]" : "border border-[var(--rule)]"}`}>{item.step}</span>
            )}
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
