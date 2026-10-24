"use client";
import { cx } from "@/components/ui";
import { signedCount } from "@/lib/strategy";

export interface LadderBand {
  from: number;
  to: number;
  /** "Stand", "Take insurance". */
  label: string;
  /** "S", "Take": shown when the band is narrow. */
  short: string;
  /** Fill and ink classes. */
  fill: string;
}

/** "Hit at +3 or lower, stand at +4 or higher": the ladder as one sentence. */
export function describeLadder(bands: readonly LadderBand[]): string {
  if (bands.length === 1) return `${bands[0].label} at any count`;
  return bands.map((band, index) => {
    const range = index === 0 ? `at ${signedCount(band.to)} or lower` : index === bands.length - 1 ? `at ${signedCount(band.from)} or higher` : band.from === band.to ? `at ${signedCount(band.from)}` : `from ${signedCount(band.from)} to ${signedCount(band.to)}`;
    return `${index ? band.label.toLowerCase() : band.label} ${range}`;
  }).join(", ");
}

/**
 * One play across the true-count range: a bar split into the counts where
 * each play applies, the switch points numbered underneath, and a marker on
 * the count at the table. The ends are open ("−4" means −4 or lower).
 */
export function CountLadder({ bands, min, max, tc, className }: { bands: readonly LadderBand[]; min: number; max: number; tc: number; className?: string }) {
  const span = max - min + 1;
  const left = (value: number) => ((value - min) / span) * 100;
  const marker = left(Math.max(min, Math.min(max, tc))) + 50 / span;
  const sentence = `${describeLadder(bands)}. The count here is ${signedCount(tc)}.`;
  return (
    <div role="img" aria-label={sentence} className={cx("min-w-0 select-none", className)}>
      <div className="relative h-5">
        <span className="tnum absolute bottom-0 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-[0.6875rem] font-bold leading-none text-brand-text" style={{ left: `${marker}%` }}>
          TC {signedCount(tc)}
          <span className="mt-0.5 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-brand" />
        </span>
      </div>
      <div className="relative flex h-8 overflow-hidden rounded-lg">
        {bands.map((band, position) => {
          const width = ((band.to - band.from + 1) / span) * 100;
          const wide = band.to - band.from >= 2;
          return (
            <span key={band.from} className={cx("flex min-w-0 items-center justify-center overflow-hidden px-0.5 text-[0.6875rem] font-bold", position < bands.length - 1 && "border-r-2 border-surface", band.fill)} style={{ width: `${width}%` }}>
              <span className="truncate">{wide ? band.label : band.short}</span>
            </span>
          );
        })}
        <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand shadow-[0_0_0_1px_rgb(var(--surface))]" style={{ left: `${marker}%` }} />
      </div>
      <div className="tnum relative mt-1 h-4 text-[0.625rem] font-medium text-ink-3">
        <span className="absolute left-0">{signedCount(min)}</span>
        {bands.slice(1).map((band) => (
          <span key={band.from} className="absolute -translate-x-1/2 font-semibold text-ink-2" style={{ left: `${left(band.from)}%` }}>{signedCount(band.from)}</span>
        ))}
        <span className="absolute right-0">{signedCount(max)}</span>
      </div>
    </div>
  );
}
