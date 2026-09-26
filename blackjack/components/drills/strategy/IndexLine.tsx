import { ACTION_STYLE } from "@/lib/blackjack/actionStyles";
import type { DeviationAction } from "@/lib/blackjack/deviations";
import { countText, indexAnswerName, indexDomain, indexLineLabel, indexRuleText, indexSegments, type IndexHand } from "@/lib/blackjack/indexDrill";

const SEGMENT_STYLE: Record<DeviationAction, string> = {
  ...ACTION_STYLE,
  I: "border-teal-800 bg-teal-700 text-white",
  N: "border-[var(--ink-muted)] bg-[var(--paper)] text-[var(--ink)]",
};

/**
 * Where the index sits relative to this count: a true-count number line split
 * into the basic-strategy play and the index play, a tick at the index, and a
 * marker at the count on the table. The range widens to keep far indices
 * (early surrender's -5 and +8) and the count on the scale.
 */
export function IndexLine({ hand }: { hand: IndexHand }) {
  const { min, max } = indexDomain(hand.index, hand.tc);
  const span = max - min + 1;
  const at = (value: number) => ((Math.max(min - 0.5, Math.min(max + 0.5, value)) - (min - 0.5)) / span) * 100;
  const segments = indexSegments({ baseline: hand.baseline, departure: hand.departure, atOrBelow: hand.atOrBelow }, hand.index, hand.always);
  const boundary = hand.always ? undefined : hand.atOrBelow ? hand.index + 0.5 : hand.index - 0.5;
  return (
    <div role="img" aria-label={indexLineLabel(hand)} className="min-w-0">
      <p className="text-sm font-medium text-[var(--ink)]">{indexRuleText(hand)}</p>
      <div className="relative mt-6 pb-5">
        <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap font-data text-[.7rem] font-semibold text-[var(--ink)]" style={{ left: `${at(hand.tc)}%` }}>
          {countText(hand.tc)} ▼
        </span>
        <div className="relative flex h-7 overflow-hidden rounded-md">
          {segments.map((segment) => {
            const left = at(segment.from === -Infinity ? min - 0.5 : segment.from - 0.5);
            const right = at(segment.to === Infinity ? max + 0.5 : segment.to + 0.5);
            return (
              <span key={segment.from} className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border px-1 text-[.7rem] font-semibold ${SEGMENT_STYLE[segment.action]}`} style={{ left: `${left}%`, width: `${right - left}%` }}>
                <span className="truncate">{indexAnswerName(segment.action, hand.kind)}</span>
              </span>
            );
          })}
        </div>
        <span className="absolute top-0 h-7 w-0.5 -translate-x-1/2 bg-[var(--ink)]" style={{ left: `${at(hand.tc)}%` }} />
        {boundary !== undefined && (
          <span className="absolute top-7 -translate-x-1/2 whitespace-nowrap pt-0.5 font-data text-[.65rem] text-[var(--ink-muted)]" style={{ left: `${at(boundary)}%` }}>
            index {countText(hand.index)}
          </span>
        )}
        <span className="absolute left-0 top-7 pt-0.5 font-data text-[.65rem] text-[var(--ink-muted)]">{countText(min)}</span>
        <span className="absolute right-0 top-7 pt-0.5 font-data text-[.65rem] text-[var(--ink-muted)]">{countText(max)}</span>
      </div>
    </div>
  );
}
