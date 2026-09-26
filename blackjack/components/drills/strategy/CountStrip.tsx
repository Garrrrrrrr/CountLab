import { HelpTip } from "@/components/ui";
import { countText } from "@/lib/blackjack/indexDrill";

/**
 * The count at the table. The true count decides the play, so it leads; the
 * running count and decks left show how it was reached. The edge takes the
 * count's temperature colour, while the text stays in ink for contrast.
 */
export function CountStrip({ tc, rc, tone, decksLeft = 3 }: { tc: number; rc: number; tone: string; decksLeft?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-l-4 border-[var(--rule)] bg-[var(--paper)] px-3 py-2 sm:px-4" style={{ borderLeftColor: tone }}>
      <div className="flex items-baseline gap-2">
        <span className="flex items-center text-xs font-semibold uppercase tracking-[.08em] text-[var(--ink-muted)]">
          True count
          <HelpTip label="True count">The running count divided by the decks left to play. Index plays are keyed to it.</HelpTip>
        </span>
        <span className="font-data text-3xl font-semibold text-[var(--ink)]">{countText(tc)}</span>
      </div>
      <p className="font-data text-xs text-[var(--ink-muted)]">Running count {countText(rc)} ÷ {decksLeft} decks left</p>
    </div>
  );
}
