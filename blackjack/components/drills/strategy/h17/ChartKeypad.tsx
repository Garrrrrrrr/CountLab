"use client";
import { MobileActionDock } from "@/components/ui";
import type { ChartSectionId } from "@/lib/blackjack/bjaH17Chart";
import { KEYPAD_ROWS, type KeypadKey } from "@/lib/blackjack/chartEntry";

/**
 * The touch keypad for the chart: a fixed six-by-three grid, so the digits
 * never move between sections. Keys never take focus (the selected cell
 * keeps it, or no input has it at all), so the system keyboard stays shut.
 */
export function ChartKeypad({ section, caption, onKey, onNext }: {
  section: ChartSectionId;
  /** "8,8 vs 9 · Pair splitting" */
  caption: string;
  onKey: (key: KeypadKey) => void;
  onNext: () => void;
}) {
  return (
    <MobileActionDock label="Chart entry keys" className="h17-keypad-dock">
      <div data-testid="h17-keypad">
        <p className="mb-1.5 truncate px-1 text-center font-data text-xs text-[var(--ink-muted)]">{caption}</p>
        <div className="grid grid-cols-6 gap-1">
          {KEYPAD_ROWS(section).flat().map((key) => key.kind === "spacer" ? <span key={key.id} aria-hidden="true" /> : (
            <button
              key={key.id}
              type="button"
              aria-label={key.label}
              title={key.meaning}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (key.kind === "next" ? onNext() : onKey(key))}
              className={`pressable flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 font-semibold leading-none shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${key.kind === "letter" ? "border-[var(--ink-muted)] bg-[var(--paper)] text-[var(--ink)]" : key.kind === "next" ? "border-[var(--ink)] bg-[var(--ink)] text-sm text-[var(--paper)]" : "border-[var(--rule)] bg-[var(--paper-raised)] text-[var(--ink)]"}`}
            >
              <span className={key.kind === "digit" || key.kind === "sign" ? "font-data text-base" : key.face.length > 2 ? "text-[.8rem]" : "text-sm"}>{key.face}</span>
              {key.meaning && <span aria-hidden="true" className="mt-0.5 max-w-full truncate text-[.55rem] font-medium text-[var(--ink-muted)]">{key.meaning}</span>}
            </button>
          ))}
        </div>
      </div>
    </MobileActionDock>
  );
}
