"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { JournalCumulativePoint } from "@/lib/blackjack/journalAnalysis";
import { compactMoney, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";

type Point = JournalCumulativePoint & { band: [number, number] };

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] px-3 py-2 text-xs leading-5 text-[var(--ink)] shadow-lg">
      <p className="font-semibold">{shortDate(point.date)} · session {point.index}</p>
      <p><span className="text-[var(--ink-muted)]">Actual</span> <b className="font-data">{signedMoney(point.actual)}</b></p>
      <p><span className="text-[var(--ink-muted)]">Expected</span> <b className="font-data">{signedMoney(point.theoretical)}</b></p>
      <p className="text-[var(--ink-muted)]">95% range {signedMoney(point.lower)} to {signedMoney(point.upper)}</p>
    </div>
  );
}

/**
 * Cumulative results against expectation and its 95% modeled outcome range.
 * Plotted by session number so sessions on the same day don't collide, and
 * coloured only with theme tokens. The totals are in text above it, so the
 * chart is a picture (role="img") with no keyboard stops of its own.
 */
export function ResultsChart({ points, label }: { points: JournalCumulativePoint[]; label: string }) {
  const data: Point[] = points.map((point) => ({ ...point, band: [point.lower, point.upper] }));
  const dateOf = (index: number) => data[Math.round(index) - 1]?.date;
  return (
    <figure className="m-0 min-w-0">
      <figcaption aria-hidden="true" className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--accent)]" />Actual</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-[var(--ink-muted)]" />Expected</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)]" />95% modeled outcome range</span>
      </figcaption>
      <div role="img" aria-label={label} className="h-52 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="index"
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDecimals={false}
              tickFormatter={(value: number) => { const date = dateOf(value); return date ? shortDate(date) : ""; }}
              tick={{ fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-data)" }}
              stroke="var(--rule)"
              minTickGap={28}
            />
            <YAxis tickFormatter={compactMoney} width={56} tick={{ fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-data)" }} stroke="var(--rule)" />
            <ReferenceLine y={0} stroke="var(--ink-muted)" strokeOpacity={0.5} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--ink-muted)", strokeDasharray: "3 3" }} isAnimationActive={false} />
            <Area dataKey="band" type="monotone" stroke="none" fill="var(--accent)" fillOpacity={0.14} isAnimationActive={false} activeDot={false} />
            <Line dataKey="theoretical" type="monotone" stroke="var(--ink-muted)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="actual" type="monotone" stroke="var(--accent)" strokeWidth={2.5} dot={data.length <= 12 ? { r: 3, fill: "var(--accent)", strokeWidth: 0 } : false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
