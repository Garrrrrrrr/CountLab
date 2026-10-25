"use client";
import { useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { JournalCumulativePoint } from "@/lib/blackjack/journalAnalysis";
import { compactMoney, shortDate, signedMoney } from "@/lib/blackjack/journalFormat";
import { Segmented } from "@/components/ui";
import { toneClass } from "./model";

type Point = JournalCumulativePoint & { band: [number, number] };

/** Theme tokens as SVG paint, so the chart follows light and dark with the rest of the page. */
const ACTUAL = "rgb(var(--brand-text))";
const EXPECTED = "rgb(var(--ink-2))";
const BAND = "rgb(var(--brand))";
const GRID = "rgb(var(--line) / var(--line-a))";
const AXIS = "rgb(var(--ink-3))";

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink shadow-2">
      <p className="font-semibold">{point.index === 0 ? "Start" : `${shortDate(point.date)} · session ${point.index} · ${Number(point.hours.toFixed(1))}h played`}</p>
      <p className="tnum"><span className="text-ink-2">Result </span><b className={toneClass(point.actual)}>{signedMoney(point.actual)}</b></p>
      <p className="tnum"><span className="text-ink-2">Expected </span><b>{signedMoney(point.theoretical)}</b></p>
      <p className="tnum text-ink-3">95% range {signedMoney(point.lower)} to {signedMoney(point.upper)}</p>
    </div>
  );
}

type Axis = "session" | "hours";
const AXIS_KEY = "countlab:journal-chart-axis";

/**
 * Cumulative results against expectation and its 95% range, plotted by
 * session number so sessions on the same day don't collide, or by hours
 * played, where the range widens with time at the table the way the long
 * run does. The totals are in text beside it, so the chart is one picture
 * (role="img") with no keyboard stops of its own.
 */
export function ResultsChart({ points, label }: { points: JournalCumulativePoint[]; label: string }) {
  const [axis, setAxis] = useState<Axis>("session");
  // The preferred axis is a per-viewer convenience, read after mount.
  useEffect(() => {
    try { if (localStorage.getItem(AXIS_KEY) === "hours") setAxis("hours"); } catch { /* storage unavailable */ }
  }, []);
  const chooseAxis = (next: Axis) => {
    setAxis(next);
    try { localStorage.setItem(AXIS_KEY, next); } catch { /* storage unavailable */ }
  };
  const byHours = axis === "hours";
  // By hours the series starts from nothing played, so the range is seen opening out.
  const start: Point = { index: 0, hours: 0, date: points[0]?.date ?? "", actual: 0, theoretical: 0, lower: 0, upper: 0, band: [0, 0] };
  const data: Point[] = [...(byHours ? [start] : []), ...points.map((point) => ({ ...point, band: [point.lower, point.upper] as [number, number] }))];
  const dateOf = (index: number) => points[Math.round(index) - 1]?.date;
  return (
    <figure className="m-0 min-w-0">
      <Segmented<Axis> label="Plot by" hideLabel name="journal_chart_axis" size="sm" className="mb-2 w-full max-w-[16rem]" value={axis} onChange={chooseAxis}
        options={[{ value: "session", label: "By session" }, { value: "hours", label: "By hours" }]} />
      <figcaption aria-hidden className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-brand-text" />Your result</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ink-2" />Expected (EV)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand/20" />95% range</span>
      </figcaption>
      <div role="img" aria-label={label} className="h-52 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey={byHours ? "hours" : "index"}
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDecimals={byHours}
              tickFormatter={(value: number) => { if (byHours) return `${Number(value.toFixed(1))}h`; const date = dateOf(value); return date ? shortDate(date) : ""; }}
              tick={{ fill: AXIS, fontSize: 12 }}
              stroke={GRID}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis tickFormatter={compactMoney} width={52} tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke={AXIS} strokeOpacity={0.6} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} isAnimationActive={false} />
            <Area dataKey="band" type="monotone" stroke="none" fill={BAND} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
            <Line dataKey="theoretical" type="monotone" stroke={EXPECTED} strokeDasharray="5 4" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: EXPECTED, stroke: "rgb(var(--surface))", strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="actual" type="monotone" stroke={ACTUAL} strokeWidth={2.25} dot={data.length <= 12 ? { r: 3.5, fill: ACTUAL, stroke: "rgb(var(--surface))", strokeWidth: 2 } : false} activeDot={{ r: 5, fill: ACTUAL, stroke: "rgb(var(--surface))", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
