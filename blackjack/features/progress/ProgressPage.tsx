"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, CircleCheck, Circle, Download, Flame } from "lucide-react";
import { Button, ButtonLink, Card, EmptyState, PageHeader, Stat, toast } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { useSessions } from "@/lib/hooks/useSessions";
import { countingBenchmarkDetails } from "@/lib/blackjack/countingTraining";
import { storage, type Session } from "@/lib/statistics/storage";
import { computeStreak, practiceHeatmap } from "@/lib/statistics/streaks";
import { DRILL_ICON, READY_AT, drillForType, drillStats, timeAgo, type DrillStats } from "@/features/train/drillMeta";

const DAY = 86_400_000;

/** Old links in stored benchmark data point at /training/*; the drills now live under /train/. */
const modernHref = (href: string) => href.replace(/^\/training\/h17-chart/, "/train/chart-recall").replace(/^\/training\//, "/train/");

export function ProgressPage() {
  const sessions = useSessions();
  const stats = useMemo(() => drillStats(sessions), [sessions]);
  const streak = useMemo(() => computeStreak(sessions), [sessions]);
  const heatmap = useMemo(() => practiceHeatmap(streak.practiceDays, 16), [streak.practiceDays]);
  const monthly = useMemo(() => {
    const recent = sessions.filter((session) => Date.now() - new Date(session.date).getTime() < 30 * DAY);
    const questions = recent.reduce((sum, session) => sum + session.questions, 0);
    const correct = recent.reduce((sum, session) => sum + session.correct, 0);
    return { sessions: recent.length, questions, accuracy: questions ? Math.round((correct / questions) * 100) : null };
  }, [sessions]);

  if (!sessions.length) {
    return (
      <div>
        <PageHeader title="Progress" sub="Accuracy, speed and readiness across every drill." />
        <EmptyState icon={<Flame size={22} aria-hidden />} title="Nothing to show yet" action={<ButtonLink href="/train">Start training</ButtonLink>}>
          Finish a drill and your accuracy, streak and table-readiness show up here.
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Progress" sub="Accuracy, speed and readiness across every drill."
        actions={<Button variant="secondary" size="sm" icon={<Download size={16} aria-hidden />} onClick={() => {
          const url = URL.createObjectURL(new Blob([storage.exportCsv()], { type: "text/csv" }));
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `countlab-training-${new Date().toISOString().slice(0, 10)}.csv`;
          anchor.click();
          URL.revokeObjectURL(url);
          toast("CSV downloaded", "pos");
        }}>CSV</Button>} />

      <Card className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Stat label="Sessions, 30 days" value={monthly.sessions} sub={`${sessions.length} all time`} />
        <Stat label="Answers, 30 days" value={monthly.questions.toLocaleString()} />
        <Stat label="Accuracy, 30 days" value={monthly.accuracy === null ? "—" : `${monthly.accuracy}%`} tone={monthly.accuracy !== null && monthly.accuracy >= 95 ? "pos" : undefined} />
        <Stat label="Streak" value={`${streak.currentStreakDays} day${streak.currentStreakDays === 1 ? "" : "s"}`} sub={`Best ${streak.bestStreakDays}`} tone={streak.currentStreakDays > 0 ? "brand" : undefined} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Readiness sessions={sessions} stats={stats} />
          <section aria-labelledby="drills-heading">
            <h2 id="drills-heading" className="text-lg font-semibold">By drill</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {stats.map((entry) => <li key={entry.drill.slug}><DrillForm stats={entry} /></li>)}
            </ul>
          </section>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold">Practice days</h2>
            <p className="mt-0.5 text-sm text-ink-3">{streak.practiceDaysThisWeek} this week · last 16 weeks</p>
            <div className="mt-3 flex gap-[3px] overflow-hidden" role="img" aria-label={`Practised on ${streak.practiceDays.length} days`}>
              {heatmap.map((week, index) => (
                <div key={index} className="flex flex-1 flex-col gap-[3px]">
                  {week.map((day) => <div key={day.date} title={day.date} className={cx("aspect-square w-full rounded-[3px]", day.practiced ? "bg-brand" : "bg-surface-3")} />)}
                </div>
              ))}
            </div>
          </Card>
          <WeakSpots sessions={sessions} />
          <RecentSessions sessions={sessions.slice(0, 8)} />
        </div>
      </div>
    </div>
  );
}

function Readiness({ sessions, stats }: { sessions: Session[]; stats: DrillStats[] }) {
  const counting = countingBenchmarkDetails(sessions);
  const play = stats.filter((entry) => ["basic-strategy", "deviations"].includes(entry.drill.slug)).map((entry) => ({
    label: `${entry.drill.name} at ${READY_AT[entry.drill.slug]}% or better`,
    met: entry.ready,
    latest: entry.recent === null ? "Not tried yet" : `${entry.recent}% over recent sessions`,
    href: entry.drill.href,
  }));
  const items = [
    ...counting.map((detail) => ({ label: detail.label, met: detail.met, latest: detail.latest, href: modernHref(detail.practiceHref || detail.href) })),
    ...play,
  ];
  const met = items.filter((item) => item.met).length;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Table readiness</h2>
          <p className="mt-0.5 text-sm text-ink-3">The benchmarks most players aim for before playing for real money.</p>
        </div>
        <p className="tnum shrink-0 text-2xl font-semibold">{met}<span className="text-base text-ink-3">/{items.length}</span></p>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {items.map((item) => (
          <li key={item.label}>
            <Link href={item.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
              {item.met ? <CircleCheck size={20} className="shrink-0 text-pos" aria-label="Met" /> : <Circle size={20} className="shrink-0 text-ink-3" aria-label="Not met yet" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-ink-3">{item.latest}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DrillForm({ stats }: { stats: DrillStats }) {
  const { drill, sessions, recent, last, ready } = stats;
  const Icon = DRILL_ICON[drill.slug];
  const bars = sessions.slice(0, 10).reverse();
  return (
    <Link href={drill.href} className="card flex h-full flex-col gap-3 p-4 hover:border-line-strong">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2"><Icon size={18} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{drill.name}</span>
          <span className="block text-xs text-ink-3">{last ? `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${timeAgo(last.date)}` : "Not tried yet"}</span>
        </span>
        <span className={cx("tnum text-lg font-semibold", ready ? "text-pos" : "text-ink")}>{recent === null ? "—" : `${recent}%`}</span>
      </div>
      {bars.length > 1 && (
        <div className="flex h-10 items-end gap-1" role="img" aria-label={`Last ${bars.length} sessions: ${bars.map((session) => `${session.accuracy}%`).join(", ")}`}>
          {bars.map((session) => (
            <div key={session.id} className={cx("flex-1 rounded-sm", session.accuracy >= READY_AT[drill.slug] ? "bg-pos/70" : "bg-brand/70")} style={{ height: `${Math.max(8, session.accuracy)}%` }} />
          ))}
        </div>
      )}
    </Link>
  );
}

/** Categories under 90% in the last 30 days with enough attempts to mean something. */
function WeakSpots({ sessions }: { sessions: Session[] }) {
  const spots = useMemo(() => {
    const totals = new Map<string, { drill: Session["drill"]; category: string; correct: number; total: number }>();
    for (const session of sessions) {
      if (Date.now() - new Date(session.date).getTime() > 30 * DAY) continue;
      for (const [category, value] of Object.entries(session.categories ?? {})) {
        const key = `${session.drill}:${category}`;
        const entry = totals.get(key) ?? { drill: session.drill, category, correct: 0, total: 0 };
        entry.correct += value.correct;
        entry.total += value.total;
        totals.set(key, entry);
      }
    }
    return [...totals.values()].filter((entry) => entry.total >= 5 && entry.correct / entry.total < 0.9)
      .sort((a, b) => a.correct / a.total - b.correct / b.total).slice(0, 5);
  }, [sessions]);
  if (!spots.length) return null;
  return (
    <Card>
      <h2 className="text-base font-semibold">Weak spots</h2>
      <p className="mt-0.5 text-sm text-ink-3">Last 30 days, below 90%.</p>
      <ul className="mt-3 space-y-2.5">
        {spots.map((spot) => {
          const drill = drillForType(spot.drill);
          const pct = Math.round((spot.correct / spot.total) * 100);
          return (
            <li key={`${spot.drill}:${spot.category}`} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{spot.category}</span>
                <span className="block text-xs text-ink-3">{drill?.name ?? spot.drill} · {spot.correct}/{spot.total}</span>
              </span>
              <span className="tnum font-semibold text-neg">{pct}%</span>
              {drill && <Link href={drill.href} className="text-xs font-semibold text-brand-text">Drill</Link>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RecentSessions({ sessions }: { sessions: Session[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold">Recent sessions</h2>
      <ul className="mt-2 divide-y divide-line">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{drillForType(session.drill)?.name ?? session.drill}</span>
              <span className="block text-xs text-ink-3">{timeAgo(session.date)} · {session.correct}/{session.questions}</span>
            </span>
            <span className="tnum font-semibold">{session.accuracy}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
